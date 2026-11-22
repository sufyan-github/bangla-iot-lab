import {
  CIRCUIT_SCHEMA_VERSION,
  LOGIC_CHIPS,
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
const hole = (n: number) => (n <= 7 ? `f${COLUMN + n - 1}` : `e${COLUMN + 14 - n}`);
/** Another hole in the same strip as a pin, for wiring to it. */
const beside = (n: number) => (n <= 7 ? `j${COLUMN + n - 1}` : `a${COLUMN + 14 - n}`);
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
    `strip:${COLUMN + (n <= 7 ? n - 1 : 14 - n)}:${n <= 7 ? 'bottom' : 'top'}`
  ]!;

describe('74HC logic chips', () => {
  it('every gate of every chip follows its truth table', () => {
    for (const model of LOGIC_CHIPS) {
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
        { id: 'R1', type: 'resistor', pins: { a: 'h12', b: 'h20' }, props: { resistance: 330 } },
        {
          id: 'LED1',
          type: 'led',
          pins: { anode: 'g20', cathode: 'g21' },
          props: { color: 'red' },
        },
      ],
      [...power, tie(1, true), tie(2, true), ['BAT1.neg', 'j21']],
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
      { id: 'R1', type: 'resistor', pins: { a: 'g10', b: 'g4' }, props: { resistance: 10_000 } },
      { id: 'R2', type: 'resistor', pins: { a: 'h13', b: 'h4' }, props: { resistance: 10_000 } },
      { id: 'S', type: 'button', pins: { a: 'i10', b: 'i7' }, props: {} },
      { id: 'R', type: 'button', pins: { a: 'i13', b: 'i6' }, props: {} },
    ];
    const document = circuit(parts, [
      ...power,
      ['BAT1.pos', 'j4'],
      ['BAT1.neg', 'j7'],
      ['BAT1.neg', 'j6'],
      [beside(3), beside(5)],
      [beside(6), 'g11'],
    ]);
    const session = new SimulationSession(document);
    const q = () => {
      session.advance(10);
      return session.frame().result.nodeVoltages['strip:12:bottom']! > 2.5;
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
