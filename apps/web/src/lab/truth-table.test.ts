import {
  CIRCUIT_SCHEMA_VERSION,
  type CircuitComponent,
  type CircuitDocument,
  type Wire,
} from '@banglalab/shared';
import { describe, expect, it } from 'vitest';
import { tableParts, truthTable } from './truth-table';

function circuit(components: CircuitComponent[], wires: [string, string][]): CircuitDocument {
  return {
    schemaVersion: CIRCUIT_SCHEMA_VERSION,
    components,
    wires: wires.map(([from, to], i): Wire => ({ id: `W${i + 1}`, from, to, color: '#000000' })),
  };
}
const chip = (model: '74HC08' | '74HC00'): CircuitComponent => ({
  id: 'U1',
  type: 'logic',
  pins: Object.fromEntries(
    Array.from({ length: 14 }, (_, i) => [
      `p${i + 1}`,
      i < 7 ? `BB1.f${10 + i}` : `BB1.e${23 - i}`,
    ]),
  ),
  props: { chip: model },
});
/**
 * A gate with two switch inputs, each held LOW by 10 kΩ and switched to the
 * supply, and an LED on its output: pins 1 and 2 in, pin 3 out.
 */
const gateCircuit = (model: '74HC08' | '74HC00') =>
  circuit(
    [
      { id: 'BAT1', type: 'battery', props: { voltage: 4.5 } },
      chip(model),
      { id: 'S1', type: 'switch', pins: { a: 'BB1.h10', b: 'BB1.h4' }, props: { closed: false } },
      { id: 'S2', type: 'switch', pins: { a: 'BB1.i11', b: 'BB1.i5' }, props: { closed: false } },
      {
        id: 'R1',
        type: 'resistor',
        pins: { a: 'BB1.g10', b: 'BB1.g2' },
        props: { resistance: 10_000 },
      },
      {
        id: 'R2',
        type: 'resistor',
        pins: { a: 'BB1.g11', b: 'BB1.g3' },
        props: { resistance: 10_000 },
      },
      {
        id: 'R3',
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
    [
      ['BAT1.pos', 'BB1.a10'], // pin 14
      ['BAT1.neg', 'BB1.j16'], // pin 7
      ['BAT1.pos', 'BB1.j4'],
      ['BAT1.pos', 'BB1.j5'],
      ['BAT1.neg', 'BB1.j2'],
      ['BAT1.neg', 'BB1.j3'],
      ['BAT1.neg', 'BB1.j21'],
    ],
  );

describe('truth table', () => {
  it('writes the truth table of an AND gate, and of a NAND gate', () => {
    const and = truthTable(gateCircuit('74HC08'))!;
    expect(and.inputs).toEqual(['S1', 'S2']);
    expect(and.outputs).toEqual(['LED1']);
    expect(and.rows).toEqual([
      { inputs: [false, false], outputs: [false] },
      { inputs: [false, true], outputs: [false] },
      { inputs: [true, false], outputs: [false] },
      { inputs: [true, true], outputs: [true] },
    ]);
    expect(and.remembers).toBe(false);
    const nand = truthTable(gateCircuit('74HC00'))!;
    expect(nand.rows.map((row) => row.outputs[0])).toEqual([true, true, true, false]);
  });

  it('has nothing to write without a switch or an LED, or with too many switches', () => {
    const document = gateCircuit('74HC08');
    expect(
      tableParts({ ...document, components: document.components.filter((c) => c.type !== 'led') }),
    ).toBeNull();
    expect(
      truthTable({
        ...document,
        components: document.components.filter((c) => c.type !== 'switch'),
      }),
    ).toBeNull();
  });
});
