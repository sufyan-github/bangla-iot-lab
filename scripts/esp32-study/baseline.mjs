// ESP32 feasibility study, step 2: the baseline.
//
//   node scripts/esp32-study/baseline.mjs <folder of sketch folders> --work <build folder>
//        [--only <regular expression>] [--jobs <n>]
//
// Compiles every reference sketch with the real toolchain (PlatformIO, the
// ESP32 Arduino core and the libraries at the versions the handbook pins), and
// records which compile, and how big they are. A sketch that does not compile
// here cannot be blamed on any simulator option later.
//
// One PlatformIO project is reused for all sketches, so the core is compiled
// once. Sketches are copied into the build folder only; results (names, sizes,
// error lines) go to data/private/esp32-study/baseline.json.
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
};
const source = args[0];
const work = option('work');
if (!source || source.startsWith('--') || !work) {
  console.error(
    'usage: node scripts/esp32-study/baseline.mjs <sketch root> --work <build folder> [--only re] [--jobs n]',
  );
  process.exit(2);
}
const only = option('only') ? new RegExp(option('only')) : null;
const jobs = option('jobs') ?? '2';
const pio =
  process.env.PIO ??
  (existsSync(path.join(os.homedir(), '.venvs/iotbook/bin/pio'))
    ? path.join(os.homedir(), '.venvs/iotbook/bin/pio')
    : 'pio');

/** The versions the handbook was tested with (its software appendix). */
const PLATFORM = 'platformio/espressif32 @ 8.0.0';
const LIBRARIES = [
  'adafruit/Adafruit SSD1306 @ 2.5.17',
  'adafruit/Adafruit GFX Library @ 1.13.0',
  'adafruit/Adafruit BusIO @ 1.17.4',
  'adafruit/DHT sensor library @ 1.4.7',
  'adafruit/Adafruit Unified Sensor @ 1.1.15',
  'madhephaestus/ESP32Servo @ 3.2.1',
];

mkdirSync(work, { recursive: true });
writeFileSync(
  path.join(work, 'platformio.ini'),
  [
    '[env:esp32dev]',
    `platform = ${PLATFORM}`,
    'board = esp32dev',
    'framework = arduino',
    'lib_deps =',
    ...LIBRARIES.map((lib) => `    ${lib}`),
    '',
  ].join('\n'),
);

const out = path.resolve(import.meta.dirname, '../../data/private/esp32-study');
mkdirSync(out, { recursive: true });
const names = readdirSync(source)
  .filter((name) => statSync(path.join(source, name)).isDirectory() && (!only || only.test(name)))
  .sort();
const results = [];
const started = Date.now();

for (const [index, name] of names.entries()) {
  const src = path.join(work, 'src');
  rmSync(src, { recursive: true, force: true });
  mkdirSync(src);
  const files = readdirSync(path.join(source, name));
  const main = `${name}.ino`;
  if (!files.includes(main)) {
    // A folder of separate exercise files, not one sketch: nothing to build as a whole.
    results.push({
      name,
      compiled: false,
      skipped: 'no main sketch file',
      seconds: 0,
      flash: null,
      ram: null,
      errors: [],
    });
    console.log(`${String(index + 1).padStart(3)}/${names.length}  skip  ${name}  (no ${main})`);
    continue;
  }
  // Join the .ino files as the Arduino IDE does: the main file first, the rest in
  // alphabetical order. No function declarations are generated: the sketches are
  // written to compile without them, and generators trip over the JavaScript that
  // some sketches carry inside their web pages.
  const inos = [main, ...files.filter((file) => file.endsWith('.ino') && file !== main).sort()];
  writeFileSync(
    path.join(src, 'sketch.cpp'),
    [
      '#include <Arduino.h>',
      ...inos.flatMap((file) => [
        `#line 1 "${file}"`,
        readFileSync(path.join(source, name, file), 'utf8'),
      ]),
    ].join('\n'),
  );
  for (const file of files) {
    if (/\.(h|hpp|cpp|c)$/.test(file)) cpSync(path.join(source, name, file), path.join(src, file));
  }
  const t0 = Date.now();
  const run = spawnSync(pio, ['run', '-d', work, '-j', jobs], {
    encoding: 'utf8',
    maxBuffer: 64e6,
  });
  const log = `${run.stdout}\n${run.stderr}`;
  const size = (label) => {
    const match = new RegExp(
      `${label}:\\s+\\[[^\\]]*\\]\\s+[\\d.]+% \\(used (\\d+) bytes from (\\d+) bytes\\)`,
    ).exec(log);
    return match ? { used: Number(match[1]), of: Number(match[2]) } : null;
  };
  const result = {
    name,
    compiled: run.status === 0,
    seconds: Math.round((Date.now() - t0) / 1000),
    flash: size('Flash'),
    ram: size('RAM'),
    errors:
      run.status === 0
        ? []
        : log
            .split('\n')
            .filter((line) => /error:|fatal error|undefined reference/i.test(line))
            .slice(0, 6),
  };
  results.push(result);
  console.log(
    `${String(index + 1).padStart(3)}/${names.length}  ${result.compiled ? 'ok  ' : 'FAIL'}  ${name}  ${result.seconds}s${result.flash ? `  flash ${Math.round(result.flash.used / 1024)} kB` : ''}`,
  );
  for (const line of result.errors.slice(0, 2)) console.log(`        ${line.trim().slice(0, 160)}`);
  writeFileSync(
    path.join(out, only ? 'baseline-partial.json' : 'baseline.json'),
    `${JSON.stringify({ platform: PLATFORM, libraries: LIBRARIES, date: new Date().toISOString(), results }, null, 2)}\n`,
  );
}
const built = results.filter((result) => !result.skipped);
const passed = built.filter((result) => result.compiled).length;
console.log(
  `\n${passed} of ${built.length} sketches compiled, ${results.length - built.length} skipped, in ${Math.round((Date.now() - started) / 60000)} minutes.`,
);
