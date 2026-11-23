// Shared by the option C tools: building the board library, building a sketch
// against it, running it in the scripted world, and checking what it did.
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const root = path.resolve(import.meta.dirname, '../..');
export const library = path.join(root, 'spikes/esp32-api');
// -funsigned-char: plain char is unsigned on the ESP32's compiler, signed by default here.
export const FLAGS = [
  '-std=gnu++17',
  '-O1',
  '-w',
  '-funsigned-char',
  `-I${path.join(library, 'include')}`,
];

/** Compiles the library and the world once, into `work`. Throws if they do not compile cleanly. */
export function buildLibrary(work) {
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
    ['harness/world.cpp', 'world.o'],
  ]) {
    const built = spawnSync(
      'g++',
      [
        ...FLAGS,
        '-Wall',
        '-Wextra',
        '-Werror',
        '-c',
        path.join(library, file),
        '-o',
        path.join(work, object),
      ],
      { encoding: 'utf8' },
    );
    if (built.status !== 0) throw new Error(`${file} did not compile:\n${built.stderr}`);
  }
}

/**
 * Builds the sketch in `folder` (a main .ino named after the folder, plus any
 * other .ino and header files) into `work/sketch/program`. The files are joined
 * in the Arduino order and nothing is generated.
 */
export function buildSketch(work, folder, name = path.basename(folder)) {
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
  const program = path.join(build, 'program');
  const compile = spawnSync(
    'g++',
    [
      ...FLAGS,
      `-I${build}`,
      path.join(build, 'sketch.cpp'),
      path.join(work, 'arduino.o'),
      path.join(work, 'preferences.o'),
      path.join(work, 'world.o'),
      '-o',
      program,
    ],
    { encoding: 'utf8', maxBuffer: 32e6 },
  );
  return { ok: compile.status === 0, program, log: compile.stderr };
}

/** Runs a built sketch for `runMs` of virtual time with the given script lines. */
export function runSketch(program, { runMs = 5000, script = [] } = {}) {
  const scriptFile = `${program}.script.txt`;
  writeFileSync(scriptFile, `${script.join('\n')}\n`);
  const started = process.hrtime.bigint();
  const run = spawnSync(program, [], {
    encoding: 'utf8',
    maxBuffer: 64e6,
    timeout: 20000,
    env: { ...process.env, ESP32_RUN_MS: String(runMs), ESP32_SCRIPT: scriptFile },
  });
  const realMs = Number((process.hrtime.bigint() - started) / 1000000n);
  return {
    trace: run.stderr ?? '',
    events: parseTrace(run.stderr ?? ''),
    ok: run.status === 0,
    how:
      run.status === 0
        ? 'ran to the end of the time'
        : run.error?.code === 'ETIMEDOUT'
          ? 'did not finish in 20 real seconds'
          : `stopped by ${run.signal ?? `exit code ${run.status}`}`,
    realMs,
    serial: run.stdout ?? '',
  };
}

/** Turns a world's trace (one pin event per line) into events for check(). */
export function parseTrace(trace) {
  return trace
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [kind, us, pin, a, b, c] = line.split(' ');
      return {
        kind,
        ms: Number(us) / 1000,
        pin: Number(pin),
        a: Number(a),
        b: Number(b),
        c: Number(c),
      };
    });
}

const levelAt = (events, pin, ms) =>
  events.filter((e) => e.kind === 'D' && e.pin === pin && e.ms <= ms).at(-1)?.a ?? 0;
const pwmAt = (events, pin, ms) =>
  events.filter((e) => e.kind === 'W' && e.pin === pin && e.ms <= ms).at(-1);

/**
 * Checks one expectation against a run. Returns null when it holds, or a
 * sentence saying what was seen instead.
 *
 *   { serial: 'regex', count?: n }            the serial text matches, at least n times
 *   { noSerial: 'regex' }                     the serial text never matches
 *   { level: [pin, ms, 0|1] }                 a digital output's level at a time
 *   { halfPeriod: [pin, ms, tolerance] }      every interval between changes of a pin
 *   { highFor: [pin, us, tolerance] }         how long a pin's first high pulse lasts, in microseconds
 *   { duty: [pin, ms, fraction, tolerance] }  a PWM output's duty at a time
 *   { frequency: [pin, ms, hertz] }           a PWM output's frequency at a time
 */
export function check(run, expectation) {
  const { events, serial } = run;
  if (expectation.serial) {
    const found = [...serial.matchAll(new RegExp(expectation.serial, 'g'))].length;
    return found >= (expectation.count ?? 1)
      ? null
      : `serial matched /${expectation.serial}/ ${found} time(s)`;
  }
  if (expectation.noSerial) {
    return new RegExp(expectation.noSerial).test(serial)
      ? `serial did match /${expectation.noSerial}/`
      : null;
  }
  if (expectation.level) {
    const [pin, ms, wanted] = expectation.level;
    const seen = levelAt(events, pin, ms);
    return seen === wanted ? null : `pin ${pin} was ${seen} at ${ms} ms`;
  }
  if (expectation.halfPeriod) {
    const [pin, ms, tolerance] = expectation.halfPeriod;
    const times = events.filter((e) => e.kind === 'D' && e.pin === pin).map((e) => e.ms);
    if (times.length < 3) return `pin ${pin} changed only ${times.length} time(s)`;
    const gaps = times.slice(1).map((time, i) => time - times[i]);
    const worst = gaps.reduce((a, b) => (Math.abs(b - ms) > Math.abs(a - ms) ? b : a));
    return Math.abs(worst - ms) <= tolerance
      ? null
      : `pin ${pin} had an interval of ${worst.toFixed(3)} ms`;
  }
  if (expectation.highFor) {
    const [pin, us, tolerance] = expectation.highFor;
    const changes = events.filter((e) => e.kind === 'D' && e.pin === pin);
    const up = changes.findIndex((e) => e.a === 1);
    const down = changes[up + 1];
    if (up < 0 || !down) return `pin ${pin} never made a complete high pulse`;
    const lasted = (down.ms - changes[up].ms) * 1000;
    return Math.abs(lasted - us) <= tolerance
      ? null
      : `pin ${pin} was high for ${lasted.toFixed(0)} µs`;
  }
  if (expectation.duty) {
    const [pin, ms, fraction, tolerance] = expectation.duty;
    const seen = pwmAt(events, pin, ms);
    if (!seen) return `pin ${pin} had no PWM by ${ms} ms`;
    const duty = seen.a / seen.b;
    return Math.abs(duty - fraction) <= tolerance
      ? null
      : `pin ${pin} duty was ${duty.toFixed(4)} at ${ms} ms`;
  }
  if (expectation.frequency) {
    const [pin, ms, hertz] = expectation.frequency;
    const seen = pwmAt(events, pin, ms);
    return seen?.c === hertz ? null : `pin ${pin} frequency was ${seen?.c} at ${ms} ms`;
  }
  return `unknown expectation ${JSON.stringify(expectation)}`;
}
