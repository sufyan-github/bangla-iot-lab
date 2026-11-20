import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { solveDc } from './dc';
import { GOLDEN_CASES } from './golden-cases';
import { toSpiceDeck } from './spice';

interface GoldenFile {
  engine: string;
  deck: string;
  voltages: Record<string, number>;
  sourceCurrents: Record<string, number>;
}

/** Agreement required with ngspice: 1 µV / 1 nA absolute plus 10 ppm relative. */
function expectClose(actual: number, reference: number, absolute: number) {
  expect(Math.abs(actual - reference)).toBeLessThanOrEqual(absolute + 1e-5 * Math.abs(reference));
}

describe('DC solver agrees with ngspice reference results', () => {
  for (const goldenCase of GOLDEN_CASES) {
    it(`${goldenCase.name}: ${goldenCase.description}`, () => {
      const golden: GoldenFile = JSON.parse(
        readFileSync(new URL(`../golden/${goldenCase.name}.json`, import.meta.url), 'utf8'),
      );
      const circuit = goldenCase.build();
      // A stale golden file would silently test the wrong circuit.
      expect(toSpiceDeck(goldenCase.name, circuit)).toBe(golden.deck);

      const result = solveDc(circuit);
      if (!result.ok) throw new Error(`solver failed: ${result.reason}`);

      expect(Object.keys(golden.voltages)).toHaveLength(circuit.nodeCount - 1);
      for (const [node, volts] of Object.entries(golden.voltages)) {
        expectClose(result.solution.voltage(Number(node)), volts, 1e-6);
      }
      for (const [id, amps] of Object.entries(golden.sourceCurrents)) {
        const source = circuit.devices.find((d) => d.id === id);
        if (!source) throw new Error(`golden file names unknown source ${id}`);
        expectClose(source.current(result.solution), amps, 1e-9);
      }
    });
  }
});
