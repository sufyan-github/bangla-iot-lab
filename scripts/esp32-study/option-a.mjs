// ESP32 feasibility study, step 4: option A, an emulator of the whole chip.
//
//   node scripts/esp32-study/option-a.mjs <sketch root> --work <PlatformIO folder>
//        --sim <esp32sim folder> --rom <esp32_rev300_rom.elf> --out <folder for run files>
//        [--scenarios <folder>] [--public] [--max-level n] [--only re] [--run-s n]
//
// Builds each sketch with the real toolchain (the same set-up as baseline.mjs),
// boots the real firmware in esp32sim (https://github.com/mikroverk/esp32sim,
// MIT) for the classic ESP32, and records whether it boots, what it prints,
// which pins it moves and how fast the emulator ran. Where a scenario exists for
// a sketch, its scripted inputs are given to the emulator and its checks are
// applied to what the emulator did: the same checks option C is held to.
//
// --public uses the project's own test sketches (spikes/esp32-api/tests) instead
// of the sorted reference sketches.
//
// esp32sim is somebody else's program. It is run inside a bubblewrap sandbox with
// no network and a read-only view of this computer, writing only to --out.
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
import os from 'node:os';
import path from 'node:path';
import { check, library, parseTrace, root } from './lib.mjs';

const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
};
const isPublic = args.includes('--public');
const source = isPublic ? path.join(library, 'tests') : args[0];
const work = option('work');
const sim = option('sim');
const rom = option('rom');
const out = option('out');
if (!source || source.startsWith('--') || !work || !sim || !rom || !out) {
  console.error(
    'usage: node scripts/esp32-study/option-a.mjs <sketch root> | --public  --work <folder> --sim <esp32sim folder> --rom <rom elf> --out <folder> [--scenarios folder] [--max-level n] [--only re] [--run-s n]',
  );
  process.exit(2);
}
const maxLevel = Number(option('max-level') ?? 3);
const only = option('only') ? new RegExp(option('only')) : null;
const runS = Number(option('run-s') ?? 5);
const scenarios = option('scenarios');
const pio =
  process.env.PIO ??
  (existsSync(path.join(os.homedir(), '.venvs/iotbook/bin/pio'))
    ? path.join(os.homedir(), '.venvs/iotbook/bin/pio')
    : 'pio');

const privateDir = path.join(root, 'data/private/esp32-study');
const sketches = isPublic
  ? readdirSync(source)
      .sort()
      .map((name) => ({ name, level: 0 }))
  : JSON.parse(readFileSync(path.join(privateDir, 'corpus.json'), 'utf8')).sketches.filter(
      (sketch) => sketch.level <= maxLevel,
    );
mkdirSync(out, { recursive: true });

/** Builds one sketch into the PlatformIO folder, the way baseline.mjs does. */
function buildFirmware(folder, name) {
  const src = path.join(work, 'src');
  rmSync(src, { recursive: true, force: true });
  mkdirSync(src, { recursive: true });
  const files = readdirSync(folder);
  const main = `${name}.ino`;
  const inos = [main, ...files.filter((file) => file.endsWith('.ino') && file !== main).sort()];
  writeFileSync(
    path.join(src, 'sketch.cpp'),
    [
      '#include <Arduino.h>',
      ...inos.flatMap((file) => [
        `#line 1 "${file}"`,
        readFileSync(path.join(folder, file), 'utf8'),
      ]),
    ].join('\n'),
  );
  for (const file of files)
    if (/\.(h|hpp|cpp|c)$/.test(file)) cpSync(path.join(folder, file), path.join(src, file));
  const started = Date.now();
  const run = spawnSync(pio, ['run', '-d', work, '-j', '4'], {
    encoding: 'utf8',
    maxBuffer: 64e6,
    // The project's own blink test names the board's lamp; the plain "esp32dev" board does not define it.
    env: isPublic ? { ...process.env, PLATFORMIO_BUILD_FLAGS: '-DLED_BUILTIN=2' } : process.env,
  });
  return { ok: run.status === 0, seconds: (Date.now() - started) / 1000 };
}

/** Turns scenario script lines (see harness/world.cpp) into esp32sim's actions. */
function convertScript(lines) {
  const actions = [];
  const lost = [];
  for (const line of lines) {
    const match = /^\s*([0-9.]+)\s+(\S+)\s*(.*)$/.exec(line);
    if (!match) continue;
    const seconds = (Number(match[1]) / 1000).toFixed(6);
    const [a, b] = match[3].split(/\s+/);
    if (match[2] === 'd') actions.push(`${seconds} gpio ${a} ${b}`);
    else if (match[2] === 'a') actions.push(`${seconds} adc ${a} ${(Number(b) / 1000).toFixed(4)}`);
    else if (match[2] === 's') actions.push(`${seconds} uart0 ${match[3]}`);
    else lost.push(match[2]);
  }
  return { actions, lost: [...new Set(lost)] };
}

