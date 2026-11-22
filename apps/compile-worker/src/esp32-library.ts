import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { access, mkdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runTool } from './sandbox';

/**
 * Building a sketch for the ESP32 board against the lab's own board library
 * (EXPERIMENTAL): clang compiles it to WebAssembly, and binaryen makes the
 * module pausable so the simulation can run it a slice at a time.
 *
 * Needs clang with the wasm32-wasi target, wasm-ld, wasi-libc, libc++ for
 * wasm32 and binaryen (wasm-opt). ESP32_TOOLCHAIN_ROOT names the folder they
 * are installed or unpacked under (default /).
 */

/** The board library: for now it lives with the study it came from. */
export const ESP32_LIBRARY_DIR = fileURLToPath(
  new URL('../../../spikes/esp32-api/', import.meta.url),
);
const LIBRARY_SOURCES = ['src/arduino.cpp', 'wasm/entry.cpp'];

/**
 * Libraries by other people that sketches for the kit use, built into every
 * sketch module as they are. Each is under a permissive licence and is kept,
 * unmodified, in third_party with its licence text. A student's sketch then
 * runs the same library code it would run on the board.
 */
const THIRD_PARTY = fileURLToPath(new URL('../../../third_party/', import.meta.url));
export const ESP32_EXTRA_LIBRARIES = [
  // Adafruit's DHT sensor library 1.4.7 (MIT): DHT11 and DHT22.
  { dir: path.join(THIRD_PARTY, 'adafruit-dht'), sources: ['DHT.cpp'], headers: ['DHT.h'] },
  // Adafruit's GFX graphics library 1.13.0 (BSD): drawing and text for displays.
  // Its extra fonts are not included: some come from GPL font files.
  {
    dir: path.join(THIRD_PARTY, 'adafruit-gfx'),
    sources: ['Adafruit_GFX.cpp'],
    headers: ['Adafruit_GFX.h', 'gfxfont.h', 'glcdfont.c'],
  },
  // Adafruit's SSD1306 library 2.5.17 (BSD): the kit's OLED display.
  {
    dir: path.join(THIRD_PARTY, 'adafruit-ssd1306'),
    sources: ['Adafruit_SSD1306.cpp'],
    headers: ['Adafruit_SSD1306.h', 'splash.h'],
  },
  // Two headers of Adafruit's BusIO 1.17.4 (MIT), which the graphics library's header names.
  {
    dir: path.join(THIRD_PARTY, 'adafruit-busio'),
    sources: [],
    headers: ['Adafruit_I2CDevice.h', 'Adafruit_SPIDevice.h'],
  },
] as const;
/** Every file the built library depends on, for telling when it has changed. */
function libraryFiles(): string[] {
  const headers = readdirSync(path.join(ESP32_LIBRARY_DIR, 'include')).sort();
  return [
    ...LIBRARY_SOURCES.map((file) => path.join(ESP32_LIBRARY_DIR, file)),
    ...headers.map((name) => path.join(ESP32_LIBRARY_DIR, 'include', name)),
    ...ESP32_EXTRA_LIBRARIES.flatMap((library) =>
      [...library.sources, ...library.headers].map((file) => path.join(library.dir, file)),
    ),
  ];
}
/** Bump when the build recipe changes in a way the flags and sources do not capture. */
const RECIPE_VERSION = 1;

/** The host calls a sketch may be paused inside: the ones that let time pass. */
const PAUSING_IMPORTS = ['host_delay_micros', 'host_tick', 'host_pulse_in'];
/** A sketch module larger than this is refused. Sketches are tens of kilobytes. */
export const ESP32_MAX_MODULE_BYTES = 1024 * 1024;

export interface Esp32Toolchain {
  /** e.g. "clang 21.1.8 wasm-opt 120": part of every cache key. */
  version: string;
  compiler: string;
  linker: string;
  optimiser: string;
  cxxInclude: string;
  cInclude: string;
  cxxLib: string;
  cLib: string;
  builtins: string;
  /** Folders a sandboxed build must be able to read besides /usr. */
  readOnlyPaths: string[];
  /** Extra environment for the tools: an unpacked wasm-opt needs to find its library. */
  env: Record<string, string>;
}

