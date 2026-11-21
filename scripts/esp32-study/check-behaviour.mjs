// ESP32 feasibility study, step 3: does a sketch do the right thing?
//
//   node scripts/esp32-study/check-behaviour.mjs <sketch root> <scenario folder> --work <build folder>
//
// A scenario is a JSON file named after a sketch:
//   { "runMs": 5000, "script": ["1000 d 17 0", ...], "expect": [ { "level": [25, 1100, 1] }, ... ] }
// The script lines are inputs for the world (see spikes/esp32-api/harness/world.cpp)
// and each expectation is checked against what the sketch did (see lib.mjs).
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { buildLibrary, buildSketch, check, runSketch } from './lib.mjs';

const [source, scenarios] = process.argv.slice(2);
const workIndex = process.argv.indexOf('--work');
const work = workIndex >= 0 ? process.argv[workIndex + 1] : undefined;
if (!source || !scenarios || !work) {
  console.error(
    'usage: node scripts/esp32-study/check-behaviour.mjs <sketch root> <scenario folder> --work <build folder>',
  );
  process.exit(2);
}

buildLibrary(work);
let sketchesPassed = 0;
let checks = 0;
let checksPassed = 0;
const files = readdirSync(scenarios)
  .filter((file) => file.endsWith('.json'))
  .sort();
for (const file of files) {
  const name = file.replace(/\.json$/, '');
  const scenario = JSON.parse(readFileSync(path.join(scenarios, file), 'utf8'));
  const built = buildSketch(work, path.join(source, name), name);
  if (!built.ok) {
    console.log(`FAIL  ${name}: does not compile`);
    checks += scenario.expect.length;
    continue;
  }
  const run = runSketch(built.program, scenario);
  const failures = run.ok
    ? scenario.expect.map((expectation) => check(run, expectation)).filter(Boolean)
    : [run.how];
  checks += scenario.expect.length;
  checksPassed += scenario.expect.length - (run.ok ? failures.length : scenario.expect.length);
  if (failures.length === 0) sketchesPassed++;
  console.log(
    `${failures.length === 0 ? 'pass' : 'FAIL'}  ${name}: ${scenario.expect.length - failures.length}/${scenario.expect.length} checks, ${scenario.runMs ?? 5000} ms of board time in ${run.realMs} ms`,
  );
  for (const failure of failures) console.log(`        ${failure}`);
}
console.log(
  `\n${sketchesPassed} of ${files.length} sketches behave as expected; ${checksPassed} of ${checks} checks hold.`,
);
process.exit(sketchesPassed === files.length ? 0 : 1);
