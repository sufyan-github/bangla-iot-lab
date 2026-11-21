// The ESP32 board the lab's simulation runs (Esp32SketchBoard): real sketches,
// compiled against the board library and made pausable, driving the lab's
// example circuit round the ESP32 through the ordinary simulation session.
//
// Needs the WebAssembly toolchain and wasm-opt (binaryen); see the README.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { esp32CircuitExample } from '../../packages/shared/src/index';
import { Esp32SketchBoard } from '../../packages/simulation/src/esp32-sketch-board';
import { esp32AnalogRead } from '../../packages/simulation/src/esp32-pins';
import { SimulationSession } from '../../packages/simulation/src/session';
import {
  buildLibraryWasm,
  buildSketchWasm,
  missingPauseTools,
  missingTools,
} from '../../scripts/esp32-study/wasm.mjs';

// The example circuit: LED on GPIO2 through 220 ohms, a button from GPIO4 to
// ground, a potentiometer at half way across 3.3 V with its wiper on GPIO34.
let work: string;
beforeAll(() => {
  expect([...missingTools(), ...missingPauseTools()], 'the toolchain is incomplete').toEqual([]);
  work = mkdtempSync(path.join(tmpdir(), 'esp32-board-'));
  buildLibraryWasm(work);
}, 120_000);
afterAll(() => rmSync(work, { recursive: true, force: true }));

function sketch(name: string, source: string): Uint8Array {
  const folder = path.join(work, name);
  mkdirSync(folder, { recursive: true });
  writeFileSync(path.join(folder, `${name}.ino`), source);
  const built = buildSketchWasm(work, folder, name, '-O2', { pausable: true });
  expect(built.ok, built.log).toBe(true);
  return readFileSync(built.module!);
}

/** Runs a sketch on the example circuit and returns what it needs to be examined. */
function start(bytes: Uint8Array) {
  const board = new Esp32SketchBoard(bytes);
  const session = new SimulationSession(esp32CircuitExample());
  let serial = '';
  board.onSerial((text) => (serial += text));
  session.loadProgram('ESP1', board);
  const run = (milliseconds: number, frameMs = 50) => {
    const frames = [];
    for (let t = 0; t < milliseconds; t += frameMs) {
      session.advance(frameMs);
      frames.push(session.frame());
    }
    return frames;
  };
  return { board, session, run, serial: () => serial };
}