/** Finds the toolchain, or says what is missing. */
export function findEsp32Toolchain(
  root = process.env.ESP32_TOOLCHAIN_ROOT ?? process.env.WASI_ROOT ?? '/',
): Esp32Toolchain | { missing: string[] } {
  const base = path.join(root, 'usr/lib');
  const versions = (existsSync(base) ? readdirSync(base) : [])
    .map((name) => /^llvm-(\d+)$/.exec(name)?.[1])
    .filter((version): version is string => Boolean(version))
    .map(Number)
    .sort((a, b) => b - a);
  const files = (version: number) => {
    const llvm = path.join(base, `llvm-${version}`);
    return {
      linker: path.join(llvm, 'bin/wasm-ld'),
      cxxInclude: path.join(llvm, 'include/wasm32-wasi/c++/v1'),
      cInclude: path.join(root, 'usr/include/wasm32-wasi'),
      cxxLib: path.join(llvm, 'lib/wasm32-wasi'),
      cLib: path.join(root, 'usr/lib/wasm32-wasi'),
      builtins: path.join(llvm, `lib/clang/${version}/lib/wasi/libclang_rt.builtins-wasm32.a`),
      optimiser: path.join(root, 'usr/bin/wasm-opt'),
    };
  };
  const version =
    versions.find((v) => Object.values(files(v)).every((file) => existsSync(file))) ?? versions[0];
  if (version === undefined) return { missing: [path.join(base, 'llvm-<version>')] };
  const found = files(version);
  const missing = Object.values(found).filter((file) => !existsSync(file));
  const compiler = `/usr/bin/clang++-${version}`;
  if (!existsSync(compiler)) missing.push(compiler);
  if (missing.length) return { missing };

  const unpacked = root !== '/';
  const env: Record<string, string> = unpacked
    ? { LD_LIBRARY_PATH: path.join(root, 'usr/lib/x86_64-linux-gnu') }
    : {};
  const tool = (file: string, args: string[]) =>
    execFileSync(file, args, { encoding: 'utf8', env: { ...process.env, ...env } });
  const clang = /version (\S+)/.exec(tool(compiler, ['--version']))?.[1] ?? 'unknown';
  const optimiser = /version (\S+)/.exec(tool(found.optimiser, ['--version']))?.[1] ?? 'unknown';
  return {
    ...found,
    compiler,
    version: `clang ${clang} wasm-opt ${optimiser}`,
    readOnlyPaths: unpacked ? [root] : [],
    env,
  };
}

/**
 * Identifies what a built sketch module was made from: the sketch and the
 * board library's sources. It leaves the toolchain out on purpose, so it is the
 * same on every machine and a test can check a shipped module is not stale.
 */
export function esp32SourceHash(sketch: string): string {
  const hash = createHash('sha256').update(String(RECIPE_VERSION)).update(sketch);
  for (const file of libraryFiles()) {
    hash.update(path.basename(file)).update(readFileSync(file));
  }
  return hash.digest('hex');
}

const compileFlags = (toolchain: Esp32Toolchain) => [
  '--target=wasm32-wasi',
  '-std=gnu++17',
  '-O2',
  // Plain char is unsigned on the ESP32's compiler.
  '-funsigned-char',
  '-fno-exceptions',
  // As the ESP32's own build. Type information for classes with virtual functions would
  // also bring the standard library's error printing into every sketch.
  '-fno-rtti',
  '-fno-diagnostics-color',
  '-fno-caret-diagnostics',
  // What the ESP32's own build defines; libraries choose their ESP32 code by these.
  '-DARDUINO=10812',
  '-DESP32',
  '-DARDUINO_ARCH_ESP32',
  '-nostdinc++',
  '-isystem',
  toolchain.cxxInclude,
  '-isystem',
  toolchain.cInclude,
  `-I${path.join(ESP32_LIBRARY_DIR, 'include')}`,
  ...ESP32_EXTRA_LIBRARIES.map((library) => `-I${library.dir}`),
];

export interface Esp32Library {
  /** The compiled library objects. */
  objects: string[];
  /** Part of every sketch's cache key: changes when the library or the toolchain does. */
  key: string;
  readOnlyPaths: string[];
}

