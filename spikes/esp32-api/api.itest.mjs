// Tests of the ESP32 board library prototype. Each folder in tests/ holds a small
// sketch written for this project and a scenario: inputs for the world and what
// the sketch must then do. Needs g++, and for the WebAssembly half clang with
// the wasm32-wasi target, wasm-ld, wasi-libc and libc++ for wasm32 (see
// scripts/esp32-study/wasm.mjs).
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildLibrary, buildSketch, check, runSketch } from '../../scripts/esp32-study/lib.mjs';
import {
  buildLibraryWasm,
  buildSketchWasm,
  missingTools,
  runSketchWasm,
} from '../../scripts/esp32-study/wasm.mjs';

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

describe('ESP32 board library prototype, built as WebAssembly', () => {
  let wasmWork;
  beforeAll(() => {
    expect(missingTools(), 'the WebAssembly toolchain is incomplete').toEqual([]);
    wasmWork = path.join(work, 'wasm');
    buildLibraryWasm(wasmWork);
  }, 120_000);

  function build(folder, name) {
    const built = buildSketchWasm(wasmWork, folder, name);
    expect(built.ok, built.log).toBe(true);
    return built.module;
  }
  function sketch(name, source) {
    const folder = path.join(work, name);
    mkdirSync(folder, { recursive: true });
    writeFileSync(path.join(folder, `${name}.ino`), source);
    return build(folder, name);
  }

  for (const name of readdirSync(tests).sort()) {
    it(`${name}: does what its scenario expects, exactly as the native build does`, () => {
      const scenario = JSON.parse(readFileSync(path.join(tests, name, 'scenario.json'), 'utf8'));
      const native = run(name, scenario);
      const result = runSketchWasm(build(path.join(tests, name), name), scenario);
      expect(result.how).toBe('ran to the end of the time');
      expect(
        scenario.expect.map((expectation) => check(result, expectation)).filter(Boolean),
      ).toEqual([]);
      expect(result.trace).toBe(native.trace);
      expect(result.serial).toBe(native.serial);
    }, 60_000);
  }

  it('the module asks its loader only for the world and three unused system calls', () => {
    const bytes = readFileSync(build(path.join(tests, 'edges'), 'edges'));
    const imports = WebAssembly.Module.imports(new WebAssembly.Module(bytes));
    expect(imports.filter((item) => item.module === 'env').map((item) => item.name)).toSatisfy(
      (names) => names.every((name) => name.startsWith('host_')),
    );
    expect(
      imports
        .filter((item) => item.module !== 'env')
        .map((item) => `${item.module}.${item.name}`)
        .sort(),
    ).toEqual([
      'wasi_snapshot_preview1.fd_close',
      'wasi_snapshot_preview1.fd_seek',
      'wasi_snapshot_preview1.fd_write',
    ]);
  }, 60_000);

  it('basic types have the sizes they have on the board', () => {
    const module = sketch(
      'types',
      `void setup() {
  char c = 200;
  Serial.printf("int %d long %d pointer %d size %d double %d char %s\\n", (int)sizeof(int),
                (int)sizeof(long), (int)sizeof(void*), (int)sizeof(size_t), (int)sizeof(double),
                c > 0 ? "unsigned" : "signed");
}
void loop() { delay(100); }
`,
    );
    const result = runSketchWasm(module, { runMs: 200, script: [] });
    // Checked against the ESP32's own compiler: int 4, long 4, pointer 4, plain char unsigned.
    expect(result.serial).toBe('int 4 long 4 pointer 4 size 4 double 8 char unsigned\n');
  }, 60_000);

  it('a sketch that crashes stops the run and says so', () => {
    const module = sketch(
      'crash',
      'void setup() { Serial.println("before"); abort(); }\nvoid loop() {}\n',
    );
    const result = runSketchWasm(module, { runMs: 200, script: [] });
    expect(result.ok).toBe(false);
    expect(result.how).toMatch(/^stopped by /);
    expect(result.serial).toBe('before\r\n');
  }, 60_000);
});