/**
 * Turns the emulator's waveform into the trace check() reads: a D line for each
 * change of a pin. A pin that makes more than 200 changes a second is a PWM
 * output: its changes are summarised as W lines (duty, period, frequency), one
 * per cycle that differs from the last.
 */
function traceFromVcd(file, seconds) {
  if (!existsSync(file)) return '';
  const pinOf = new Map();
  const changes = new Map();
  let now = 0;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const declared = /^\$var wire 1 (\S+) gpio(\d+) \$end/.exec(line);
    if (declared) {
      pinOf.set(declared[1], Number(declared[2]));
      changes.set(Number(declared[2]), []);
    } else if (line[0] === '#')
      now = Number(line.slice(1)) / 1e6; // picoseconds to microseconds
    else if ((line[0] === '0' || line[0] === '1') && pinOf.has(line.slice(1)))
      changes.get(pinOf.get(line.slice(1))).push({ us: now, level: Number(line[0]) });
  }
  const lines = [];
  for (const [pin, list] of changes) {
    // A pin starts low in the worlds the checks were written for, so its first
    // settling to low when the sketch makes it an output is not a change.
    if (list[0]?.level === 0) list.shift();
    if (list.length <= 200 * seconds) {
      for (const change of list)
        lines.push({ us: change.us, text: `D ${Math.round(change.us)} ${pin} ${change.level}` });
      continue;
    }
    let last = '';
    for (let i = 0; i + 2 < list.length; i++) {
      if (list[i].level !== 1) continue;
      const high = list[i + 1].us - list[i].us;
      const period = list[i + 2].us - list[i].us;
      const text = `${Math.round(high * 1000)} ${Math.round(period * 1000)} ${Math.round(1e6 / period)}`;
      if (text !== last)
        lines.push({ us: list[i].us, text: `W ${Math.round(list[i].us)} ${pin} ${text}` });
      last = text;
    }
  }
  return lines
    .sort((a, b) => a.us - b.us)
    .map((line) => `${line.text}\n`)
    .join('');
}

/** Runs the firmware now in the PlatformIO folder for `seconds` of emulated time. */
function emulate(label, seconds, actions) {
  const build = path.join(work, '.pio/build/esp32dev');
  const base = path.join(out, label);
  const scriptFile = `${base}.script.txt`;
  writeFileSync(scriptFile, `${actions.join('\n')}\n`);
  rmSync(`${base}.vcd`, { force: true });
  const read = [sim, work, rom, scriptFile].flatMap((item) => ['--ro-bind', item, item]);
  const started = process.hrtime.bigint();
  const run = spawnSync(
    'bwrap',
    [
      ...['/usr', '/lib', '/lib64', '/bin'].flatMap((dir) => ['--ro-bind', dir, dir]),
      ...read,
      ...['--bind', out, out, '--dev', '/dev', '--proc', '/proc'],
      ...['--unshare-all', '--die-with-parent', '--new-session'],
      path.join(sim, 'esp32sim'),
      ...['--chip', 'esp32', '--board', 'esp32dev', '--boot', 'rom', '--console', 'uart0'],
      ...['--rom', rom, '--bootloader', path.join(build, 'bootloader.bin')],
      ...[
        '--ptable',
        path.join(build, 'partitions.bin'),
        '--app',
        path.join(build, 'firmware.bin'),
      ],
      ...['--max-seconds', String(seconds), '--no-dump', '--vcd', `${base}.vcd`],
      ...(actions.length ? ['--script', scriptFile] : []),
    ],
    { encoding: 'utf8', maxBuffer: 256e6, timeout: 600_000 },
  );
  const realMs = Number((process.hrtime.bigint() - started) / 1000000n);
  const report =
    /(\d+) \+ core1 (\d+) insns in ([\d.]+)s wall = ([\d.]+) Minsn\/s; emulated ([\d.]+)s/.exec(
      run.stderr ?? '',
    );
  // What the sketch printed: everything after the bootloader hands over.
  const console_ = run.stdout ?? '';
  const entry = console_.lastIndexOf('entry 0x');
  const serial = entry < 0 ? console_ : console_.slice(console_.indexOf('\n', entry) + 1);
  const trace = traceFromVcd(`${base}.vcd`, seconds);
  rmSync(`${base}.vcd`, { force: true }); // large, and the trace holds what is needed
  return {
    ok: run.status === 0 && Boolean(report),
    how:
      run.error?.code === 'ETIMEDOUT' ? 'did not finish in 10 real minutes' : `exit ${run.status}`,
    realMs,
    emulatedS: report ? Number(report[5]) : 0,
    instructions: report ? Number(report[1]) + Number(report[2]) : 0,
    millionPerSecond: report ? Number(report[4]) : 0,
    crashed: /Guru Meditation|abort\(\) was called|Backtrace:|Rebooting\.\.\./.test(console_),
    unimplemented: [
      ...new Set(
        (run.stderr ?? '').match(/unimplemented[^\n]{0,80}|unsupported[^\n]{0,80}/gi) ?? [],
      ),
    ].slice(0, 5),
    serial,
    trace,
    events: parseTrace(trace),
  };
}

