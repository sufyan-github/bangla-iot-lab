// A sketch module driving a real simulated circuit: the world's pins are
// connected to the lab's own circuit solver instead of to a script.
//
// The lab has no ESP32 board part yet, so the circuit is the existing example
// built round the UNO-compatible board, used as a stand-in: its sockets, its
// 5 V supply and its pin resistances. This measures how a sketch module and the
// solver work together and what that costs. It says nothing about how an ESP32
// pin behaves electrically.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PinDrive } from '../../packages/board-emulators/src/index';
import { unoCircuitExample } from '../../packages/shared/src/index';
import { LOGIC_HIGH, LOGIC_LOW } from '../../packages/simulation/src/library';
import { solveState, type StateSolution } from '../../packages/simulation/src/simulate';
import {
  buildLibraryWasm,
  buildSketchWasm,
  missingTools,
} from '../../scripts/esp32-study/wasm.mjs';
import { runModule } from './wasm/world.mjs';

const OUTPUT = 0x03;
const INPUT_PULLUP = 0x05;

// LED on socket 13 through 220 ohms, a button from socket 2 to ground, and a
// potentiometer across the supply with its wiper, at half way, on socket A0 (14).
const SKETCH = `
const int LED = 13, BUTTON = 2, KNOB = 14;
int presses = 0;
bool wasDown = false;
void setup() {
  pinMode(LED, OUTPUT);
  pinMode(BUTTON, INPUT_PULLUP);
  Serial.printf("knob %d mV\\n", (int)analogReadMilliVolts(KNOB));
}
void loop() {
  digitalWrite(LED, HIGH);
  delay(250);
  Serial.printf("led reads %d\\n", digitalRead(LED));
  digitalWrite(LED, LOW);
  delay(250);
  bool down = digitalRead(BUTTON) == LOW;
  if (down && !wasDown) Serial.printf("press %d at %lu\\n", ++presses, millis());
  wasDown = down;
}
`;

/** Connects a world's pins to the example circuit. Each distinct state is solved once. */
function exampleCircuit(presses: { fromMs: number; toMs: number }[]) {
  const document = unoCircuitExample();
  const drives: PinDrive[] = new Array<PinDrive>(20).fill('input');
  const mode = new Array<number>(20).fill(0);
  const level = new Array<number>(20).fill(0);
  const seen = new Array<number>(20).fill(0);
  const solved = new Map<string, StateSolution | null>();
  let pressed: string[] = [];
  const log: { us: number; ledAmps: number }[] = [];
  const circuit = {
    solves: 0,
    reads: 0,
    log,
    solve(): StateSolution | null {
      const key = `${drives.join(',')}|${pressed.join(',')}`;
      if (!solved.has(key)) {
        solved.set(key, solveState(document, { pressed, boards: { UNO1: [...drives] } }));
        circuit.solves++;
      }
      return solved.get(key)!;
    },
    apply(pin: number, us: number) {
      if (pin < 0 || pin >= 20) return;
      drives[pin] =
        mode[pin] === OUTPUT
          ? level[pin]
            ? 'high'
            : 'low'
          : mode[pin] === INPUT_PULLUP
            ? 'pullup'
            : 'input';
      log.push({ us, ledAmps: circuit.solve()?.parts.LED1?.current ?? 0 });
    },
    pinMode(pin: number, to: number, output: number, us: number) {
      mode[pin] = to;
      level[pin] = output;
      circuit.apply(pin, us);
    },
    write(pin: number, to: number, us: number) {
      level[pin] = to;
      circuit.apply(pin, us);
    },
    socket: (pin: number) => `UNO1.${pin < 14 ? `d${pin}` : `a${pin - 14}`}`,
    read(pin: number) {
      circuit.reads++;
      const volts = circuit.solve()?.sockets[circuit.socket(pin)]?.voltage;
      if (volts === undefined) return undefined;
      // Between the two thresholds an input keeps what it last saw.
      if (volts > LOGIC_HIGH) seen[pin] = 1;
      else if (volts < LOGIC_LOW) seen[pin] = 0;
      return seen[pin];
    },
    millivolts(pin: number) {
      const volts = circuit.solve()?.sockets[circuit.socket(pin)]?.voltage;
      return volts === undefined ? undefined : Math.round(volts * 1000);
    },
    time(us: number) {
      const down = presses.some((press) => us >= press.fromMs * 1000 && us < press.toMs * 1000);
      pressed = down ? ['SW1'] : [];
    },
  };
  return circuit;
}

