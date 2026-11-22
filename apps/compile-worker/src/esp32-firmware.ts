import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { access, mkdir, readFile, rename, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runTool } from './sandbox';

/**
 * Building real ESP32 firmware from a sketch (EXPERIMENTAL), for the engine
 * that runs it in an emulator of the whole chip.
 *
 * The firmware is the sketch, Espressif's Arduino core (LGPL-2.1, built from
 * the copy in third_party/arduino-esp32 so that the source this repository
 * carries is the source that was built) and Espressif's precompiled ESP-IDF
 * libraries. The commands are the core's own recipes (its platform.txt), which
 * take their flags from files that come with those libraries.
 *
 * Needs, under ESP32_FIRMWARE_ROOT (default: PlatformIO's package folder):
 *   toolchain-xtensa-esp-elf                 the compiler
 *   framework-arduinoespressif32-esp32-libs  the precompiled libraries and their flags
 *   framework-arduinoespressif32             for its partition table tool
 *   tool-esptool                             to turn the linked program into a flash image
 */

/** Espressif's Arduino core, exactly as vendored. */
export const ESP32_CORE_DIR = fileURLToPath(
  new URL('../../../third_party/arduino-esp32/', import.meta.url),
);
export const ESP32_CORE_VERSION = '3.3.12';
const CORE_SOURCES = path.join(ESP32_CORE_DIR, 'cores/esp32');
const VARIANT = path.join(ESP32_CORE_DIR, 'variants/esp32');
/** The board the kit uses: flash wired "dio", 4 MB. */
const MEMORY_TYPE = 'dio_qspi';
const RECIPE_VERSION = 1;
/** A flash image larger than the app partition of the default layout is refused. */
export const ESP32_MAX_APP_BYTES = 0x140000;

export interface Esp32FirmwareToolchain {
  version: string;
  root: string;
  gcc: string;
  gxx: string;
  ar: string;
  /** The precompiled ESP-IDF libraries, with their include paths and flag files. */
  sdk: string;
  esptool: string;
  partitionTool: string;
}

/** Finds the toolchain, or says what is missing. */
export function findEsp32FirmwareToolchain(
  root = process.env.ESP32_FIRMWARE_ROOT ?? path.join(os.homedir(), '.platformio/packages'),
): Esp32FirmwareToolchain | { missing: string[] } {
  const bin = path.join(root, 'toolchain-xtensa-esp-elf/bin');
  const sdk = path.join(root, 'framework-arduinoespressif32-esp32-libs');
  const toolchain = {
    root,
    gcc: path.join(bin, 'xtensa-esp32-elf-gcc'),
    gxx: path.join(bin, 'xtensa-esp32-elf-g++'),
    ar: path.join(bin, 'xtensa-esp32-elf-gcc-ar'),
    sdk,
    esptool: path.join(root, 'tool-esptool/esptool'),
    partitionTool: path.join(root, 'framework-arduinoespressif32/tools/gen_esp32part.py'),
  };
  const needed = [
    toolchain.gcc,
    toolchain.gxx,
    toolchain.ar,
    toolchain.esptool,
    toolchain.partitionTool,
    path.join(sdk, 'flags/includes'),
    path.join(sdk, 'flags/ld_libs'),
    path.join(sdk, `bin/bootloader_dio_40m.elf`),
    path.join(CORE_SOURCES, 'Arduino.h'),
  ];
  const missing = needed.filter((file) => !existsSync(file));
  if (missing.length) return { missing };
  const gccVersion = execFileSync(toolchain.gcc, ['-dumpfullversion'], { encoding: 'utf8' }).trim();
  const libs = JSON.parse(readFileSync(path.join(sdk, 'package.json'), 'utf8')) as {
    version?: string;
  };
  return { ...toolchain, version: `xtensa-esp32-elf-gcc ${gccVersion} esp32-libs ${libs.version}` };
}

