// Option C as it would run in a browser: the board library and a sketch built
// into a WebAssembly module, with the world outside it in JavaScript.
//
// Needs clang with the wasm32-wasi target, wasm-ld, wasi-libc and libc++ for
// wasm32. On Ubuntu these are the packages lld-21, wasi-libc,
// libc++-21-dev-wasm32, libc++abi-21-dev-wasm32 and libclang-rt-21-dev-wasm32.
// WASI_ROOT names the folder they are unpacked or installed under (default /).
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { runModule } from '../../spikes/esp32-api/wasm/world.mjs';
import { FLAGS, library, parseTrace } from './lib.mjs';

const wasiRoot = process.env.WASI_ROOT ?? '/';

/** The newest LLVM under the root that has both the linker and the C++ library for wasm32. */
function findTools() {
  const base = path.join(wasiRoot, 'usr/lib');
  const versions = (existsSync(base) ? readdirSync(base) : [])
    .map((name) => /^llvm-(\d+)$/.exec(name)?.[1])
    .filter(Boolean)
    .map(Number)
    .sort((a, b) => b - a);
  const tools = (version) => {
    const llvm = path.join(base, `llvm-${version}`);
    return {
      linker: path.join(llvm, 'bin/wasm-ld'),
      cxxInclude: path.join(llvm, 'include/wasm32-wasi/c++/v1'),
      cInclude: path.join(wasiRoot, 'usr/include/wasm32-wasi'),
      cxxLib: path.join(llvm, 'lib/wasm32-wasi'),
      cLib: path.join(wasiRoot, 'usr/lib/wasm32-wasi'),
      builtins: path.join(llvm, `lib/clang/${version}/lib/wasi/libclang_rt.builtins-wasm32.a`),
      compiler: `clang++-${version}`,
      optimiser: path.join(wasiRoot, 'usr/bin/wasm-opt'),
    };
  };
  const complete = versions.find((version) =>
    Object.entries(tools(version)).every(
      ([name, file]) => name === 'compiler' || name === 'optimiser' || existsSync(file),
    ),
  );
  return tools(complete ?? versions[0] ?? 21);
}
const TOOLS = findTools();

/** What is missing from the WebAssembly toolchain, as a list of paths. Empty when it is complete. */
export function missingTools() {
  const missing = Object.entries(TOOLS)
    .filter(([name, file]) => name !== 'compiler' && name !== 'optimiser' && !existsSync(file))
    .map(([, file]) => file);
  if (spawnSync(TOOLS.compiler, ['--version']).status !== 0) missing.push(TOOLS.compiler);
  return missing;
}

const compileFlags = (optimise) => [
  '--target=wasm32-wasi',
  ...FLAGS.filter((flag) => flag !== '-O1'),
  optimise,
  '-fno-exceptions',
  '-fno-rtti',
  '-nostdinc++',
  '-isystem',
  TOOLS.cxxInclude,
  '-isystem',
  TOOLS.cInclude,
];

function compile(source, object, optimise, extra = []) {
  return spawnSync(
    TOOLS.compiler,
    [...compileFlags(optimise), ...extra, '-c', source, '-o', object],
    {
      encoding: 'utf8',
      maxBuffer: 32e6,
    },
  );
}

/** Compiles the board library and the module's entry point once, into `work`. */
export function buildLibraryWasm(work, optimise = '-O2') {
  mkdirSync(work, { recursive: true });
  for (const [file, object] of [
    ['src/arduino.cpp', 'arduino.o'],
    ['src/preferences.cpp', 'preferences.o'],
    ['src/onewire.cpp', 'onewire.o'],
    ['src/tinygps.cpp', 'tinygps.o'],
    ['src/dfplayer.cpp', 'dfplayer.o'],
    ['src/serial-ports.cpp', 'serial-ports.o'],
    ['src/spi.cpp', 'spi.o'],
    ['src/neopixel.cpp', 'neopixel.o'],
    ['wasm/entry.cpp', 'entry.o'],
  ]) {
    const built = compile(path.join(library, file), path.join(work, object), optimise, [
      '-Wall',
      '-Wextra',
      '-Werror',
    ]);
    if (built.status !== 0) throw new Error(`${file} did not compile:\n${built.stderr}`);
  }
}

/**
 * Builds the sketch in `folder` into `work/sketch/sketch.wasm`, the same way
 * lib.mjs builds it natively: the .ino files joined in the Arduino order.
 */