describe('a sketch module connected to the circuit solver (stand-in board)', () => {
  let work: string;
  let bytes: Buffer;
  beforeAll(() => {
    expect(missingTools(), 'the WebAssembly toolchain is incomplete').toEqual([]);
    work = mkdtempSync(path.join(tmpdir(), 'esp32-circuit-'));
    buildLibraryWasm(work);
    const folder = path.join(work, 'coupled');
    mkdirSync(folder, { recursive: true });
    writeFileSync(path.join(folder, 'coupled.ino'), SKETCH);
    const built = buildSketchWasm(work, folder, 'coupled');
    expect(built.ok, built.log).toBe(true);
    bytes = readFileSync(built.module!);
  }, 120_000);
  afterAll(() => rmSync(work, { recursive: true, force: true }));

  it('the sketch lights the LED with the current the circuit gives, at the moment it writes the pin', () => {
    const circuit = exampleCircuit([]);
    const run = runModule(bytes, { runMs: 2000, script: [] }, circuit);
    expect(run.how).toBe('ran to the end of the time');
    // The same figure the UNO emulator's own test expects for this circuit:
    // (5 V - 1.79 V) / (220 ohm + 25 ohm pin + wires).
    const expected = (5 - 1.79) / 245.02;
    const lit = circuit.log.filter((entry) => entry.ledAmps > 0.001);
    expect(lit.length).toBe(4);
    for (const entry of lit)
      expect(Math.abs(entry.ledAmps - expected) / expected).toBeLessThan(0.02);
    // No slice between the program and the circuit: the changes land exactly
    // half a second apart in board time, to the microsecond the calls cost.
    const gaps = lit.slice(1).map((entry, i) => entry.us - lit[i]!.us);
    for (const gap of gaps) expect(Math.abs(gap - 500_000)).toBeLessThan(50);
  }, 60_000);

  it('the sketch reads voltages and levels from the circuit, not from a script', () => {
    const circuit = exampleCircuit([{ fromMs: 600, toMs: 1100 }]);
    const run = runModule(bytes, { runMs: 2000, script: [] }, circuit);
    // The wiper sits at half of 5 V; the library's 3.3 V converter tops out at 3300.
    expect(circuit.millivolts(14)).toBe(2500);
    expect(run.serial).toContain('knob 2500 mV\n');
    // Reading back its own loaded output: 5 V less the drop in the pin, still HIGH.
    expect(run.serial).toContain('led reads 1\n');
    // The button pulls socket 2 to ground against the pull-up while it is held.
    expect([...run.serial.matchAll(/press (\d+) at (\d+)/g)].map((m) => [m[1], m[2]])).toEqual([
      ['1', '1000'],
    ]);
  }, 60_000);

  it('solves each distinct state once, so a long run costs little', () => {
    const circuit = exampleCircuit([{ fromMs: 600, toMs: 1100 }]);
    const run = runModule(bytes, { runMs: 600_000, script: [] }, circuit);
    expect(run.how).toBe('ran to the end of the time');
    // LED on or off, button up or down, and the states during setup.
    expect(circuit.solves).toBeLessThanOrEqual(8);
    expect(circuit.log.length).toBeGreaterThan(2000);
    console.log(
      `coupled run: 10 min of board time in ${run.realMs.toFixed(0)} ms, ${circuit.solves} solves, ` +
        `${circuit.log.length} pin changes, ${circuit.reads} reads, ${run.hostCalls} calls`,
    );
    expect(run.realMs).toBeLessThan(20_000);
  }, 60_000);
});