/** What every file of the core and the sketch is compiled with, after the language's own flag file. */
const commonFlags = (toolchain: Esp32FirmwareToolchain, sketchDir: string) => [
  '-Os',
  '-Werror=return-type',
  '-fno-diagnostics-color',
  '-DF_CPU=240000000L',
  '-DARDUINO=10812',
  '-DARDUINO_ESP32_DEV',
  '-DARDUINO_ARCH_ESP32',
  '-DARDUINO_BOARD="ESP32_DEV"',
  '-DARDUINO_VARIANT="esp32"',
  '-DARDUINO_PARTITION_default',
  '-DARDUINO_HOST_OS="linux"',
  '-DARDUINO_FQBN="esp32:esp32:esp32"',
  '-DESP32=ESP32',
  '-DCORE_DEBUG_LEVEL=0',
  '-DARDUINO_RUNNING_CORE=1',
  '-DARDUINO_EVENT_RUNNING_CORE=1',
  '-DARDUINO_USB_CDC_ON_BOOT=0',
  `@${path.join(toolchain.sdk, 'flags/defines')}`,
  `-I${sketchDir}`,
  '-iprefix',
  `${path.join(toolchain.sdk, 'include')}/`,
  `@${path.join(toolchain.sdk, 'flags/includes')}`,
  `-I${path.join(toolchain.sdk, MEMORY_TYPE, 'include')}`,
  `-I${CORE_SOURCES}`,
  `-I${VARIANT}`,
];

const flagFile = (toolchain: Esp32FirmwareToolchain, name: string) =>
  `@${path.join(toolchain.sdk, 'flags', name)}`;

export interface Esp32Core {
  /** The Arduino core as a static library. */
  archive: string;
  bootloader: string;
  partitions: string;
  key: string;
  readOnlyPaths: string[];
}

/**
 * Compiles the Arduino core once per toolchain, and makes the two images that
 * are the same for every sketch (bootloader and partition table). The core is
 * the pinned copy in this repository, so this runs outside the per-job sandbox.
 */
export async function ensureEsp32Core(
  cacheDir: string,
  toolchain: Esp32FirmwareToolchain,
): Promise<Esp32Core> {
  const sources = readdirSync(CORE_SOURCES, { recursive: true, encoding: 'utf8' })
    .filter((file) => /\.(c|cpp|S)$/.test(file))
    .sort();
  const hash = createHash('sha256').update(
    JSON.stringify([RECIPE_VERSION, toolchain.version, ESP32_CORE_VERSION, sources]),
  );
  for (const file of sources) hash.update(readFileSync(path.join(CORE_SOURCES, file)));
  const key = hash.digest('hex').slice(0, 16);
  const dir = path.join(cacheDir, 'esp32-core', key);
  const core: Esp32Core = {
    archive: path.join(dir, 'core.a'),
    bootloader: path.join(dir, 'bootloader.bin'),
    partitions: path.join(dir, 'partitions.bin'),
    key: `${toolchain.version} ${key}`,
    readOnlyPaths: [toolchain.root, ESP32_CORE_DIR, dir],
  };
  const ready = await Promise.all(
    [core.archive, core.bootloader, core.partitions].map((file) =>
      access(file).then(
        () => true,
        () => false,
      ),
    ),
  );
  if (ready.every(Boolean)) return core;

  const buildDir = `${dir}.build-${process.pid}`;
  await rm(buildDir, { recursive: true, force: true });
  await mkdir(buildDir, { recursive: true });
  const compileOne = async (file: string, index: number) => {
    const source = path.join(CORE_SOURCES, file);
    const object = `${index}-${path.basename(file)}.o`;
    const [tool, language] = file.endsWith('.cpp')
      ? [toolchain.gxx, 'cpp_flags']
      : file.endsWith('.S')
        ? [toolchain.gcc, 'S_flags']
        : [toolchain.gcc, 'c_flags'];
    const args = [
      '-c',
      flagFile(toolchain, language),
      '-w',
      ...(file.endsWith('.S') ? ['-x', 'assembler-with-cpp'] : []),
      ...commonFlags(toolchain, buildDir),
      source,
      '-o',
      object,
    ];
    const result = await runTool('none', buildDir, tool, args, 120_000);
    if (result.exitCode !== 0) throw new Error(`ESP32 core: ${file} failed\n${result.stderr}`);
    return object;
  };
  const objects: string[] = [];
  for (let i = 0; i < sources.length; i += 4) {
    objects.push(
      ...(await Promise.all(sources.slice(i, i + 4).map((file, n) => compileOne(file, i + n)))),
    );
  }
  const run = async (tool: string, args: string[], what: string) => {
    const result = await runTool('none', buildDir, tool, args, 120_000);
    if (result.exitCode !== 0) throw new Error(`ESP32 core: ${what} failed\n${result.stderr}`);
  };
  await run(toolchain.ar, ['cr', 'core.a', ...objects], 'archive');
  await run(
    toolchain.esptool,
    [
      ...['--chip', 'esp32', 'elf2image', '--flash-mode', 'dio', '--flash-freq', '40m'],
      ...['--flash-size', '4MB', '-o', 'bootloader.bin'],
      path.join(toolchain.sdk, 'bin/bootloader_dio_40m.elf'),
    ],
    'bootloader image',
  );
  await run(
    'python3',
    [
      toolchain.partitionTool,
      '-q',
      path.join(ESP32_CORE_DIR, 'tools/partitions/default.csv'),
      'partitions.bin',
    ],
    'partition table',
  );
  for (const object of objects) await rm(path.join(buildDir, object), { force: true });
  // Publish atomically; if another worker won the race its result is identical.
  await rename(buildDir, dir).catch(() => rm(buildDir, { recursive: true, force: true }));
  return core;
}

