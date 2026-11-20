import { createHash } from 'node:crypto';
import { access, mkdir, readdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { runTool } from './sandbox';

/** Release of ArduinoCore-avr fetched by scripts/fetch-arduino-core.sh. */
export const ARDUINO_CORE_VERSION = '1.8.8';

const VENDOR_DIR = path.resolve(import.meta.dirname, '../vendor');
const CORE_ROOT = path.join(VENDOR_DIR, 'ArduinoCore-avr');
export const CORE_SOURCE_DIR = path.join(CORE_ROOT, 'cores/arduino');
export const VARIANT_DIR = path.join(CORE_ROOT, 'variants/standard');

/**
 * Libraries a sketch may `#include`, fetched by the same script as the core.
 * They are compiled into the core archive, so the linker takes only what a
 * sketch actually uses.
 */
export const ARDUINO_LIBRARIES = [
  { name: 'Servo', version: '1.3.0', include: 'Servo/src', sources: ['Servo/src/avr/Servo.cpp'] },
  {
    name: 'LiquidCrystal',
    version: '1.0.7',
    include: 'LiquidCrystal/src',
    sources: ['LiquidCrystal/src/LiquidCrystal.cpp'],
  },
] as const;

/** Flags shared by the core and by sketches, for an UNO (ATmega328P at 16 MHz). */
export const ARDUINO_FLAGS = [
  '-mmcu=atmega328p',
  '-DF_CPU=16000000UL',
  '-DARDUINO=10819',
  '-DARDUINO_AVR_UNO',
  '-DARDUINO_ARCH_AVR',
  '-Os',
  '-ffunction-sections',
  '-fdata-sections',
  '-fno-diagnostics-color',
  '-fno-diagnostics-show-caret',
  `-I${CORE_SOURCE_DIR}`,
  `-I${VARIANT_DIR}`,
  ...ARDUINO_LIBRARIES.map((library) => `-I${path.join(VENDOR_DIR, library.include)}`),
];
export const CXX_FLAGS = [
  '-std=gnu++11',
  '-fno-exceptions',
  '-fno-threadsafe-statics',
  '-fpermissive',
];

export interface ArduinoCore {
  /** Static library holding the compiled core. */
  archive: string;
  /** Directories a sandboxed sketch build must be able to read. */
  readOnlyPaths: string[];
}

/**
 * Compiles the Arduino core once per toolchain into a static library, so each
 * sketch build only compiles the sketch and links. The core is trusted code
 * from the pinned release, so this step runs outside the per-job sandbox.
 */
export async function ensureArduinoCore(cacheDir: string, toolchain: string): Promise<ArduinoCore> {
  await access(path.join(CORE_SOURCE_DIR, 'Arduino.h')).catch(() => {
    throw new Error(
      'ArduinoCore-avr is missing. Run: bash apps/compile-worker/scripts/fetch-arduino-core.sh',
    );
  });
  const key = createHash('sha256')
    .update(
      JSON.stringify([
        ARDUINO_CORE_VERSION,
        ARDUINO_LIBRARIES,
        toolchain,
        ARDUINO_FLAGS,
        CXX_FLAGS,
      ]),
    )
    .digest('hex')
    .slice(0, 16);
  const dir = path.join(cacheDir, 'arduino-core', key);
  const archive = path.join(dir, 'core.a');
  const core = { archive, readOnlyPaths: [VENDOR_DIR, dir] };
  if (
    await access(archive).then(
      () => true,
      () => false,
    )
  )
    return core;

  const buildDir = `${dir}.build-${process.pid}`;
  await rm(buildDir, { recursive: true, force: true });
  await mkdir(buildDir, { recursive: true });
  for (const library of ARDUINO_LIBRARIES) {
    await access(path.join(VENDOR_DIR, library.sources[0])).catch(() => {
      throw new Error(
        `Arduino library ${library.name} is missing. Run: bash apps/compile-worker/scripts/fetch-arduino-core.sh`,
      );
    });
  }
  const sources = [
    ...(await readdir(CORE_SOURCE_DIR))
      .filter((f) => /\.(c|cpp|S)$/.test(f))
      .map((f) => path.join(CORE_SOURCE_DIR, f)),
    ...ARDUINO_LIBRARIES.flatMap((library) => library.sources.map((f) => path.join(VENDOR_DIR, f))),
  ];
  const compileOne = async (file: string) => {
    const flags = file.endsWith('.cpp')
      ? [...ARDUINO_FLAGS, ...CXX_FLAGS]
      : file.endsWith('.S')
        ? [...ARDUINO_FLAGS, '-x', 'assembler-with-cpp']
        : [...ARDUINO_FLAGS, '-std=gnu11'];
    const tool = file.endsWith('.cpp') ? 'avr-g++' : 'avr-gcc';
    const object = `${path.basename(file)}.o`;
    const args = [...flags, '-w', '-c', file, '-o', object];
    const result = await runTool('none', buildDir, tool, args, 120_000);
    if (result.exitCode !== 0) throw new Error(`Arduino core: ${file} failed\n${result.stderr}`);
    return object;
  };
  const objects: string[] = [];
  for (let i = 0; i < sources.length; i += 4) {
    objects.push(...(await Promise.all(sources.slice(i, i + 4).map(compileOne))));
  }
  const ar = await runTool('none', buildDir, 'avr-gcc-ar', ['rcs', 'core.a', ...objects], 60_000);
  if (ar.exitCode !== 0) throw new Error(`Arduino core: archive failed\n${ar.stderr}`);

  // Publish atomically; if another worker won the race its result is identical.
  await rename(buildDir, dir).catch(() => rm(buildDir, { recursive: true, force: true }));
  return core;
}
