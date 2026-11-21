import type { PinDrive, PinListener, ProgrammableBoard } from '@banglalab/board-emulators';
import {
  ESP32_TERMINALS,
  esp32CircuitExample,
  esp32GpioNumber,
  isCircuitDocument,
} from '@banglalab/shared';
import { describe, expect, it } from 'vitest';
import { BOARD_MODELS } from './boards';
import { ESP32_DEVKIT_PINS } from './esp32-pins';
import { SimulationSession } from './session';
import { simulate, solveState } from './simulate';

/**
 * A board whose "program" is written here in the test: a list of things it
 * does at given times, and a record of what the circuit showed it.
 */
class ScriptedBoard implements ProgrammableBoard {
  timeMs = 0;
  readonly drives: PinDrive[];
  readonly levels: (boolean | undefined)[] = [];
  readonly volts: number[] = [];
  private readonly listeners = new Set<PinListener>();
  private next = 0;
  constructor(
    pinCount: number,
    private readonly script: { atMs: number; pin: number; drive: PinDrive }[],
  ) {
    this.drives = new Array<PinDrive>(pinCount).fill('input');
  }
  pinDrive(pin: number): PinDrive {
    return this.drives[pin]!;
  }
  setDigitalInput(pin: number, high: boolean): void {
    this.levels[pin] = high;
  }
  setPinVoltage(pin: number, volts: number): void {
    this.volts[pin] = volts;
  }
  onPinChange(listener: PinListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  onSerial(): () => void {
    return () => undefined;
  }
  runUntil(timeMs: number): void {
    while (this.next < this.script.length && this.script[this.next]!.atMs <= timeMs) {
      const step = this.script[this.next++]!;
      this.drives[step.pin] = step.drive;
      for (const listener of this.listeners) listener(step.pin, step.drive, step.atMs);
    }
    this.timeMs = timeMs;
  }
}

describe('ESP32 board: the pin lists agree', () => {
  it('has the same 30 pins in the circuit format and in the pin model', () => {
    expect([...ESP32_TERMINALS].sort()).toEqual(ESP32_DEVKIT_PINS.map((pin) => pin.id).sort());
    for (const pin of ESP32_DEVKIT_PINS) expect(esp32GpioNumber(pin.id)).toBe(pin.gpio);
  });

  it('the example circuit is a valid document', () => {
    expect(isCircuitDocument(esp32CircuitExample())).toBe(true);
  });
});

describe('ESP32 board in a circuit, before any program', () => {
  const result = simulate(esp32CircuitExample());

  it('is powered at 3.3 V and every pin is an input, so the LED is dark', () => {
    expect(result.readings.LED1!.led!.state).toBe('off');
    // The potentiometer sits across the 3.3 V rail: 3.3 V / 10 kΩ.
    expect(result.readings.POT1!.current).toBeCloseTo(0.00033, 5);
    expect(result.sockets['ESP1.d34']!.voltage).toBeCloseTo(1.65, 2);
    expect(result.sockets['ESP1.3v3']!.voltage).toBeCloseTo(3.3, 2);
    expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  });
});

describe('ESP32 pins as outputs', () => {
  const drives = (changes: Record<number, PinDrive>) => {
    const all = new Array<PinDrive>(40).fill('input');
    for (const [pin, drive] of Object.entries(changes)) all[Number(pin)] = drive;
    return { pressed: [], boards: { ESP1: all } };
  };

  it('a HIGH pin lights the LED through the pin resistance from 3.3 V', () => {
    const solution = solveState(esp32CircuitExample(), drives({ 2: 'high' }))!;
    const pin = solution.sockets['ESP1.d2']!;
    const led = solution.parts.LED1!;
    expect(led.current).toBeGreaterThan(0.004);
    expect(led.current).toBeLessThan(0.008);
    // The pin sags by its own resistance, and the rest drops across the LED and 220 Ω.
    expect(pin.voltage).toBeCloseTo(3.3 - pin.current * BOARD_MODELS.esp32.sourceResistance, 3);
    expect(pin.current).toBeCloseTo(led.current, 6);
    expect((pin.voltage - led.voltage) / led.current).toBeCloseTo(220, 0);
  });

  it('a LOW pin leaves it dark', () => {
    const solution = solveState(esp32CircuitExample(), drives({ 2: 'low' }))!;
    expect(solution.parts.LED1!.current).toBeLessThan(1e-6);
  });

  it('an input-only pin cannot drive, whatever the program asks', () => {
    const solution = solveState(esp32CircuitExample(), drives({ 34: 'high' }))!;
    expect(solution.sockets['ESP1.d34']!.voltage).toBeCloseTo(1.65, 2);
    expect(Math.abs(solution.sockets['ESP1.d34']!.current)).toBeLessThan(1e-6);
  });

  it('has a pull-down as well as a pull-up', () => {
    const up = solveState(esp32CircuitExample(), drives({ 4: 'pullup' }))!;
    expect(up.sockets['ESP1.d4']!.voltage).toBeGreaterThan(3.2);
    const down = solveState(esp32CircuitExample(), drives({ 4: 'pulldown' }))!;
    expect(down.sockets['ESP1.d4']!.voltage).toBeLessThan(0.1);
  });
});

describe('a program on the ESP32 board, run by the simulation session', () => {
  it('blinks the LED and is shown the circuit: a button against a pull-up, a voltage', () => {
    const board = new ScriptedBoard(40, [
      { atMs: 0, pin: 4, drive: 'pullup' },
      { atMs: 0, pin: 2, drive: 'high' },
      { atMs: 250, pin: 2, drive: 'low' },
      { atMs: 500, pin: 2, drive: 'high' },
      { atMs: 750, pin: 2, drive: 'low' },
    ]);
    const session = new SimulationSession(esp32CircuitExample());
    session.loadProgram('ESP1', board);

    const lit: boolean[] = [];
    for (let t = 0; t < 1000; t += 50) {
      session.advance(50);
      lit.push(session.frame().result.readings.LED1!.led!.state === 'on');
    }
    expect(lit.filter(Boolean).length).toBe(10);
    expect(lit.slice(0, 5)).toEqual([true, true, true, true, true]);
    expect(lit.slice(5, 10)).toEqual([false, false, false, false, false]);

    // Released: the pull-up holds GPIO4 HIGH. Held: the button takes it to ground.
    expect(board.levels[4]).toBe(true);
    session.update(esp32CircuitExample(), ['SW1']);
    session.advance(5);
    expect(board.levels[4]).toBe(false);
    // The potentiometer's wiper, half of 3.3 V, is what the program would measure.
    expect(board.volts[34]).toBeCloseTo(1.65, 2);
    const status = session.frame().boards.ESP1!;
    expect(status.drives).toHaveLength(40);
    expect(status.drives[4]).toBe('pullup');
  });

  it('refuses a board the circuit does not have', () => {
    const session = new SimulationSession(esp32CircuitExample());
    expect(() => session.loadProgram('UNO1', new ScriptedBoard(20, []))).toThrow(/no board/);
  });
});