/** The three commands that turn sketch.cpp in the job folder into firmware.bin. */
export function esp32FirmwareSteps(
  toolchain: Esp32FirmwareToolchain,
  core: Esp32Core,
): { tool: string; args: string[] }[] {
  const { sdk } = toolchain;
  return [
    {
      tool: toolchain.gxx,
      args: [
        '-c',
        flagFile(toolchain, 'cpp_flags'),
        '-Wall',
        '-fno-diagnostics-show-caret',
        ...commonFlags(toolchain, '/work'),
        'sketch.cpp',
        '-o',
        'sketch.o',
      ],
    },
    {
      tool: toolchain.gxx,
      args: [
        // The libraries' own flags ask for a cross-reference table; it belongs in the map file.
        '-Wl,--Map=firmware.map',
        `-L${path.join(sdk, 'lib')}`,
        `-L${path.join(sdk, 'ld')}`,
        `-L${path.join(sdk, MEMORY_TYPE)}`,
        '-Wl,--wrap=esp_panic_handler',
        '-Wl,--wrap=esp_bt_mem_release',
        '-Wl,--wrap=esp_bt_controller_mem_release',
        '-Wl,--wrap=_ZN4chip11DeviceLayer8Internal10ESP32Utils13InitWiFiStackEv',
        '-Wl,--wrap=_Z21esp_matter_mem_callocjj',
        '-Wl,--wrap=_Z22esp_matter_mem_reallocPvj',
        '-Wl,--wrap=_Z19esp_matter_mem_freePv',
        flagFile(toolchain, 'ld_flags'),
        flagFile(toolchain, 'ld_scripts'),
        '-Wl,--start-group',
        'sketch.o',
        core.archive,
        flagFile(toolchain, 'ld_libs'),
        '-Wl,--end-group',
        '-Wl,-EL',
        '-o',
        'firmware.elf',
      ],
    },
    {
      tool: toolchain.esptool,
      args: [
        ...['--chip', 'esp32', 'elf2image', '--flash-mode', 'dio', '--flash-freq', '40m'],
        ...['--flash-size', '4MB', '--elf-sha256-offset', '0xb0'],
        ...['-o', 'firmware.bin', 'firmware.elf'],
      ],
    },
  ];
}

/** The built program as the text the lab stores: the three images, in base64, in JSON. */
export async function esp32FirmwareText(core: Esp32Core, app: Buffer): Promise<string> {
  const [bootloader, partitions] = await Promise.all([
    readFile(core.bootloader),
    readFile(core.partitions),
  ]);
  return JSON.stringify({
    format: 'esp32-firmware-1',
    bootloader: bootloader.toString('base64'),
    partitions: partitions.toString('base64'),
    app: app.toString('base64'),
  });
}
