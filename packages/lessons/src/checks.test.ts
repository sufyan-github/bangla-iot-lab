import {
  CIRCUIT_SCHEMA_VERSION,
  type CircuitComponent,
  type CircuitDocument,
  type Wire,
} from '@banglalab/shared';
import { simulate } from '@banglalab/simulation';
import { describe, expect, it } from 'vitest';
import { checkStep, evaluate, isEvent, type LessonWorld } from './checks';
import type { Check } from './schema';

function circuit(components: CircuitComponent[], wires: [string, string][]): CircuitDocument {
  return {
    schemaVersion: CIRCUIT_SCHEMA_VERSION,
    components,
    wires: wires.map(([from, to], i): Wire => ({ id: `W${i + 1}`, from, to, color: '#000000' })),
  };
}
const esp32: CircuitComponent = { id: 'ESP1', type: 'esp32', props: {} };
const resistor = (ohms: number): CircuitComponent => ({
  id: 'R1',
  type: 'resistor',
  pins: { a: 'f20', b: 'f24' },
  props: { resistance: ohms },
});
const led: CircuitComponent = {
  id: 'LED1',
  type: 'led',
  pins: { anode: 'g24', cathode: 'g25' },
  props: { color: 'red' },
};
const world = (document: CircuitDocument, more: Partial<LessonWorld> = {}): LessonWorld => ({
  circuit: document,
  result: null,
  running: false,
  serial: '',
  uploadedStarter: null,
  ...more,
});
const throughResistor: Check = {
  kind: 'connected',
  from: { board: 'd2' },
  to: { part: 'led', pin: 'anode' },
  through: 'resistor',
  ohms: [100, 1000],
};

describe('lesson checks about the circuit', () => {
  const wired = circuit(
    [esp32, resistor(220), led],
    [
      ['ESP1.d2', 'j20'],
      ['ESP1.gnd2', 'j25'],
    ],
  );

  it('finds a board pin joined to an LED through a resistor, and its other leg to ground', () => {
    expect(evaluate(throughResistor, world(wired))).toBe(true);
    // GND stands for either of the board's ground pins.
    const cathode: Check = {
      kind: 'connected',
      from: { part: 'led', pin: 'cathode' },
      to: { board: 'gnd' },
    };
    expect(evaluate(cathode, world(wired))).toBe(true);
  });

  it('is not fooled by the wrong pin, a missing resistor or a resistor of the wrong value', () => {
    const otherPin = {
      ...wired,
      wires: wired.wires.map((w) => ({ ...w, from: w.from.replace('d2', 'd4') })),
    };
    expect(evaluate(throughResistor, world(otherPin))).toBe(false);
    const big = circuit([esp32, resistor(10_000), led], [['ESP1.d2', 'j20']]);
    expect(evaluate(throughResistor, world(big))).toBe(false);
    // The LED straight on the pin: joined, but not through a resistor.
    const direct = circuit([esp32, led], [['ESP1.d2', 'j24']]);
    expect(evaluate(throughResistor, world(direct))).toBe(false);
    expect(
      evaluate(
        { kind: 'connected', from: { board: 'd2' }, to: { part: 'led', pin: 'anode' } },
        world(direct),
      ),
    ).toBe(true);
  });

  it('accepts a part turned either way round when any leg will do', () => {
    const button = (a: string, b: string): CircuitComponent => ({
      id: 'SW1',
      type: 'button',
      pins: { a, b },
      props: {},
    });
    const wires: [string, string][] = [
      ['ESP1.d4', 'a10'],
      ['ESP1.gnd1', 'a12'],
    ];
    const toPin: Check = {
      kind: 'connected',
      from: { part: 'button', pin: '*' },
      to: { board: 'd4' },
    };
    const toGround: Check = {
      kind: 'connected',
      from: { part: 'button', pin: '*' },
      to: { board: 'gnd' },
    };
    for (const [a, b] of [
      ['e10', 'e12'],
      ['e12', 'e10'],
    ] as const) {
      const document = circuit([esp32, button(a, b)], wires);
      expect(evaluate(toPin, world(document))).toBe(true);
      expect(evaluate(toGround, world(document))).toBe(true);
    }
  });

  it('reads the terminals of a module beside the board, and a battery', () => {
    const document = circuit(
      [
        esp32,
        { id: 'BAT1', type: 'battery', props: { voltage: 7.2 } },
        { id: 'DRV1', type: 'l298n', props: { enaJumper: false, enbJumper: true } },
      ],
      [
        ['BAT1.pos', 'DRV1.vs'],
        ['ESP1.d26', 'DRV1.in1'],
      ],
    );
    const at = (check: Check) => evaluate(check, world(document));
    expect(
      at({ kind: 'connected', from: { battery: 'pos' }, to: { part: 'l298n', pin: 'vs' } }),
    ).toBe(true);
    expect(
      at({ kind: 'connected', from: { board: 'd26' }, to: { part: 'l298n', pin: 'in1' } }),
    ).toBe(true);
    expect(
      at({ kind: 'connected', from: { board: 'd27' }, to: { part: 'l298n', pin: 'in2' } }),
    ).toBe(false);
    expect(at({ kind: 'prop', part: 'l298n', prop: 'enaJumper', equals: false })).toBe(true);
    expect(at({ kind: 'part', type: 'l298n' })).toBe(true);
    expect(at({ kind: 'part', type: 'oled' })).toBe(false);
  });

  it('compares settings, programs and the switch', () => {
    const document = circuit([esp32, resistor(1000)], []);
    expect(
      evaluate(
        { kind: 'prop', part: 'resistor', prop: 'resistance', equals: 1000 },
        world(document),
      ),
    ).toBe(true);
    expect(
      evaluate(
        { kind: 'prop', part: 'resistor', prop: 'resistance', above: 1000 },
        world(document),
      ),
    ).toBe(false);
    expect(
      evaluate(
        { kind: 'program', starter: 'blink' },
        world(document, { uploadedStarter: 'blink' }),
      ),
    ).toBe(true);
    expect(evaluate({ kind: 'program', starter: 'blink' }, world(document))).toBe(false);
    expect(evaluate({ kind: 'running' }, world(document, { running: true }))).toBe(true);
    // No result yet: nothing can be said to be safe.
    expect(evaluate({ kind: 'no-errors' }, world(document))).toBe(false);
  });
});

