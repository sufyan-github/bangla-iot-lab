import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { WorkerConfig } from './config';
import {
  ARDUINO_CORE_VERSION,
  ARDUINO_FLAGS,
  ARDUINO_LIBRARIES,
  AVR_EXTRA_LIBRARIES,
  CXX_FLAGS,
  ensureArduinoCore,
  type ArduinoCore,
} from './arduino-core';
import {
  ESP32_MAX_MODULE_BYTES,
  ensureEsp32Library,
  esp32BuildSteps,
  findEsp32Toolchain,
  type Esp32Library,
  type Esp32Toolchain,
} from './esp32-library';
import {
  ESP32_MAX_APP_BYTES,
  ensureEsp32Core,
  esp32FirmwareSteps,
  esp32FirmwareText,
  findEsp32FirmwareToolchain,
  type Esp32Core,
  type Esp32FirmwareToolchain,
} from './esp32-firmware';
import { runTool, type RunResult } from './sandbox';
import { sketchBuild, type SketchFile } from './sketch';

export interface CompileRequest {
  /**
   * `uno`: firmware for the ATmega328P. `esp32`: EXPERIMENTAL, a sketch built
   * against the lab's own board library into a WebAssembly module (Arduino
   * sketches only).
   */
  board: 'uno' | 'esp32';
  /**
   * For the ESP32 only, how the program will be run. `library` (the default):
   * built against the lab's own board library into a WebAssembly module.
   * `emulator`: the board's real firmware, for the emulator of the whole chip.
   */
  engine?: 'library' | 'emulator';
  /** `c`: plain avr-libc C. `arduino`: an Arduino sketch with setup() and loop(). */
  language: 'c' | 'arduino';
  source: string;
  /** Arduino sketches only: the sketch's other files, its tabs besides the main one. */
  files?: SketchFile[];
}

export interface CompileDiagnostic {
  /** The tab the message is about, when it is not the main file. */
  file?: string;
  line: number;
  column: number;
  severity: 'error' | 'warning';
  message: string;
}

export type CompileOutcome =
  /**
   * `hex` is the built program as text: Intel HEX for the UNO; for the ESP32
   * either the WebAssembly module in base64 or, for the emulator, the firmware
   * images in JSON (`flashBytes` is then the module's or the app image's size).
   */
  | { ok: true; hex: string; flashBytes: number; ramBytes: number }
  | {
      ok: false;
      reason: 'compile-error' | 'timeout' | 'program-too-large';
      diagnostics: CompileDiagnostic[];
    };

export type CompileResponse = CompileOutcome & { cached: boolean; toolchain: string };

/** Flash left for the program on an UNO after its 512-byte bootloader, and its RAM. */
const UNO_FLASH_BYTES = 32_256;
const UNO_RAM_BYTES = 2_048;

const GCC_FLAGS = [
  '-mmcu=atmega328p',
  '-DF_CPU=16000000UL',
  '-Os',
  '-std=gnu11',
  '-Wall',
  '-ffunction-sections',
  '-fdata-sections',
  '-Wl,--gc-sections',
  '-fno-diagnostics-color',
  '-fno-diagnostics-show-caret',
];
/** Bump when the build recipe changes in a way the flags do not capture. */
const RECIPE_VERSION = 2;

/** Turns gcc's "sketch.c:12:5: error: ..." lines into structured diagnostics. */
export function parseGccDiagnostics(stderr: string): CompileDiagnostic[] {
  const diagnostics: CompileDiagnostic[] = [];
  for (const line of stderr.split('\n')) {
    const match =
      /^([A-Za-z_][A-Za-z0-9_]*\.(?:c|ino|cpp|h|hpp)):(\d+):(?:(\d+):)? (?:fatal )?(error|warning): (.*)$/.exec(
        line,
      );
    if (!match) continue;
    const file = match[1]!;
    diagnostics.push({
      // The main file is sketch.ino (or sketch.c); the build's own sketch.cpp is the same file.
      ...(/^sketch\./.test(file) ? {} : { file }),
      line: Number(match[2]),
      column: Number(match[3] ?? 1),
      severity: match[4] as 'error' | 'warning',
      message: match[5]!.slice(0, 500),
    });
    if (diagnostics.length >= 50) break;
  }
  return diagnostics;
}

/**
 * Writes an Arduino sketch and its other files into a job's folder: the
 * sketch as sketch.cpp, headers and sources under their own names. Returns
 * the .c and .cpp files to compile besides sketch.cpp.
 */
