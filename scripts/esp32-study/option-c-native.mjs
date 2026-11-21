// ESP32 feasibility study, step 3: option C, built for the desk computer.
//
//   node scripts/esp32-study/option-c-native.mjs <sketch root> --work <build folder>
//        [--max-level <n>] [--only <regular expression>] [--run-ms <n>]
//
// Compiles each reference sketch against the project's own board library
// (spikes/esp32-api) and runs it in a scripted world on a virtual clock. Records
// which compile, which run to the end of the time, and what they did. Needs the
// sorted list from corpus.mjs. Results go to data/private/esp32-study/.
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

const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
};
const source = args[0];
const work = option('work');
if (!source || source.startsWith('--') || !work) {
  console.error(
    'usage: node scripts/esp32-study/option-c-native.mjs <sketch root> --work <build folder> [--max-level n] [--only re] [--run-ms n]',
  );
  process.exit(2);
}
const maxLevel = Number(option('max-level') ?? 2);
const only = option('only') ? new RegExp(option('only')) : null;
const runMs = option('run-ms') ?? '5000';

const root = path.resolve(import.meta.dirname, '../..');
const library = path.join(root, 'spikes/esp32-api');
const privateDir = path.join(root, 'data/private/esp32-study');
const corpus = JSON.parse(readFileSync(path.join(privateDir, 'corpus.json'), 'utf8')).sketches;
const sketches = corpus.filter(
  (sketch) => sketch.level <= maxLevel && (!only || only.test(sketch.name)),
);

const FLAGS = [
  '-std=gnu++17',
  '-O1',
  '-w',
  '-funsigned-char',
  `-I${path.join(library, 'include')}`,
];
mkdirSync(work, { recursive: true });
// The library and the world are compiled once and linked into every sketch.
for (const [file, object] of [
  ['src/arduino.cpp', 'arduino.o'],
  ['harness/world.cpp', 'world.o'],
]) {
  const built = spawnSync(
    'g++',
    [...FLAGS, '-Wall', '-c', path.join(library, file), '-o', path.join(work, object)],
    { encoding: 'utf8' },
  );
  if (built.status !== 0) {
    console.error(built.stderr);
    process.exit(1);
  }
}

/** Names the compiler could not find: the gaps in the board library. */
function missingNames(log) {
  const names = new Set();
  for (const pattern of [
    /error: [‘']([^’']+)[’'] was not declared in this scope/g,
    /error: [‘']([^’']+)[’'] does not name a type/g,
    /has no member named [‘']([^’']+)[’']/g,
    /error: no matching function for call to [‘']([^’'(]+)/g,
    /fatal error: ([^:]+): No such file or directory/g,
    /undefined reference to [`‘]([^’'(]+)/g,
  ]) {
    for (const match of log.matchAll(pattern)) names.add(match[1].trim());
  }
  return [...names];
}

const results = [];
for (const [index, sketch] of sketches.entries()) {
  const folder = path.join(source, sketch.name);
  const build = path.join(work, 'sketch');
  rmSync(build, { recursive: true, force: true });
  mkdirSync(build);
  const files = readdirSync(folder);
  const main = `${sketch.name}.ino`;
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

  const program = path.join(build, 'program');
  const compile = spawnSync(
    'g++',
    [
      ...FLAGS,
      `-I${build}`,
      path.join(build, 'sketch.cpp'),
      path.join(work, 'arduino.o'),
      path.join(work, 'world.o'),
      '-o',
      program,
    ],
    { encoding: 'utf8', maxBuffer: 32e6 },
  );
  const result = {
    name: sketch.name,
    level: sketch.level,
    compiled: compile.status === 0,
    missing: [],
    ran: false,
    how: '',
    realMs: 0,
    serialBytes: 0,
    pinEvents: 0,
    pwmEvents: 0,
  };
  if (!result.compiled) {
    result.missing = missingNames(compile.stderr);
    result.how =
      compile.stderr
        .split('\n')
        .find((line) => /error/.test(line))
        ?.replace(/^.*sketch\//, '')
        .slice(0, 200) ?? 'compile failed';
  } else {
    const script = path.join(privateDir, 'scripts', `${sketch.name}.txt`);
    const started = process.hrtime.bigint();
    const run = spawnSync(program, [], {
      encoding: 'utf8',
      maxBuffer: 64e6,
      timeout: 20000,
      env: {
        ...process.env,
        ESP32_RUN_MS: runMs,
        ...(existsSync(script) ? { ESP32_SCRIPT: script } : {}),
      },
    });
    result.realMs = Number((process.hrtime.bigint() - started) / 1000000n);
    result.ran = run.status === 0;
    result.how =
      run.status === 0
        ? 'ran to the end of the time'
        : run.error?.code === 'ETIMEDOUT'
          ? 'did not finish in 20 real seconds'
          : `stopped by ${run.signal ?? `exit code ${run.status}`}`;
    result.serialBytes = run.stdout?.length ?? 0;
    const events = (run.stderr ?? '').split('\n');
    result.pinEvents = events.filter((line) => line.startsWith('D ')).length;
    result.pwmEvents = events.filter((line) => line.startsWith('W ')).length;
    if (existsSync(build)) {
      writeFileSync(path.join(build, 'serial.txt'), run.stdout ?? '');
      writeFileSync(path.join(build, 'events.txt'), run.stderr ?? '');
    }
  }
  results.push(result);
  console.log(
    `${String(index + 1).padStart(3)}/${sketches.length}  L${result.level}  ${result.compiled ? (result.ran ? 'ok   ' : 'RUN  ') : 'BUILD'}  ${sketch.name}  ${result.compiled ? `${result.realMs} ms, serial ${result.serialBytes} B, pin ${result.pinEvents}, pwm ${result.pwmEvents}` : result.how}`,
  );
}

mkdirSync(privateDir, { recursive: true });
writeFileSync(
  path.join(privateDir, only ? 'option-c-native-partial.json' : 'option-c-native.json'),
  `${JSON.stringify({ date: new Date().toISOString(), runMs: Number(runMs), results }, null, 2)}\n`,
);

console.log('');
for (let level = 1; level <= maxLevel; level++) {
  const at = results.filter((result) => result.level === level);
  if (at.length === 0) continue;
  console.log(
    `level ${level}: ${at.length} sketches, ${at.filter((r) => r.compiled).length} compile, ${at.filter((r) => r.ran).length} run to the end`,
  );
}
const gaps = new Map();
for (const result of results)
  for (const name of result.missing) gaps.set(name, (gaps.get(name) ?? 0) + 1);
if (gaps.size > 0) {
  console.log('\nMissing from the board library, by number of sketches:');
  for (const [name, count] of [...gaps.entries()].sort((a, b) => b[1] - a[1]))
    console.log(`  ${String(count).padStart(3)}  ${name}`);
}
const silent = results
  .filter((r) => r.ran && r.serialBytes === 0 && r.pinEvents === 0 && r.pwmEvents === 0)
  .map((r) => r.name);
if (silent.length > 0) console.log(`\nRan but did nothing visible: ${silent.join(', ')}`);
