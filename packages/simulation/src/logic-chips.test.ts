import {
  CIRCUIT_SCHEMA_VERSION,
  GATE_CHIPS,
  LOGIC_CHIP_GATES,
  gateOutput,
  updateProps,
  type CircuitComponent,
  type CircuitDocument,
  type LogicChip,
  type Wire,
} from '@banglalab/shared';
import { describe, expect, it } from 'vitest';
import { SimulationSession } from './session';
import { simulate } from './simulate';

/**
 * 74HC logic chips across the centre gap, on a 4.5 V battery: pins 1-7 along
 * row f from column 10, pins 14-8 back along row e. The figures are the
 * family's typical datasheet values, not measurements.
 */
function circuit(components: CircuitComponent[], wires: [string, string][]): CircuitDocument {
  return {
    schemaVersion: CIRCUIT_SCHEMA_VERSION,
    components,
    wires: wires.map(([from, to], i): Wire => ({ id: `W${i + 1}`, from, to, color: '#000000' })),
  };
}
const COLUMN = 10;
/** The hole of a chip pin, for a chip whose pin 1 is at f10. */
const hole = (n: number) => (n <= 7 ? `BB1.f${COLUMN + n - 1}` : `BB1.e${COLUMN + 14 - n}`);
/** Another hole in the same strip as a pin, for wiring to it. */
const beside = (n: number) => (n <= 7 ? `BB1.j${COLUMN + n - 1}` : `BB1.a${COLUMN + 14 - n}`);
const chip = (model: LogicChip, id = 'U1'): CircuitComponent => ({
  id,
  type: 'logic',
  pins: Object.fromEntries(Array.from({ length: 14 }, (_, i) => [`p${i + 1}`, hole(i + 1)])),
  props: { chip: model },
});
const battery = (voltage = 4.5): CircuitComponent => ({
  id: 'BAT1',
  type: 'battery',
  props: { voltage },
});
/** Supply and ground to the chip. */
const power: [string, string][] = [
  ['BAT1.pos', beside(14)],
  ['BAT1.neg', beside(7)],
];
/** A pin tied HIGH or LOW by a wire to the battery. */
const tie = (n: number, high: boolean): [string, string] => [
  high ? 'BAT1.pos' : 'BAT1.neg',
  beside(n),
];
const outputVolts = (document: CircuitDocument, n: number) =>
  simulate(document).readings.U1 &&
  simulate(document).nodeVoltages[
    `BB1:strip:${COLUMN + (n <= 7 ? n - 1 : 14 - n)}:${n <= 7 ? 'bottom' : 'top'}`
  ]!;