describe('a sketch on the ESP32 board, in the simulation', () => {
  it('blinks the LED: on half the time, with the current the 3.3 V pin gives', () => {
    const { run, board } = start(
      sketch(
        'blink',
        `void setup() { pinMode(2, OUTPUT); }
void loop() { digitalWrite(2, HIGH); delay(250); digitalWrite(2, LOW); delay(250); }
`,
      ),
    );
    const frames = run(2000);
    const lit = frames.filter((frame) => frame.result.readings.LED1!.led!.state === 'on');
    expect(lit.length).toBeGreaterThanOrEqual(19);
    expect(lit.length).toBeLessThanOrEqual(21);
    const current = Math.max(...lit.map((frame) => frame.result.readings.LED1!.current));
    expect(current).toBeGreaterThan(0.004);
    expect(current).toBeLessThan(0.008);
    expect(board.stopped).toBeNull();
    expect(frames.at(-1)!.boards.ESP1!.timeMs).toBeCloseTo(2000, 3);
  }, 60_000);

  it('gives the same result every time', () => {
    const bytes = sketch(
      'ticker',
      `int n = 0;
void setup() { Serial.begin(115200); pinMode(2, OUTPUT); }
void loop() { digitalWrite(2, n % 2); Serial.printf("%d at %lu\\n", n++, millis()); delay(137); }
`,
    );
    const first = start(bytes);
    first.run(1000);
    const second = start(bytes);
    second.run(1000, 7); // sliced differently
    expect(first.serial()).toContain('0 at 0\n1 at 137\n2 at 274\n');
    expect(second.serial().startsWith(first.serial().slice(0, 60))).toBe(true);
  }, 60_000);

  it('reads a button against its pull-up, also in a loop that waits for it without a delay', () => {
    const { run, session, serial } = start(
      sketch(
        'waiter',
        `void setup() {
  Serial.begin(115200);
  pinMode(4, INPUT_PULLUP);
  Serial.println("waiting");
  while (digitalRead(4) == HIGH) {}
  Serial.printf("pressed at %lu\\n", millis());
}
void loop() { delay(100); }
`,
      ),
    );
    run(300);
    expect(serial()).toBe('waiting\r\n');
    session.update(esp32CircuitExample(), ['SW1']);
    run(100);
    expect(serial()).toMatch(/^waiting\r\npressed at 30[0-9]\n$/);
  }, 60_000);

  it('reads a voltage as the chip would, not as an ideal converter would', () => {
    const { run, serial } = start(
      sketch(
        'knob',
        `void setup() {
  Serial.begin(115200);
  delay(5);
  Serial.printf("raw %d mv %d\\n", analogRead(34), (int)analogReadMilliVolts(34));
}
void loop() { delay(100); }
`,
      ),
    );
    run(50);
    // The wiper is at half of 3.3 V. An ideal converter would say 2048.
    const expected = esp32AnalogRead(1.65);
    const [, raw, mv] = /raw (\d+) mv (\d+)/.exec(serial())!.map(Number);
    expect(Math.abs(raw! - expected.count)).toBeLessThanOrEqual(2);
    expect(Math.abs(mv! - expected.millivolts)).toBeLessThanOrEqual(2);
    expect(raw).toBeLessThan(1950);
  }, 60_000);

  it('dims the LED with PWM: a quarter of the duty gives a quarter of the current', () => {
    const full = start(
      sketch(
        'full',
        'void setup() { pinMode(2, OUTPUT); digitalWrite(2, HIGH); }\nvoid loop() { delay(100); }\n',
      ),
    );
    const fullCurrent = full.run(200).at(-1)!.result.readings.LED1!.current;
    const { run, board } = start(
      sketch(
        'dim',
        'void setup() { ledcAttach(2, 5000, 8); ledcWrite(2, 64); }\nvoid loop() { delay(100); }\n',
      ),
    );
    const frames = run(400, 100);
    const dimCurrent = frames.at(-1)!.result.readings.LED1!.current;
    expect(dimCurrent / fullCurrent).toBeGreaterThan(0.23);
    expect(dimCurrent / fullCurrent).toBeLessThan(0.27);
    expect(board.pwmOf(2)).toEqual({ duty: 64 / 255, frequency: 5000 });
    expect(frames.at(-1)!.boards.ESP1!.highFraction[2]).toBeCloseTo(64 / 255, 1);
  }, 60_000);

  it('calls an interrupt handler when the button goes down', () => {
    const { run, session, serial } = start(
      sketch(
        'counter',
        `volatile int presses = 0;
void IRAM_ATTR onPress() { presses++; }
void setup() {
  Serial.begin(115200);
  pinMode(4, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(4), onPress, FALLING);
}
void loop() { delay(200); Serial.printf("presses %d\\n", presses); }
`,
      ),
    );
    run(250);
    session.update(esp32CircuitExample(), ['SW1']);
    run(100);
    session.update(esp32CircuitExample(), []);
    run(100);
    session.update(esp32CircuitExample(), ['SW1']);
    run(300);
    expect(serial()).toContain('presses 0\n');
    expect(serial().trim().split('\n').at(-1)).toBe('presses 2');
  }, 60_000);

  it('a sketch that crashes stops, says so, and the circuit carries on', () => {
    const { run, board, serial } = start(
      sketch(
        'crash',
        'void setup() { Serial.begin(115200); Serial.println("before"); abort(); }\nvoid loop() {}\n',
      ),
    );
    const frames = run(200);
    expect(serial()).toBe('before\r\n');
    expect(board.stopped).toMatch(/crashed/);
    expect(frames.at(-1)!.timeMs).toBe(200);
  }, 60_000);

  it('refuses a module that was not built to be paused', () => {
    const folder = path.join(work, 'plain');
    mkdirSync(folder, { recursive: true });
    writeFileSync(path.join(folder, 'plain.ino'), 'void setup() {}\nvoid loop() { delay(1); }\n');
    const built = buildSketchWasm(work, folder, 'plain');
    expect(() => new Esp32SketchBoard(readFileSync(built.module!))).toThrow(/built to be paused/);
  }, 60_000);
});
