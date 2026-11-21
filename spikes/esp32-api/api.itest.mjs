// Tests of the ESP32 board library prototype. Each folder in tests/ holds a small
// sketch written for this project and a scenario: inputs for the world and what
// the sketch must then do. Needs g++.
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildLibrary, buildSketch, check, runSketch } from '../../scripts/esp32-study/lib.mjs';

const tests = path.resolve(import.meta.dirname, 'tests');
let work;
beforeAll(() => {
  work = mkdtempSync(path.join(tmpdir(), 'esp32-api-'));
  buildLibrary(work); // also proves the library compiles with no warnings
}, 120_000);
afterAll(() => rmSync(work, { recursive: true, force: true }));

function run(name, scenario) {
  const built = buildSketch(work, path.join(tests, name), name);
  expect(built.ok, built.log).toBe(true);
  return runSketch(built.program, scenario);
}

describe('ESP32 board library prototype', () => {
  for (const name of readdirSync(tests).sort()) {
    it(`${name}: the sketch does what its scenario expects`, () => {
      const scenario = JSON.parse(readFileSync(path.join(tests, name, 'scenario.json'), 'utf8'));
      const result = run(name, scenario);
      expect(result.how).toBe('ran to the end of the time');
      expect(
        scenario.expect.map((expectation) => check(result, expectation)).filter(Boolean),
      ).toEqual([]);
    }, 60_000);
  }

  it('runs on a virtual clock: the same run gives the same result, far faster than real time', () => {
    const scenario = { runMs: 60_000, script: [] };
    const first = run('blink', scenario);
    const second = run('blink', scenario);
    expect(first.events).toEqual(second.events);
    expect(first.events.filter((event) => event.kind === 'D')).toHaveLength(240);
    expect(first.realMs).toBeLessThan(5000); // a minute of board time
  }, 60_000);

  it('the checker reports a sketch that does the wrong thing', () => {
    const result = run('blink', { runMs: 2000, script: [] });
    expect(check(result, { halfPeriod: [2, 500, 0.05] })).toMatch(/interval of 250/);
    expect(check(result, { level: [2, 100, 0] })).toBe('pin 2 was 1 at 100 ms');
    expect(check(result, { serial: 'anything' })).toMatch(/0 time/);
    expect(check(result, { duty: [2, 100, 0.5, 0.1] })).toMatch(/no PWM/);
  }, 60_000);

  it('a sketch that calls something the library lacks fails to build, naming it', () => {
    const folder = path.join(work, 'unsupported');
    mkdirSync(folder, { recursive: true });
    writeFileSync(
      path.join(folder, 'unsupported.ino'),
      'void setup() { notABoardFunction(4); }\nvoid loop() {}\n',
    );
    const built = buildSketch(work, folder, 'unsupported');
    expect(built.ok).toBe(false);
    // The line number is the student's own, in their own file.
    expect(built.log).toMatch(
      /unsupported\.ino:1:\d+: error: .notABoardFunction. was not declared/,
    );
  }, 60_000);
});