async function writeSketch(jobDir: string, request: CompileRequest): Promise<string[]> {
  const build = sketchBuild(request.source, request.files ?? []);
  await writeFile(path.join(jobDir, 'sketch.cpp'), build.cpp);
  for (const file of build.written) await writeFile(path.join(jobDir, file.name), file.content);
  return build.compiled;
}

/** Simple counting semaphore so a burst of requests cannot exhaust the machine. */
class JobQueue {
  private running = 0;
  private readonly waiting: (() => void)[] = [];

  constructor(
    private readonly maxRunning: number,
    private readonly maxWaiting: number,
  ) {}

  get isFull(): boolean {
    return this.running >= this.maxRunning && this.waiting.length >= this.maxWaiting;
  }

  async run<T>(job: () => Promise<T>): Promise<T> {
    if (this.running >= this.maxRunning) {
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    }
    this.running++;
    try {
      return await job();
    } finally {
      this.running--;
      this.waiting.shift()?.();
    }
  }
}

export class QueueFullError extends Error {}

export class Compiler {
  private readonly queue: JobQueue;

  constructor(
    private readonly config: WorkerConfig,
    /** e.g. "avr-gcc 14.3.0"; part of every cache key. */
    readonly toolchain: string,
  ) {
    this.queue = new JobQueue(config.maxConcurrentJobs, config.maxQueuedJobs);
  }

  /**
   * Content address of a build: identical source built by an identical
   * toolchain with identical flags always produces identical firmware.
   */
  cacheKey(request: CompileRequest): string {
    const recipe =
      request.board === 'esp32'
        ? request.engine === 'emulator'
          ? ['esp32-firmware', this.firmwareKey ?? 'unbuilt']
          : ['esp32-library', this.esp32Key ?? 'unbuilt']
        : request.language === 'arduino'
          ? [ARDUINO_CORE_VERSION, ARDUINO_LIBRARIES, AVR_EXTRA_LIBRARIES, ARDUINO_FLAGS, CXX_FLAGS]
          : GCC_FLAGS;
    const parts = [RECIPE_VERSION, this.toolchain, recipe, request.board, request.language];
    const hash = createHash('sha256')
      .update(JSON.stringify(parts))
      .update('\0')
      .update(request.source);
    // The other files, in name order, each with its name.
    for (const file of [...(request.files ?? [])].sort((a, b) => a.name.localeCompare(b.name))) {
      hash.update('\0').update(file.name).update('\0').update(file.content);
    }
    return hash.digest('hex');
  }

  private cachePath(key: string): string {
    return path.join(this.config.cacheDir, key.slice(0, 2), `${key}.json`);
  }

  async compile(request: CompileRequest): Promise<CompileResponse> {
    // The ESP32 library's own version is part of the key, so it is built first.
    if (request.board === 'esp32') {
      await (request.engine === 'emulator' ? this.prepareEsp32Firmware() : this.prepareEsp32());
    }
    const key = this.cacheKey(request);
    const cached = await readFile(this.cachePath(key), 'utf8').catch(() => null);
    if (cached) {
      return { ...(JSON.parse(cached) as CompileOutcome), cached: true, toolchain: this.toolchain };
    }
    if (this.queue.isFull) throw new QueueFullError('compile queue is full');

    const outcome = await this.queue.run(() => this.build(request));
    // A timeout depends on machine load, so it must not be remembered.
    if (outcome.ok || outcome.reason !== 'timeout') {
      const file = this.cachePath(key);
      await mkdir(path.dirname(file), { recursive: true });
      const partial = `${file}.${process.pid}.tmp`;
      await writeFile(partial, JSON.stringify(outcome));
      await rename(partial, file); // atomic: readers never see half a file
    }
    return { ...outcome, cached: false, toolchain: this.toolchain };
  }

  private core: Promise<ArduinoCore> | undefined;

  /** Builds the Arduino core on first use (a few seconds), then reuses it. */
  prepareArduino(): Promise<ArduinoCore> {
    this.core ??= ensureArduinoCore(this.config.cacheDir, this.toolchain);
    // A failed attempt is not remembered, so fetching the core later fixes it without a restart.
    this.core.catch(() => (this.core = undefined));
    return this.core;
  }

  private esp32: Promise<{ toolchain: Esp32Toolchain; library: Esp32Library }> | undefined;
  private esp32Key: string | undefined;

  /** Finds the WebAssembly toolchain and builds the ESP32 board library on first use. */
  prepareEsp32(): Promise<{ toolchain: Esp32Toolchain; library: Esp32Library }> {
    this.esp32 ??= (async () => {
      const toolchain = findEsp32Toolchain();
      if ('missing' in toolchain) {
        throw new Error(
          `The ESP32 toolchain is incomplete. Missing: ${toolchain.missing.join(', ')}`,
        );
      }
      const library = await ensureEsp32Library(this.config.cacheDir, toolchain);
      this.esp32Key = `${toolchain.version} ${library.key}`;
      return { toolchain, library };
    })();
    this.esp32.catch(() => (this.esp32 = undefined));
    return this.esp32;
  }