describe('74HC logic chips', () => {
  it('every gate of every chip follows its truth table', () => {
    for (const model of GATE_CHIPS) {
      const { kind, gates } = LOGIC_CHIP_GATES[model];
      for (const gate of gates) {
        for (let combination = 0; combination < 1 << gate.inputs.length; combination++) {
          const levels = gate.inputs.map((_, i) => ((combination >> i) & 1) === 1);
          const document = circuit(
            [battery(), chip(model)],
            [...power, ...gate.inputs.map((n, i) => tie(n, levels[i]!))],
          );
          const volts = outputVolts(document, gate.output);
          const expected = gateOutput(kind, levels);
          // With nothing on the output, it sits at the supply or at ground.
          expect(volts, `${model} pin ${gate.output} for ${levels}`).toBeCloseTo(
            expected ? 4.5 : 0,
            1,
          );
        }
      }
    }
  });

  it('drives an LED from an output, taking the current from its own supply', () => {
    const document = circuit(
      [
        battery(),
        chip('74HC08'),
        {
          id: 'R1',
          type: 'resistor',
          pins: { a: 'BB1.h12', b: 'BB1.h20' },
          props: { resistance: 330 },
        },
        {
          id: 'LED1',
          type: 'led',
          pins: { anode: 'BB1.g20', cathode: 'BB1.g21' },
          props: { color: 'red' },
        },
      ],
      [...power, tie(1, true), tie(2, true), ['BAT1.neg', 'BB1.j21']],
    );
    const result = simulate(document);
    expect(result.readings.LED1!.led!.state).toBe('on');
    // About 7 mA through 330 Ω: the output stays within a few tenths of a volt of the supply.
    expect(result.readings.LED1!.current).toBeGreaterThan(0.006);
    expect(result.readings.U1!.current).toBeCloseTo(result.readings.LED1!.current, 4);
    expect(result.diagnostics.filter((d) => d.severity !== 'info')).toEqual([]);
  });

  it('warns about a floating input of a gate in use, and not about gates left unused', () => {
    const document = circuit([battery(), chip('74HC08')], [...power, tie(1, true)]);
    const codes = simulate(document).diagnostics.filter((d) => d.severity !== 'info');
    expect(codes).toMatchObject([
      { code: 'logic-input-floating', componentId: 'U1', socket: 'p2' },
    ]);
  });

  it('a NOT gate fed its own output never settles, and the lab says so', () => {
    // Pin 2 (output) wired to pin 1 (input) of a 74HC04.
    const document = circuit([battery(), chip('74HC04')], [...power, [beside(2), beside(1)]]);
    const codes = simulate(document).diagnostics.map((d) => d.code);
    expect(codes).toContain('logic-oscillates');
  });

  it('warns on more than 6 V and on an output shorted to ground', () => {
    const over = circuit([battery(9), chip('74HC08')], [...power, tie(1, false), tie(2, false)]);
    expect(simulate(over).diagnostics.map((d) => d.code)).toContain('chip-overvoltage');
    const shorted = circuit(
      [battery(), chip('74HC08')],
      [...power, tie(1, true), tie(2, true), ['BAT1.neg', beside(3)]],
    );
    expect(simulate(shorted).diagnostics).toContainEqual(
      expect.objectContaining({ code: 'chip-output-overcurrent', socket: 'p3' }),
    );
  });

  it('does nothing on too little supply', () => {
    const weak = circuit([battery(1.5), chip('74HC08')], [...power, tie(1, true), tie(2, true)]);
    const result = simulate(weak);
    expect(outputVolts(weak, 3)).toBeLessThan(0.1);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'module-underpowered', componentId: 'U1', limit: 2 }),
    );
  });

  it('two NAND gates make a latch that remembers', () => {
    // Gate 1 (pins 1, 2 -> 3) and gate 2 (pins 4, 5 -> 6), cross-coupled: 3 -> 5 and 6 -> 2.
    // The free inputs, 1 (set, active LOW) and 4 (reset, active LOW), are held HIGH by
    // 10 kΩ resistors and pulled LOW by push buttons.
    const parts: CircuitComponent[] = [
      battery(),
      chip('74HC00'),
      {
        id: 'R1',
        type: 'resistor',
        pins: { a: 'BB1.g10', b: 'BB1.g4' },
        props: { resistance: 10_000 },
      },
      {
        id: 'R2',
        type: 'resistor',
        pins: { a: 'BB1.h13', b: 'BB1.h4' },
        props: { resistance: 10_000 },
      },
      { id: 'S', type: 'button', pins: { a: 'BB1.i10', b: 'BB1.i7' }, props: {} },
      { id: 'R', type: 'button', pins: { a: 'BB1.i13', b: 'BB1.i6' }, props: {} },
    ];
    const document = circuit(parts, [
      ...power,
      ['BAT1.pos', 'BB1.j4'],
      ['BAT1.neg', 'BB1.j7'],
      ['BAT1.neg', 'BB1.j6'],
      [beside(3), beside(5)],
      [beside(6), 'BB1.g11'],
    ]);
    const session = new SimulationSession(document);
    const q = () => {
      session.advance(10);
      return session.frame().result.nodeVoltages['BB1:strip:12:bottom']! > 2.5;
    };
    session.update(document, ['S']);
    expect(q()).toBe(true); // set
    session.update(document, []);
    expect(q()).toBe(true); // remembered
    session.update(document, ['R']);
    expect(q()).toBe(false); // reset
    session.update(document, []);
    expect(q()).toBe(false); // remembered
    expect(updateProps(document, 'U1', { chip: '74HC32' }).ok).toBe(true);
  });
});