/**
 * Compiles the board library once per toolchain and library version. It is the
 * project's own code, so this step runs outside the per-job sandbox.
 */
export async function ensureEsp32Library(
  cacheDir: string,
  toolchain: Esp32Toolchain,
): Promise<Esp32Library> {
  const hash = createHash('sha256').update(
    JSON.stringify([RECIPE_VERSION, toolchain.version, compileFlags(toolchain)]),
  );
  for (const file of libraryFiles()) hash.update(path.basename(file)).update(readFileSync(file));
  const key = hash.digest('hex').slice(0, 16);
  const dir = path.join(cacheDir, 'esp32-library', key);
  /** Each source with the warnings it is held to: the lab's own code to all of them. */
  const sources = [
    ...LIBRARY_SOURCES.map((file) => ({
      file: path.join(ESP32_LIBRARY_DIR, file),
      strict: true,
    })),
    ...ESP32_EXTRA_LIBRARIES.flatMap((extra) =>
      extra.sources.map((file) => ({ file: path.join(extra.dir, file), strict: false })),
    ),
  ];
  const objects = sources.map(({ file }) => path.join(dir, `${path.basename(file)}.o`));
  const library: Esp32Library = {
    objects,
    key,
    readOnlyPaths: [
      ESP32_LIBRARY_DIR,
      ...ESP32_EXTRA_LIBRARIES.map((extra) => extra.dir),
      dir,
      ...toolchain.readOnlyPaths,
    ],
  };
  const built = await Promise.all(
    objects.map((file) =>
      access(file).then(
        () => true,
        () => false,
      ),
    ),
  );
  if (built.every(Boolean)) return library;

  const buildDir = `${dir}.build-${process.pid}`;
  await rm(buildDir, { recursive: true, force: true });
  await mkdir(buildDir, { recursive: true });
  for (const { file, strict } of sources) {
    const result = await runTool(
      'none',
      buildDir,
      toolchain.compiler,
      [
        ...compileFlags(toolchain),
        ...(strict ? ['-Wall', '-Wextra', '-Werror'] : ['-w']),
        '-c',
        file,
        '-o',
        `${path.basename(file)}.o`,
      ],
      120_000,
    );
    if (result.exitCode !== 0) {
      throw new Error(`ESP32 board library: ${file} failed\n${result.stderr}`);
    }
  }
  // Publish atomically; if another worker won the race its result is identical.
  await rename(buildDir, dir).catch(() => rm(buildDir, { recursive: true, force: true }));
  return library;
}

/** The three commands that turn sketch.cpp in the job folder into a pausable sketch.wasm. */
export function esp32BuildSteps(
  toolchain: Esp32Toolchain,
  library: Esp32Library,
): { tool: string; args: string[] }[] {
  return [
    {
      tool: toolchain.compiler,
      args: [...compileFlags(toolchain), '-Wall', '-c', 'sketch.cpp', '-o', 'sketch.o'],
    },
    {
      tool: toolchain.linker,
      args: [
        '-o',
        'sketch.wasm',
        path.join(toolchain.cLib, 'crt1-reactor.o'),
        'sketch.o',
        ...library.objects,
        `-L${toolchain.cxxLib}`,
        `-L${toolchain.cLib}`,
        '-lc++',
        '-lc++abi',
        '-lc',
        toolchain.builtins,
        // The host_* functions are left for whoever loads the module.
        '--import-undefined',
        // A library to be called into, not a program with a main().
        '--no-entry',
        '--export=_initialize',
        // Interrupt handlers are called through the function table.
        '--export-table',
        // The paused call stack is kept in memory the module hands out.
        '--export=malloc',
        '--gc-sections',
        '--strip-all',
      ],
    },
    {
      tool: toolchain.optimiser,
      args: [
        // What the compiler uses beyond the first version of WebAssembly.
        '--enable-bulk-memory',
        '--enable-nontrapping-float-to-int',
        '--enable-sign-ext',
        '--enable-mutable-globals',
        '--asyncify',
        `--pass-arg=asyncify-imports@${PAUSING_IMPORTS.map((name) => `env.${name}`).join(',')}`,
        '-O1',
        'sketch.wasm',
        '-o',
        'sketch.wasm',
      ],
    },
  ];
}