  private async buildEsp32(request: CompileRequest): Promise<CompileOutcome> {
    const { sandbox, timeoutMs } = this.config;
    const { toolchain, library } = await this.prepareEsp32();
    const jobDir = await mkdtemp(path.join(tmpdir(), 'banglalab-compile-'));
    try {
      const extra = await writeSketch(jobDir, request);
      let log = '';
      for (const step of esp32BuildSteps(toolchain, library, extra)) {
        const result = await runTool(
          sandbox,
          jobDir,
          step.tool,
          step.args,
          timeoutMs,
          library.readOnlyPaths,
          toolchain.env,
        );
        if (result.timedOut) return { ok: false, reason: 'timeout', diagnostics: [] };
        log += result.stderr;
        if (result.exitCode !== 0) {
          const diagnostics = parseGccDiagnostics(log).filter((d) => d.severity === 'error');
          if (diagnostics.length === 0) {
            const missing = /undefined symbol: ([^\n]+)/.exec(log);
            const message = missing
              ? `undefined reference to '${missing[1]!.trim()}'`
              : log.trim().split('\n').slice(-3).join(' ').slice(0, 500);
            diagnostics.push({ line: 1, column: 1, severity: 'error', message });
          }
          return { ok: false, reason: 'compile-error', diagnostics };
        }
      }
      const module = await readFile(path.join(jobDir, 'sketch.wasm'));
      if (module.length > ESP32_MAX_MODULE_BYTES) {
        return { ok: false, reason: 'program-too-large', diagnostics: [] };
      }
      return { ok: true, hex: module.toString('base64'), flashBytes: module.length, ramBytes: 0 };
    } finally {
      await rm(jobDir, { recursive: true, force: true });
    }
  }

  private firmware: Promise<{ toolchain: Esp32FirmwareToolchain; core: Esp32Core }> | undefined;
  private firmwareKey: string | undefined;

  /** Finds the real ESP32 toolchain and builds the Arduino core on first use (about ten seconds). */
  prepareEsp32Firmware(): Promise<{ toolchain: Esp32FirmwareToolchain; core: Esp32Core }> {
    this.firmware ??= (async () => {
      const toolchain = findEsp32FirmwareToolchain();
      if ('missing' in toolchain) {
        throw new Error(
          `The ESP32 firmware toolchain is incomplete. Missing: ${toolchain.missing.join(', ')}`,
        );
      }
      const core = await ensureEsp32Core(this.config.cacheDir, toolchain);
      this.firmwareKey = core.key;
      return { toolchain, core };
    })();
    this.firmware.catch(() => (this.firmware = undefined));
    return this.firmware;
  }

  private async buildEsp32Firmware(request: CompileRequest): Promise<CompileOutcome> {
    const { sandbox } = this.config;
    // Linking against several hundred libraries takes longer than an UNO build.
    const timeoutMs = Math.max(this.config.timeoutMs, 30_000);
    const { toolchain, core } = await this.prepareEsp32Firmware();
    const jobDir = await mkdtemp(path.join(tmpdir(), 'banglalab-compile-'));
    try {
      const extra = await writeSketch(jobDir, request);
      let log = '';
      for (const step of esp32FirmwareSteps(toolchain, core, extra)) {
        const result = await runTool(
          sandbox,
          jobDir,
          step.tool,
          step.args,
          timeoutMs,
          core.readOnlyPaths,
          // The image tool asks where the home folder is; in the sandbox there is none.
          { HOME: '/tmp' },
        );
        if (result.timedOut) return { ok: false, reason: 'timeout', diagnostics: [] };
        log += result.stderr;
        if (result.exitCode !== 0) {
          if (/will not fit in region|region \S+ overflowed/.test(log)) {
            return { ok: false, reason: 'program-too-large', diagnostics: [] };
          }
          const diagnostics = parseGccDiagnostics(log).filter((d) => d.severity === 'error');
          if (diagnostics.length === 0) {
            diagnostics.push({
              line: 1,
              column: 1,
              severity: 'error',
              message: explainLinkError(log),
            });
          }
          return { ok: false, reason: 'compile-error', diagnostics };
        }
      }
      const app = await readFile(path.join(jobDir, 'firmware.bin'));
      if (app.length > ESP32_MAX_APP_BYTES) {
        return { ok: false, reason: 'program-too-large', diagnostics: [] };
      }
      return {
        ok: true,
        hex: await esp32FirmwareText(core, app),
        flashBytes: app.length,
        ramBytes: 0,
      };
    } finally {
      await rm(jobDir, { recursive: true, force: true });
    }
  }

