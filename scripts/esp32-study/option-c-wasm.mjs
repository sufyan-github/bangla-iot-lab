// ESP32 feasibility study, step 3: option C built as WebAssembly.
//
//   WASI_ROOT=<toolchain> node scripts/esp32-study/option-c-wasm.mjs <sketch root> --work <build folder>
//        [--scenarios <folder>] [--max-level <n>] [--only <regular expression>] [--run-ms <n>]
//
// Builds each reference sketch twice, for the desk computer and as a
// WebAssembly module, runs both for the same board time, and compares what they
// did: the pin events and the serial text must be identical. Where a scenario
// exists for a sketch it is run as well, with its scripted inputs and checks.
// Records module size, build time, run time and the number of calls that cross
// from the module to the world. Results go to data/private/esp32-study/.
import { gzipSync } from 'node:zlib';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { buildLibrary, buildSketch, check, root, runSketch } from './lib.mjs';
import { buildLibraryWasm, buildSketchWasm, missingTools, runSketchWasm } from './wasm.mjs';

const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
};
const source = args[0];
const work = option('work');
if (!source || source.startsWith('--') || !work) {
  console.error(
    'usage: node scripts/esp32-study/option-c-wasm.mjs <sketch root> --work <build folder> [--scenarios folder] [--max-level n] [--only re] [--run-ms n]',
  );
  process.exit(2);
}
const missing = missingTools();
if (missing.length) {
  console.error(`The WebAssembly toolchain is incomplete. Missing:\n  ${missing.join('\n  ')}`);
  process.exit(2);
}
const maxLevel = Number(option('max-level') ?? 2);
const only = option('only') ? new RegExp(option('only')) : null;
const runMs = Number(option('run-ms') ?? 5000);
const scenarios = option('scenarios');

const privateDir = path.join(root, 'data/private/esp32-study');
const corpus = JSON.parse(readFileSync(path.join(privateDir, 'corpus.json'), 'utf8')).sketches;
const sketches = corpus.filter(
  (sketch) => sketch.level <= maxLevel && (!only || only.test(sketch.name)),
);

const nativeWork = path.join(work, 'native');
const wasmWork = path.join(work, 'wasm');
buildLibrary(nativeWork);
buildLibraryWasm(wasmWork);

const results = [];
for (const sketch of sketches) {
  const folder = path.join(source, sketch.name);
  const native = buildSketch(nativeWork, folder, sketch.name);
  const wasm = buildSketchWasm(wasmWork, folder, sketch.name);
  const result = { name: sketch.name, level: sketch.level, nativeBuilt: native.ok, built: wasm.ok };
  if (!wasm.ok || !native.ok) {
    result.log = (wasm.log ?? '').split('\n').slice(0, 6).join('\n');
    results.push(result);
    console.log(`FAIL  ${sketch.name}: does not build`);
    continue;
  }
  const bytes = readFileSync(wasm.module);
  const runs = [{ label: 'plain', scenario: { runMs, script: [] } }];
  const scenarioFile = scenarios && path.join(scenarios, `${sketch.name}.json`);
  if (scenarioFile && existsSync(scenarioFile))
    runs.push({ label: 'scenario', scenario: JSON.parse(readFileSync(scenarioFile, 'utf8')) });
  Object.assign(result, {
    bytes: bytes.length,
    gzipBytes: gzipSync(bytes).length,
    buildMs: wasm.buildMs,
    runs: [],
  });
  for (const { label, scenario } of runs) {
    const a = runSketch(native.program, scenario);
    const b = runSketchWasm(wasm.module, scenario);
    const failures = (scenario.expect ?? [])
      .map((expectation) => (b.ok ? check(b, expectation) : b.how))
      .filter(Boolean);
    result.runs.push({
      label,
      boardMs: scenario.runMs ?? 5000,
      ran: b.ok,
      how: b.how,
      sameTrace: a.trace === b.trace,
      sameSerial: a.serial === b.serial,
      checks: scenario.expect?.length ?? 0,
      checksFailed: failures.length,
      failures,
      nativeMs: a.realMs,
      wasmMs: Math.round(b.realMs * 100) / 100,
      compileMs: Math.round(b.compileMs * 100) / 100,
      hostCalls: b.hostCalls,
      memoryBytes: b.memoryBytes,
      events: b.events?.length ?? 0,
      serialBytes: Buffer.byteLength(b.serial ?? ''),
    });
  }
  const same = result.runs.every((run) => run.ran && run.sameTrace && run.sameSerial);
  const checked = result.runs.every((run) => run.checksFailed === 0);
  console.log(
    `${same && checked ? 'same' : 'DIFF'}  ${sketch.name}: ${bytes.length} bytes, ${result.runs.map((run) => `${run.label} ${run.wasmMs} ms`).join(', ')}`,
  );
  results.push(result);
}

mkdirSync(privateDir, { recursive: true });
const out = path.join(privateDir, only ? 'option-c-wasm-partial.json' : 'option-c-wasm.json');
writeFileSync(
  out,
  JSON.stringify(
    { date: new Date().toISOString().slice(0, 10), runMs, node: process.version, results },
    null,
    1,
  ),
);

const built = results.filter((r) => r.built);
const allRuns = built.flatMap((r) => r.runs);
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const max = (values) => Math.max(...values);
console.log(`\n${sketches.length} sketches, ${built.length} build as WebAssembly.`);
console.log(
  `${allRuns.length} runs: ${allRuns.filter((r) => r.ran).length} ran to the end, ${allRuns.filter((r) => r.sameTrace && r.sameSerial).length} identical to the native run.`,
);
const checks = allRuns.reduce((sum, r) => sum + r.checks, 0);
const failed = allRuns.reduce((sum, r) => sum + r.checksFailed, 0);
console.log(`Scenario checks: ${checks - failed} of ${checks} hold.`);
if (built.length) {
  console.log(
    `Module size: median ${median(built.map((r) => r.bytes))} bytes, largest ${max(built.map((r) => r.bytes))}; gzip median ${median(built.map((r) => r.gzipBytes))}, largest ${max(built.map((r) => r.gzipBytes))}.`,
  );
  console.log(
    `Build time: median ${median(built.map((r) => r.buildMs))} ms, longest ${max(built.map((r) => r.buildMs))} ms.`,
  );
  const plain = built.map((r) => r.runs[0]);
  console.log(
    `${runMs} ms of board time: median ${median(plain.map((r) => r.wasmMs))} ms, longest ${max(plain.map((r) => r.wasmMs))} ms (native: median ${median(plain.map((r) => r.nativeMs))}, longest ${max(plain.map((r) => r.nativeMs))}).`,
  );
  console.log(
    `Calls into the world: median ${median(plain.map((r) => r.hostCalls))}, most ${max(plain.map((r) => r.hostCalls))}.`,
  );
}
console.log(`Written to ${path.relative(root, out)}`);