describe('74HC74 D flip-flop', () => {
  /**
   * The first flip-flop wired to divide by two: Q̄ (pin 6) back to D (pin 2), clear and
   * preset (pins 1 and 4) held HIGH. Its clock (pin 3) is held LOW by 10 kΩ and taken
   * HIGH by a button.
   */
  const divider = (clear = true) =>
    circuit(
      [
        battery(),
        chip('74HC74'),
        { id: 'CLK', type: 'button', pins: { a: 'BB1.i12', b: 'BB1.i20' }, props: {} },
        {
          id: 'RD',
          type: 'resistor',
          pins: { a: 'BB1.h12', b: 'BB1.h21' },
          props: { resistance: 10_000 },
        },
      ],
      [
        ...power,
        ['BAT1.pos', 'BB1.j20'],
        ['BAT1.neg', 'BB1.j21'],
        [beside(6), beside(2)],
        tie(1, clear),
        tie(4, true),
      ],
    );
  /** Q (pin 5), after the circuit has had a moment to settle. */
  const q = (session: SimulationSession) => {
    session.advance(10);
    return session.frame().result.nodeVoltages[`BB1:strip:${COLUMN + 4}:bottom`]! > 2.5;
  };

  it('takes D on each rising clock edge, and keeps it in between: it divides by two', () => {
    const document = divider();
    const session = new SimulationSession(document);
    expect(q(session)).toBe(false); // starts with Q LOW
    const seen: boolean[] = [];
    for (let press = 0; press < 4; press++) {
      session.update(document, ['CLK']);
      seen.push(q(session));
      session.update(document, []);
      seen.push(q(session)); // the falling edge changes nothing
    }
    expect(seen).toEqual([true, true, false, false, true, true, false, false]);
  });

  it('clear held LOW keeps Q LOW whatever the clock does', () => {
    const document = divider(false);
    const session = new SimulationSession(document);
    session.update(document, ['CLK']);
    expect(q(session)).toBe(false);
    expect(outputVolts(document, 6)).toBeCloseTo(4.5, 1); // Q̄ HIGH
  });

  it('a 555 clock module ticks by itself, and the flip-flop halves its frequency', () => {
    // The module stands in row g from column 24: VCC, OUT, GND. OUT goes to the clock pin.
    const document = circuit(
      [
        battery(5),
        chip('74HC74'),
        {
          id: 'CLK1',
          type: 'clock',
          pins: { vcc: 'BB1.g24', out: 'BB1.g25', gnd: 'BB1.g26' },
          props: { hz: 1 },
        },
      ],
      [
        ...power,
        ['BAT1.pos', 'BB1.j24'],
        ['BAT1.neg', 'BB1.j26'],
        ['BB1.j25', beside(3)],
        [beside(6), beside(2)],
        tie(1, true),
        tie(4, true),
      ],
    );
    const session = new SimulationSession(document);
    const clock: boolean[] = [];
    const q: boolean[] = [];
    // At 1 Hz OUT is LOW for the first half of each second and HIGH for the second.
    // Look at a quarter second, then every half second after. A frame reports the whole
    // stretch since the last one, so each look is a frame of its own millisecond.
    for (let look = 0; look < 8; look++) {
      session.advance(look === 0 ? 249 : 499);
      session.frame();
      session.advance(1);
      const frame = session.frame().result;
      clock.push(frame.readings.CLK1?.activity === 1);
      q.push(frame.nodeVoltages[`BB1:strip:${COLUMN + 4}:bottom`]! > 2.5);
    }
    expect(clock).toEqual([false, true, false, true, false, true, false, true]);
    expect(q).toEqual([false, true, true, false, false, true, true, false]);
  });
});

describe('the logic analyser on a chip', () => {
  it('records a chip leg from ground: the clock and the flip-flop’s Q, half as fast', () => {
    const document = circuit(
      [
        battery(5),
        chip('74HC74'),
        {
          id: 'CLK1',
          type: 'clock',
          pins: { vcc: 'BB1.g24', out: 'BB1.g25', gnd: 'BB1.g26' },
          props: { hz: 2 },
        },
      ],
      [
        ...power,
        ['BAT1.pos', 'BB1.j24'],
        ['BAT1.neg', 'BB1.j26'],
        ['BB1.j25', beside(3)],
        [beside(6), beside(2)],
        tie(1, true),
        tie(4, true),
      ],
    );
    const session = new SimulationSession(document);
    session.setProbes(['pin:U1.p3', 'pin:U1.p5']);
    session.advance(2000);
    const { trace } = session.frame();
    /** The times at which a recorded signal goes HIGH. */
    const rises = (values: number[]) =>
      values.flatMap((volts, i) =>
        volts > 2.5 && (i === 0 || values[i - 1]! <= 2.5) ? [Math.round(trace!.times[i]!)] : [],
      );
    // 2 Hz: the clock rises at 250, 750, 1250 and 1750 ms; Q on every other rise.
    expect(rises(trace!.values[0]!)).toEqual([250, 750, 1250, 1750]);
    expect(rises(trace!.values[1]!)).toEqual([250, 1250]);
  });
});