  private async build(request: CompileRequest): Promise<CompileOutcome> {
    if (request.board === 'esp32') {
      return request.engine === 'emulator'
        ? this.buildEsp32Firmware(request)
        : this.buildEsp32(request);
    }
    const { sandbox, timeoutMs } = this.config;
    const jobDir = await mkdtemp(path.join(tmpdir(), 'banglalab-compile-'));
    const run = (tool: string, args: string[], readOnly: string[] = []) =>
      runTool(sandbox, jobDir, tool, args, timeoutMs, readOnly);
    try {
      let compiled!: RunResult;
      if (request.language === 'arduino') {
        const core = await this.prepareArduino();
        const extra = await writeSketch(jobDir, request);
        // The sketch, then each of its .c and .cpp files, compiled on its own.
        let warnings = '';
        for (const file of ['sketch.cpp', ...extra]) {
          const cxx = !file.endsWith('.c');
          compiled = await run(
            cxx ? 'avr-g++' : 'avr-gcc',
            [...ARDUINO_FLAGS, ...(cxx ? CXX_FLAGS : []), '-Wall', '-c', file, '-o', `${file}.o`],
            core.readOnlyPaths,
          );
          warnings += compiled.stderr;
          if (compiled.exitCode !== 0 || compiled.timedOut) break;
        }
        compiled.stderr = warnings;
        if (compiled.exitCode === 0 && !compiled.timedOut) {
          compiled = await run(
            'avr-gcc',
            [
              '-mmcu=atmega328p',
              '-Os',
              '-Wl,--gc-sections',
              '-o',
              'sketch.elf',
              'sketch.cpp.o',
              ...extra.map((file) => `${file}.o`),
              core.archive,
              '-lm',
            ],
            core.readOnlyPaths,
          );
          compiled.stderr = warnings + compiled.stderr;
        }
      } else {
        await writeFile(path.join(jobDir, 'sketch.c'), request.source);
        compiled = await run('avr-gcc', [...GCC_FLAGS, '-o', 'sketch.elf', 'sketch.c']);
      }
      if (compiled.timedOut) return { ok: false, reason: 'timeout', diagnostics: [] };
      if (compiled.exitCode !== 0) {
        // The linker refuses programs that overflow the chip's memory regions.
        if (
          /is not within region|region \S+ overflowed|will not fit in region/.test(compiled.stderr)
        ) {
          return { ok: false, reason: 'program-too-large', diagnostics: [] };
        }
        const diagnostics = parseGccDiagnostics(compiled.stderr).filter(
          (d) => d.severity === 'error',
        );
        if (diagnostics.length === 0) {
          // Linker errors and the like carry no source position.
          const message = explainLinkError(compiled.stderr);
          diagnostics.push({ line: 1, column: 1, severity: 'error', message });
        }
        return { ok: false, reason: 'compile-error', diagnostics };
      }

      const size = await run('avr-size', ['sketch.elf']);
      const sizes = /^\s*(\d+)\s+(\d+)\s+(\d+)/m.exec(size.stdout);
      if (size.exitCode !== 0 || !sizes) throw new Error(`avr-size failed: ${size.stderr}`);
      const [text, data, bss] = sizes.slice(1).map(Number) as [number, number, number];
      const flashBytes = text + data;
      const ramBytes = data + bss;
      if (flashBytes > UNO_FLASH_BYTES || ramBytes > UNO_RAM_BYTES) {
        return { ok: false, reason: 'program-too-large', diagnostics: [] };
      }

      const objcopy = await run('avr-objcopy', [
        '-O',
        'ihex',
        '-R',
        '.eeprom',
        'sketch.elf',
        'sketch.hex',
      ]);
      if (objcopy.exitCode !== 0) throw new Error(`avr-objcopy failed: ${objcopy.stderr}`);

      const hex = await readFile(path.join(jobDir, 'sketch.hex'), 'utf8');
      return { ok: true, hex, flashBytes, ramBytes };
    } finally {
      await rm(jobDir, { recursive: true, force: true });
    }
  }
}

/** Shortens a linker failure to the part a student can act on. */
function explainLinkError(stderr: string): string {
  const undefinedSymbol = /undefined reference to `([^']+)'/.exec(stderr);
  if (undefinedSymbol) return `undefined reference to '${undefinedSymbol[1]}'`;
  return stderr.trim().split('\n').slice(-3).join(' ').slice(0, 500);
}