export function buildSketchWasm(
  work,
  folder,
  name = path.basename(folder),
  optimise = '-O2',
  { pausable = false } = {},
) {
  const build = path.join(work, 'sketch');
  rmSync(build, { recursive: true, force: true });
  mkdirSync(build, { recursive: true });
  const files = readdirSync(folder);
  const main = `${name}.ino`;
  const inos = [main, ...files.filter((file) => file.endsWith('.ino') && file !== main).sort()];
  writeFileSync(
    path.join(build, 'sketch.cpp'),
    [
      '#include <Arduino.h>',
      ...inos.flatMap((file) => [
        `#line 1 "${file}"`,
        readFileSync(path.join(folder, file), 'utf8'),
      ]),
    ].join('\n'),
  );
  for (const file of files)
    if (/\.(h|hpp)$/.test(file)) cpSync(path.join(folder, file), path.join(build, file));
  const started = process.hrtime.bigint();
  const object = path.join(build, 'sketch.o');
  const compiled = compile(path.join(build, 'sketch.cpp'), object, optimise, [`-I${build}`]);
  if (compiled.status !== 0) return { ok: false, log: compiled.stderr };
  const module = path.join(build, 'sketch.wasm');
  const linked = spawnSync(
    TOOLS.linker,
    [
      '-o',
      module,
      path.join(TOOLS.cLib, 'crt1-reactor.o'),
      object,
      path.join(work, 'arduino.o'),
      path.join(work, 'preferences.o'),
      path.join(work, 'entry.o'),
      `-L${TOOLS.cxxLib}`,
      `-L${TOOLS.cLib}`,
      '-lc++',
      '-lc++abi',
      '-lc',
      TOOLS.builtins,
      // The host_* functions are left for the loader to supply.
      '--import-undefined',
      // A library to be called into, not a program with a main().
      '--no-entry',
      '--export=_initialize',
      // The loader calls interrupt handlers through the function table.
      '--export-table',
      // A pausable module keeps its paused call stack in memory it asks for.
      ...(pausable ? ['--export=malloc'] : []),
      '--gc-sections',
      '--strip-all',
    ],
    { encoding: 'utf8', maxBuffer: 32e6 },
  );
  if (linked.status !== 0) return { ok: false, module, log: linked.stderr };
  if (pausable) {
    const paused = makePausable(module);
    if (!paused.ok) return { ok: false, module, log: paused.log };
  }
  const buildMs = Number((process.hrtime.bigint() - started) / 1000000n);
  return { ok: true, module, log: linked.stderr, buildMs };
}

/** The host functions inside which a sketch may be paused: the ones that let time pass. */
export const PAUSING_IMPORTS = ['host_delay_micros', 'host_tick', 'host_pulse_in'];

/** What is missing for making modules pausable. Empty when wasm-opt (binaryen) is there. */
export function missingPauseTools() {
  return existsSync(TOOLS.optimiser) ? [] : [TOOLS.optimiser];
}

/**
 * Rewrites a module in place so that it can be stopped inside a host call that
 * lets time pass, and carried on later from the same place (binaryen's
 * "asyncify"). The simulation needs this: it runs a sketch a millisecond at a
 * time, and a sketch's own loop never returns.
 */
export function makePausable(module) {
  const run = spawnSync(
    TOOLS.optimiser,
    [
      // What the compiler uses beyond the first version of WebAssembly. Every
      // browser the lab supports has had these for years.
      '--enable-bulk-memory',
      '--enable-nontrapping-float-to-int',
      '--enable-sign-ext',
      '--enable-mutable-globals',
      '--asyncify',
      `--pass-arg=asyncify-imports@${PAUSING_IMPORTS.map((name) => `env.${name}`).join(',')}`,
      '-O1',
      module,
      '-o',
      module,
    ],
    {
      encoding: 'utf8',
      // An unpacked toolchain keeps wasm-opt's library beside it.
      env: {
        ...process.env,
        LD_LIBRARY_PATH: [
          path.join(wasiRoot, 'usr/lib/x86_64-linux-gnu'),
          process.env.LD_LIBRARY_PATH,
        ]
          .filter(Boolean)
          .join(':'),
      },
    },
  );
  return { ok: run.status === 0, log: run.stderr };
}

/**
 * Runs a built module for `runMs` of virtual time in the JavaScript world
 * (spikes/esp32-api/wasm/world.mjs), and adds the events check() needs.
 */
export function runSketchWasm(file, scenario) {
  const run = runModule(readFileSync(file), scenario);
  return { ...run, events: parseTrace(run.trace ?? '') };
}
