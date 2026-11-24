import {
  CIRCUIT_SCHEMA_VERSION,
  addBattery,
  emptyCircuit,
  generatorVolts,
  type CircuitDocument,
} from '@banglalab/shared';
import { describe, expect, it } from 'vitest';
import { SimulationSession } from './session';
import { simulate } from './simulate';

/** The bench power supply and the function generator, across a 1 kΩ resistor. */
function across(props: Record<string, unknown>, id: string): CircuitDocument {
  return {
    schemaVersion: CIRCUIT_SCHEMA_VERSION,
    components: [
      { id, type: 'battery', props } as never,
      {
        id: 'R1',
        type: 'resistor',
        pins: { a: 'BB1.a10', b: 'BB1.a14' },
        props: { resistance: 1000 },
      },
    ],
    wires: [
      { id: 'W1', from: `${id}.pos`, to: 'BB1.b10', color: '#000000' },
      { id: 'W2', from: `${id}.neg`, to: 'BB1.b14', color: '#000000' },
    ],
  };
}

describe('bench instruments', () => {
  it('a bench supply gives the voltage it is turned to', () => {
    const result = simulate(across({ voltage: 7.3, source: 'supply' }, 'PSU1'));
    expect(result.readings.R1!.voltage).toBeCloseTo(7.3, 1);
    expect(result.readings.R1!.current * 1000).toBeCloseTo(7.3, 1);
  });

  it('new instruments start where a bench would: 5 V, and a 0 to 5 V square wave at 1 Hz', () => {
    const supply = addBattery(emptyCircuit(), 9, 'supply');
    const generator = addBattery(emptyCircuit(), 9, 'generator');
    expect(supply.ok && supply.circuit.components.at(-1)).toMatchObject({
      id: 'PSU1',
      props: { voltage: 5 },
    });
    expect(generator.ok && generator.circuit.components.at(-1)).toMatchObject({
      id: 'FG1',
      props: { wave: 'square', hz: 1, voltage: 2.5, offset: 2.5 },
    });
  });

  it('the three waves have the textbook shape', () => {
    const at = (wave: 'square' | 'sine' | 'triangle', t: number) =>
      generatorVolts({ voltage: 1, wave, hz: 1, offset: 0 }, t);
    expect([0, 250, 500, 750].map((t) => at('sine', t).toFixed(3))).toEqual([
      '0.000',
      '1.000',
      '0.000',
      '-1.000',
    ]);
    expect([0, 250, 500, 750].map((t) => at('triangle', t))).toEqual([0, 1, 0, -1]);
    expect([100, 600].map((t) => at('square', t))).toEqual([1, -1]);
  });

  it('a generator’s square wave swings the resistor between about 0 and 5 V, through its 50 Ω', () => {
    const document = across(
      { voltage: 2.5, source: 'generator', wave: 'square', hz: 2, offset: 2.5 },
      'FG1',
    );
    const session = new SimulationSession(document);
    expect(session.isTimeDependent).toBe(true);
    const seen: number[] = [];
    // 2 Hz: HIGH for the first quarter second, LOW for the next.
    for (let look = 0; look < 4; look++) {
      session.advance(look === 0 ? 124 : 249);
      session.frame();
      session.advance(1);
      seen.push(Math.round(session.frame().result.readings.R1!.voltage * 100) / 100);
    }
    // 5 V across 1 kΩ behind 50 Ω: 4.76 V.
    expect(seen).toEqual([4.76, 0, 4.76, 0]);
  });
});
