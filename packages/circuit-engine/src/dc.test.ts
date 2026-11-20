import { describe, expect, it } from 'vitest';
import { solveDc } from './dc';
import {
  diode,
  limitJunctionVoltage,
  resistor,
  theveninSource,
  voltageSource,
  THERMAL_VOLTAGE,
} from './devices';
import { solveLinearSystem } from './linear-solver';

function solved(circuit: Parameters<typeof solveDc>[0]) {
  const result = solveDc(circuit);
  if (!result.ok) throw new Error(`solver failed: ${result.reason}`);
  return result;
}

describe('linear solver', () => {
  it('solves a system that needs row pivoting', () => {
    const a = Float64Array.from([0, 2, 1, 1, 1, 1, 2, 1, 3]);
    const b = Float64Array.from([7, 6, 13]);
    expect(solveLinearSystem(a, b, 3)).toBe(true);
    expect(Array.from(b)).toEqual([1, 2, 3].map((v) => expect.closeTo(v, 12)));
  });

  it('reports a singular system instead of returning garbage', () => {
    const a = Float64Array.from([1, 2, 2, 4]);
    expect(solveLinearSystem(a, Float64Array.from([1, 2]), 2)).toBe(false);
  });
});

describe('DC operating point', () => {
  it("obeys Ohm's law for a single resistor", () => {
    const r = resistor('R1', 1, 0, 450);
    const v = voltageSource('V1', 1, 0, 9);
    const { solution, iterations } = solved({ nodeCount: 2, devices: [v, r] });
    expect(r.current(solution)).toBeCloseTo(0.02, 12);
    // A delivering source reports negative current (SPICE convention).
    expect(v.current(solution)).toBeCloseTo(-0.02, 12);
    expect(iterations).toBe(2); // linear circuit: one solve plus one confirming pass
  });

  it('satisfies the Shockley equation and KVL for a resistor + LED loop', () => {
    const model = { saturationCurrent: 1.557e-17, emissionCoefficient: 2 };
    const r = resistor('R1', 1, 2, 220);
    const d = diode('D1', 2, 0, model);
    const { solution } = solved({ nodeCount: 3, devices: [voltageSource('V1', 1, 0, 9), r, d] });

    const vd = solution.voltage(2);
    const shockley = model.saturationCurrent * Math.expm1(vd / (2 * THERMAL_VOLTAGE));
    expect(d.current(solution)).toBeCloseTo(shockley, 9);
    expect(r.current(solution)).toBeCloseTo(d.current(solution), 9); // same current round the loop
    expect(r.voltage(solution) + vd).toBeCloseTo(9, 9);
    expect(vd).toBeGreaterThan(1.7);
    expect(vd).toBeLessThan(1.9);
  });

  it('gives a floating part 0 V and no current rather than failing', () => {
    // R2 hangs off node 2 with its far end (node 3) connected to nothing.
    const dangling = resistor('R2', 2, 3, 1000);
    const { solution } = solved({
      nodeCount: 4,
      devices: [
        voltageSource('V1', 1, 0, 5),
        resistor('R1', 1, 2, 100),
        resistor('R3', 2, 0, 100),
        dangling,
      ],
    });
    expect(dangling.current(solution)).toBeCloseTo(0, 15);
    expect(solution.voltage(3)).toBeCloseTo(2.5, 12);
  });

  it('puts 0 V across a diode whose far side is not connected', () => {
    // Anode at 9 V through a resistor, cathode (node 3) connected to nothing else.
    const d = diode('D1', 2, 3, { saturationCurrent: 1.557e-17, emissionCoefficient: 2 });
    const { solution } = solved({
      nodeCount: 4,
      devices: [voltageSource('V1', 1, 0, 9), resistor('R1', 1, 2, 330), d],
    });
    expect(d.voltage(solution)).toBeCloseTo(0, 9);
    expect(d.current(solution)).toBeCloseTo(0, 15);
    expect(solution.voltage(3)).toBeCloseTo(9, 9);
  });

  it('solves node numbers that no device uses', () => {
    const r = resistor('R1', 1, 0, 100);
    const { solution } = solved({ nodeCount: 5, devices: [voltageSource('V1', 1, 0, 5), r] });
    expect(r.current(solution)).toBeCloseTo(0.05, 12);
    expect(solution.voltage(3)).toBe(0);
  });

  it('solves an island with no connection to ground', () => {
    const island = resistor('R1', 1, 2, 100);
    const { solution } = solved({ nodeCount: 3, devices: [island] });
    expect(island.current(solution)).toBe(0);
  });

  it('treats a source with series resistance like an ideal source plus a resistor', () => {
    const pin = theveninSource('P1', 1, 0, 5, 25);
    const load = resistor('R1', 1, 0, 225);
    const { solution } = solved({ nodeCount: 2, devices: [pin, load] });
    expect(solution.voltage(1)).toBeCloseTo(4.5, 12);
    expect(load.current(solution)).toBeCloseTo(0.02, 12);
    expect(pin.current(solution)).toBeCloseTo(-0.02, 12); // delivering
    // Shorting it is well defined: the series resistance limits the current.
    const shorted = solved({ nodeCount: 2, devices: [pin, resistor('W', 1, 0, 1e-3)] });
    expect(pin.current(shorted.solution)).toBeCloseTo(-5 / 25.001, 9);
    expect(() => theveninSource('P', 1, 0, 5, 0)).toThrow(RangeError);
  });

  it('reports conflicting ideal sources as singular', () => {
    const result = solveDc({
      nodeCount: 2,
      devices: [voltageSource('V1', 1, 0, 5), voltageSource('V2', 1, 0, 9)],
    });
    expect(result).toMatchObject({ ok: false, reason: 'singular' });
  });

  it('reports an empty circuit', () => {
    expect(solveDc({ nodeCount: 1, devices: [] })).toMatchObject({ ok: false, reason: 'empty' });
  });

  it('can be solved twice with the same devices', () => {
    const circuit = {
      nodeCount: 3,
      devices: [
        voltageSource('V1', 1, 0, 9),
        resistor('R1', 1, 2, 220),
        diode('D1', 2, 0, { saturationCurrent: 1.557e-17, emissionCoefficient: 2 }),
      ],
    };
    const first = solved(circuit).solution.voltage(2);
    expect(solved(circuit).solution.voltage(2)).toBe(first);
  });

  it('converges across a wide range of supply voltages and resistances', () => {
    for (const volts of [0.1, 1.5, 3, 9, 24, 120]) {
      for (const ohms of [0.01, 1, 220, 1e4, 1e7]) {
        const result = solveDc({
          nodeCount: 3,
          devices: [
            voltageSource('V1', 1, 0, volts),
            resistor('R1', 1, 2, ohms),
            diode('D1', 2, 0, { saturationCurrent: 1.296e-27, emissionCoefficient: 2 }),
          ],
        });
        expect(result.ok, `${volts} V, ${ohms} Ω`).toBe(true);
      }
    }
  });
});

describe('device validation', () => {
  it('rejects non-physical parameters', () => {
    expect(() => resistor('R1', 1, 0, 0)).toThrow(RangeError);
    expect(() => resistor('R1', 1, 0, Number.NaN)).toThrow(RangeError);
    expect(() => voltageSource('V1', 1, 0, Infinity)).toThrow(RangeError);
    expect(() => diode('D1', 1, 0, { saturationCurrent: 0, emissionCoefficient: 2 })).toThrow(
      RangeError,
    );
  });

  it('limits a large upward junction step and leaves small steps alone', () => {
    const nVt = 0.05;
    expect(limitJunctionVoltage(0.71, 0.7, nVt, 0.6)).toBe(0.71);
    const limited = limitJunctionVoltage(5, 0.7, nVt, 0.6);
    expect(limited).toBeGreaterThan(0.7);
    expect(limited).toBeLessThan(1.0);
  });
});
