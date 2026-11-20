import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { WorkerConfig } from './config';
import { runTool } from './sandbox';

export interface CompileRequest {
  board: 'uno';
  language: 'c';
  source: string;
}

export interface CompileDiagnostic {
  line: number;
  column: number;
  severity: 'error' | 'warning';
  message: string;
}

export type CompileOutcome =
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
const RECIPE_VERSION = 1;

/** Turns gcc's "sketch.c:12:5: error: ..." lines into structured diagnostics. */
export function parseGccDiagnostics(stderr: string): CompileDiagnostic[] {
  const diagnostics: CompileDiagnostic[] = [];
  for (const line of stderr.split('\n')) {
    const match = /^sketch\.c:(\d+):(?:(\d+):)? (?:fatal )?(error|warning): (.*)$/.exec(line);
    if (!match) continue;
    diagnostics.push({
      line: Number(match[1]),
      column: Number(match[2] ?? 1),
      severity: match[3] as 'error' | 'warning',
      message: match[4]!.slice(0, 500),
    });
    if (diagnostics.length >= 50) break;
  }
  return diagnostics;
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
    const parts = [RECIPE_VERSION, this.toolchain, GCC_FLAGS, request.board, request.language];
    return createHash('sha256')
      .update(JSON.stringify(parts))
      .update('\0')
      .update(request.source)
      .digest('hex');
  }

  private cachePath(key: string): string {
    return path.join(this.config.cacheDir, key.slice(0, 2), `${key}.json`);
  }

  async compile(request: CompileRequest): Promise<CompileResponse> {
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

  private async build(request: CompileRequest): Promise<CompileOutcome> {
    const { sandbox, timeoutMs } = this.config;
    const jobDir = await mkdtemp(path.join(tmpdir(), 'banglalab-compile-'));
    try {
      await writeFile(path.join(jobDir, 'sketch.c'), request.source);

      const gcc = await runTool(
        sandbox,
        jobDir,
        'avr-gcc',
        [...GCC_FLAGS, '-o', 'sketch.elf', 'sketch.c'],
        timeoutMs,
      );
      if (gcc.timedOut) return { ok: false, reason: 'timeout', diagnostics: [] };
      if (gcc.exitCode !== 0) {
        // The linker refuses programs that overflow the chip's memory regions.
        if (/is not within region|region \S+ overflowed|will not fit in region/.test(gcc.stderr)) {
          return { ok: false, reason: 'program-too-large', diagnostics: [] };
        }
        const diagnostics = parseGccDiagnostics(gcc.stderr);
        if (diagnostics.length === 0) {
          // Linker errors and the like carry no source position.
          const message = gcc.stderr.trim().split('\n').slice(-3).join(' ').slice(0, 500);
          diagnostics.push({ line: 1, column: 1, severity: 'error', message });
        }
        return { ok: false, reason: 'compile-error', diagnostics };
      }

      const size = await runTool(sandbox, jobDir, 'avr-size', ['sketch.elf'], timeoutMs);
      const sizes = /^\s*(\d+)\s+(\d+)\s+(\d+)/m.exec(size.stdout);
      if (size.exitCode !== 0 || !sizes) throw new Error(`avr-size failed: ${size.stderr}`);
      const [text, data, bss] = sizes.slice(1).map(Number) as [number, number, number];
      const flashBytes = text + data;
      const ramBytes = data + bss;
      if (flashBytes > UNO_FLASH_BYTES || ramBytes > UNO_RAM_BYTES) {
        return { ok: false, reason: 'program-too-large', diagnostics: [] };
      }

      const objcopy = await runTool(
        sandbox,
        jobDir,
        'avr-objcopy',
        ['-O', 'ihex', '-R', '.eeprom', 'sketch.elf', 'sketch.hex'],
        timeoutMs,
      );
      if (objcopy.exitCode !== 0) throw new Error(`avr-objcopy failed: ${objcopy.stderr}`);

      const hex = await readFile(path.join(jobDir, 'sketch.hex'), 'utf8');
      return { ok: true, hex, flashBytes, ramBytes };
    } finally {
      await rm(jobDir, { recursive: true, force: true });
    }
  }
}
