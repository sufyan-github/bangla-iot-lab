import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { solveDc, solveTimeStep } from './dc';
import { capacitor, resistor, voltageSource } from './devices';
import { toSpiceDeck } from './spice';
import { TRANSIENT_CASES } from './transient-cases';

describe('capacitor', () => {
  it('charges along the textbook curve V·(1 − e^(−t/RC))', () => {
    const c = capacitor('C1', 2, 0, 1e-6);
    const circuit = {
      nodeCount: 3,
      devices: [voltageSource('V1', 1, 0, 5), resistor('R1', 1, 2, 1000), c],
    };
    const dt = 1e-6;
    for (let step = 1; step <= 3000; step++) {
      const result = solveTimeStep(circuit, dt);
      if (!result.ok) throw new Error(result.reason);
      if (step % 1000 === 0) {
        const exact = 5 * (1 - Math.exp((-step * dt) / 1e-3));
        expect(Math.abs(c.storedVoltage - exact)).toBeLessThan(0.002);
      }
    }
    expect(c.storedVoltage).toBeCloseTo(5 * (1 - Math.exp(-3)), 2); // 95 % after three time constants
  });

  it('reports its charging current and conserves charge', () => {
    const c = capacitor('C1', 2, 0, 10e-6);
    const r = resistor('R1', 1, 2, 100);
    const circuit = { nodeCount: 3, devices: [voltageSource('V1', 1, 0, 9), r, c] };
    let charge = 0;
    for (let step = 0; step < 2000; step++) {
      const result = solveTimeStep(circuit, 5e-6);
      if (!result.ok) throw new Error(result.reason);
      expect(c.current(result.solution)).toBeCloseTo(r.current(result.solution), 9);
      charge += c.current(result.solution) * 5e-6;
    }
    expect(charge).toBeCloseTo(c.capacitance * c.storedVoltage, 12); // Q = C·V
  });

  it('is an open circuit at DC and keeps its stored voltage', () => {
    const c = capacitor('C1', 2, 0, 1e-6, 3.3);
    const r = resistor('R1', 1, 2, 1000);
    const result = solveDc({ nodeCount: 3, devices: [voltageSource('V1', 1, 0, 5), r, c] });
    if (!result.ok) throw new Error(result.reason);
    expect(r.current(result.solution)).toBeCloseTo(0, 15);
    expect(c.voltage(result.solution)).toBeCloseTo(5, 9); // settles at the supply voltage
    expect(c.storedVoltage).toBe(3.3); // a DC solve observes; it does not advance time
  });

  it('solves two capacitors in series at DC, where the middle node floats', () => {
    const result = solveDc({
      nodeCount: 4,
      devices: [
        voltageSource('V1', 1, 0, 9),
        resistor('R1', 1, 2, 470),
        capacitor('C1', 2, 3, 2.2e-6),
        capacitor('C2', 3, 0, 4.7e-6),
      ],
    });
    expect(result.ok).toBe(true);
  });

  it('rejects non-physical values', () => {
    expect(() => capacitor('C1', 1, 0, 0)).toThrow(RangeError);
    expect(() =>
      solveTimeStep({ nodeCount: 2, devices: [capacitor('C1', 1, 0, 1e-6)] }, 0),
    ).toThrow(RangeError);
  });
});

describe('time-step solver agrees with ngspice transient analysis', () => {
  for (const transientCase of TRANSIENT_CASES) {
    it(`${transientCase.name}: ${transientCase.description}`, () => {
      const golden = JSON.parse(
        readFileSync(
          new URL(`../golden/transient-${transientCase.name}.json`, import.meta.url),
          'utf8',
        ),
      ) as { deck: string; voltages: Record<string, number[]> };
      expect(
        toSpiceDeck(transientCase.name, transientCase.build(), {
          stepSeconds: transientCase.stepSeconds / 5,
          stopSeconds: transientCase.stopSeconds,
        }),
      ).toBe(golden.deck);

      const circuit = transientCase.build();
      const { stepSeconds, sampleSeconds, toleranceVolts } = transientCase;
      let worst = 0;
      let step = 0;
      for (const [index, at] of sampleSeconds.entries()) {
        const target = Math.round(at / stepSeconds);
        let result = solveTimeStep(circuit, stepSeconds);
        for (step++; step < target; step++) result = solveTimeStep(circuit, stepSeconds);
        if (!result.ok) throw new Error(`solver failed at ${at} s: ${result.reason}`);
        for (const [node, values] of Object.entries(golden.voltages)) {
          worst = Math.max(worst, Math.abs(result.solution.voltage(Number(node)) - values[index]));
        }
      }
      expect(worst).toBeLessThan(toleranceVolts);
    });
  }
});
