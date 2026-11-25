import {
  CIRCUIT_SCHEMA_VERSION,
  type CircuitComponent,
  type CircuitDocument,
  type Wire,
} from '@banglalab/shared';
import { simulate } from '@banglalab/simulation';
import { describe, expect, it } from 'vitest';
import {
  checkStep,
  evaluate,
  isEvent,
  placesOf,
  unmetWiring,
  wiringSoFar,
  type LessonWorld,
} from './checks';
import { LESSONS } from './index';
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
  pins: { a: 'BB1.f20', b: 'BB1.f24' },
  props: { resistance: ohms },
});
const led: CircuitComponent = {
  id: 'LED1',
  type: 'led',
  pins: { anode: 'BB1.g24', cathode: 'BB1.g25' },
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
      ['ESP1.d2', 'BB1.j20'],
      ['ESP1.gnd2', 'BB1.j25'],
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
    const big = circuit([esp32, resistor(10_000), led], [['ESP1.d2', 'BB1.j20']]);
    expect(evaluate(throughResistor, world(big))).toBe(false);
    // The LED straight on the pin: joined, but not through a resistor.
    const direct = circuit([esp32, led], [['ESP1.d2', 'BB1.j24']]);
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
      ['ESP1.d4', 'BB1.a10'],
      ['ESP1.gnd1', 'BB1.a12'],
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
      ['BB1.e10', 'BB1.e12'],
      ['BB1.e12', 'BB1.e10'],
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
      ['ESP1.3v3', 'BB1.j20'],
      ['ESP1.gnd2', 'BB1.j25'],
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
        ['ESP1.3v3', 'BB1.j24'],
        ['ESP1.gnd2', 'BB1.j25'],
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

describe('what a lesson has asked to be built, checked when Run is pressed (D-110)', () => {
  const lesson = LESSONS.find((each) => each.id === 'led-resistor')!;
  // The LED lesson's circuit: 3V3 through 220 Ω to the LED's long leg, its short leg to GND.
  const built = circuit(
    [
      { id: 'BB1', type: 'breadboard', props: { size: 'half' } },
      esp32,
      resistor(220),
      led,
    ] as CircuitComponent[],
    [
      ['ESP1.3v3', 'BB1.j20'],
      ['BB1.j25', 'ESP1.gnd'],
    ],
  );

  it('gathers the parts and connections of this step and every one before it', () => {
    expect(wiringSoFar(lesson, 0)).toEqual([]);
    const asked = wiringSoFar(lesson, 2);
    expect(asked.map(({ step, check }) => `${step}:${check.kind}`)).toEqual([
      '1:part',
      '1:connected',
      '1:connected',
    ]);
  });

  it('finds nothing missing in a circuit built as asked', () => {
    expect(unmetWiring(lesson, 2, built)).toEqual([]);
  });

  it('names what is missing, and where on the board it is', () => {
    // The wire from the LED's short leg to GND is left out.
    const missing = { ...built, wires: built.wires.slice(0, 1) };
    const unmet = unmetWiring(lesson, 2, missing);
    expect(unmet).toHaveLength(1);
    expect(unmet[0]!.check).toMatchObject({ kind: 'connected', to: { board: 'gnd' } });
    // "Any ground" is both of the board's ground sockets.
    expect(placesOf(unmet[0]!.check, missing)).toEqual(['BB1.g25', 'ESP1.gnd1', 'ESP1.gnd2']);

    // A resistor of the wrong value is a connection not made as asked.
    const wrong = {
      ...built,
      components: built.components.map((c) => (c.id === 'R1' ? resistor(10_000) : c)),
    };
    expect(unmetWiring(lesson, 2, wrong).map(({ check }) => check.kind)).toEqual(['connected']);

    // With no LED at all, the part is missing, and there is nothing to point at for it.
    const none = { ...built, components: built.components.filter((c) => c.id !== 'LED1') };
    const parts = unmetWiring(lesson, 2, none).filter(({ check }) => check.kind === 'part');
    expect(parts).toHaveLength(1);
    expect(placesOf(parts[0]!.check, none)).toEqual([]);
  });
});