describe('lesson checks about what happened', () => {
  const lit = circuit(
    [esp32, resistor(220), led],
    [
      ['ESP1.3v3', 'j20'],
      ['ESP1.gnd2', 'j25'],
    ],
  );

  it("reads a part's reading, the serial text and the lab's explanations", () => {
    const result = simulate(lit);
    const now = world(lit, { result, running: true, serial: 'তাপমাত্রা 35 °C\r\n' });
    expect(evaluate({ kind: 'reading', part: 'led', path: 'led.state', equals: 'on' }, now)).toBe(
      true,
    );
    expect(
      evaluate({ kind: 'reading', part: 'led', path: 'current', above: 0.005, below: 0.009 }, now),
    ).toBe(true);
    expect(evaluate({ kind: 'reading', part: 'led', path: 'led.nothing', equals: 1 }, now)).toBe(
      false,
    );
    expect(evaluate({ kind: 'serial', matches: 'তাপমাত্রা 35 °C' }, now)).toBe(true);
    expect(evaluate({ kind: 'serial', matches: 'তাপমাত্রা 36' }, now)).toBe(false);
    expect(evaluate({ kind: 'no-errors' }, now)).toBe(true);
    const burned = circuit(
      [esp32, led],
      [
        ['ESP1.3v3', 'j24'],
        ['ESP1.gnd2', 'j25'],
      ],
    );
    expect(
      evaluate(
        { kind: 'diagnostic', code: 'led-burned' },
        world(burned, { result: simulate(burned) }),
      ),
    ).toBe(true);
  });

  it('counts an event once it has been seen on the step, and the circuit only as it is now', () => {
    const step = {
      text: { bn: '-', en: '-' },
      checks: [
        { kind: 'running' },
        { kind: 'reading', part: 'led', path: 'led.state', equals: 'on' },
        { kind: 'reading', part: 'led', path: 'led.state', equals: 'off' },
      ] as Check[],
    };
    expect(step.checks.map(isEvent)).toEqual([false, true, true]);
    const on = world(lit, { result: simulate(lit), running: true });
    const first = checkStep(step, on);
    expect(first).toEqual({ checks: [true, true, false], done: false, seen: [1] });
    const dark = circuit([esp32, resistor(220), led], []);
    const off = world(dark, { result: simulate(dark), running: true });
    const second = checkStep(step, off, first.seen);
    expect(second).toEqual({ checks: [true, true, true], done: true, seen: [1, 2] });
    // Switched off again: what was seen stays seen, but the step is no longer complete.
    expect(checkStep(step, { ...off, running: false }, second.seen).done).toBe(false);
  });
});