const results = [];
for (const [index, sketch] of sketches.entries()) {
  if (only && !only.test(sketch.name)) continue;
  const folder = path.join(source, sketch.name);
  const result = { name: sketch.name, level: sketch.level };
  const built = buildFirmware(folder, sketch.name);
  result.built = built.ok;
  result.buildSeconds = Math.round(built.seconds);
  if (!built.ok) {
    results.push(result);
    console.log(`${index + 1}/${sketches.length}  FAIL  ${sketch.name}: does not build`);
    continue;
  }
  const plain = emulate(`${sketch.name}.plain`, runS, []);
  Object.assign(result, {
    ran: plain.ok,
    how: plain.how,
    crashed: plain.crashed,
    unimplemented: plain.unimplemented,
    realMs: plain.realMs,
    timesRealTime: plain.realMs ? Math.round((plain.emulatedS * 1000 * 10) / plain.realMs) / 10 : 0,
    millionPerSecond: plain.millionPerSecond,
    instructions: plain.instructions,
    serialBytes: Buffer.byteLength(plain.serial),
    pinEvents: plain.events.filter((event) => event.kind === 'D').length,
    pwmEvents: plain.events.filter((event) => event.kind === 'W').length,
  });
  const scenarioFile = isPublic
    ? path.join(folder, 'scenario.json')
    : scenarios && path.join(scenarios, `${sketch.name}.json`);
  if (scenarioFile && existsSync(scenarioFile)) {
    const scenario = JSON.parse(readFileSync(scenarioFile, 'utf8'));
    const { actions, lost } = convertScript(scenario.script ?? []);
    const run = emulate(`${sketch.name}.scenario`, (scenario.runMs ?? 5000) / 1000, actions);
    writeFileSync(path.join(out, `${sketch.name}.scenario.serial.txt`), run.serial);
    writeFileSync(path.join(out, `${sketch.name}.scenario.trace.txt`), run.trace);
    // The emulator's waveform does not carry PWM outputs, so duty and frequency
    // over time cannot be seen with this tool. Those checks are set aside, not failed.
    const seen = scenario.expect.filter((e) => !e.duty && !e.frequency);
    const failures = seen.map((expectation) => check(run, expectation)).filter(Boolean);
    result.scenario = {
      checks: seen.length,
      notObservable: scenario.expect.length - seen.length,
      held: seen.length - failures.length,
      failures,
      inputsNotGiven: lost,
      timesRealTime: run.realMs ? Math.round((run.emulatedS * 1000 * 10) / run.realMs) / 10 : 0,
    };
  }
  results.push(result);
  console.log(
    `${index + 1}/${sketches.length}  ${result.ran && !result.crashed ? 'ran ' : 'FAIL'}  ${sketch.name}: ${result.timesRealTime}x real time, ${result.millionPerSecond} Minsn/s, serial ${result.serialBytes} B, pins ${result.pinEvents}, pwm ${result.pwmEvents}` +
      (result.scenario
        ? `, checks ${result.scenario.held}/${result.scenario.checks}${result.scenario.notObservable ? ` (${result.scenario.notObservable} not observable)` : ''}${result.scenario.inputsNotGiven.length ? ` (inputs not given: ${result.scenario.inputsNotGiven.join(',')})` : ''}`
        : ''),
  );
  for (const failure of result.scenario?.failures ?? []) console.log(`        ${failure}`);
  const file = isPublic
    ? path.join(out, 'option-a-public.json')
    : path.join(privateDir, only ? 'option-a-partial.json' : 'option-a.json');
  writeFileSync(
    file,
    JSON.stringify({ date: new Date().toISOString().slice(0, 10), runS, results }, null, 1),
  );
}

const ran = results.filter((r) => r.ran && !r.crashed);
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
console.log(
  `\n${results.length} sketches: ${results.filter((r) => r.built).length} build, ${ran.length} boot and run to the end without a crash.`,
);
if (ran.length) {
  const speeds = ran.map((r) => r.timesRealTime);
  console.log(
    `Speed on this computer, native: median ${median(speeds)}x real time, slowest ${Math.min(...speeds)}x, fastest ${Math.max(...speeds)}x.`,
  );
}
const withScenario = results.filter((r) => r.scenario);
if (withScenario.length) {
  const checks = withScenario.reduce((sum, r) => sum + r.scenario.checks, 0);
  const held = withScenario.reduce((sum, r) => sum + r.scenario.held, 0);
  console.log(
    `Scenario checks: ${held} of ${checks} hold, in ${withScenario.length} sketches (${withScenario.filter((r) => r.scenario.held === r.scenario.checks).length} with every check holding).`,
  );
}
