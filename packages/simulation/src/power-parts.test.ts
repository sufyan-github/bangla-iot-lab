import {
  CIRCUIT_SCHEMA_VERSION,
  type CircuitComponent,
  type CircuitDocument,
  type Wire,
} from '@banglalab/shared';
import { describe, expect, it } from 'vitest';
import { SOLAR_OPEN_VOLTS, cellVolts } from './library';
import { SimulationSession } from './session';
import { simulate } from './simulate';

/**
 * Stage 2's power parts: the 18650 cell, the TP4056 charger, the LM2596
 * step-down regulator and the solar panel. Each is checked against the figures
 * its model is built from (library.ts says where each comes from). None of this
 * has been compared with the real parts.
 */

function circuit(components: CircuitComponent[], wires: [string, string][]): CircuitDocument {
  return {
    schemaVersion: CIRCUIT_SCHEMA_VERSION,
    components,
    wires: wires.map(([from, to], i): Wire => ({ id: `W${i + 1}`, from, to, color: '#000000' })),
  };
}
const battery = (voltage: number): CircuitComponent => ({
  id: 'BAT1',
  type: 'battery',
  props: { voltage },
});
const resistor = (id: string, a: string, b: string, resistance: number): CircuitComponent => ({
  id,
  type: 'resistor',
  pins: { a, b },
  props: { resistance },
});
/** A cell with its + lead at a1 and its − lead at a7. */
const cell = (charge: number): CircuitComponent => ({
  id: 'CELL1',
  type: 'cell',
  pins: { pos: 'a1', neg: 'a7' },
  props: { charge, capacity: 2600 },
});
/** A panel with its + wire at a20 and its − wire at a22. */
const panel = (light: number): CircuitComponent => ({
  id: 'PV1',
  type: 'solar',
  pins: { pos: 'a20', neg: 'a22' },
  props: { light },
});
/** A charger along columns 10 to 17: IN+ 10, IN− 11, B+ 13, B− 14, OUT+ 16, OUT− 17. */
const charger: CircuitComponent = {
  id: 'CHG1',
  type: 'tp4056',
  pins: { inp: 'c10', inn: 'c11', bp: 'c13', bn: 'c14', outp: 'c16', outn: 'c17' },
  props: {},
};
const cellOnCharger: [string, string][] = [
  ['b1', 'a13'],
  ['b7', 'a14'],
];
const problems = (document: CircuitDocument) =>
  simulate(document).diagnostics.filter((d) => d.severity !== 'info');

describe('18650 cell', () => {
  it('rests at 3.0 V empty, about 3.7 V half full and 4.2 V full', () => {
    expect(cellVolts(0)).toBeCloseTo(3.0, 6);
    expect(cellVolts(0.5)).toBeCloseTo(3.74, 6);
    expect(cellVolts(1)).toBeCloseTo(4.2, 6);
  });

  it('counts as a source: the lab does not say the circuit has no battery', () => {
    const codes = (document: CircuitDocument) => simulate(document).diagnostics.map((d) => d.code);
    expect(codes(circuit([cell(0.5)], []))).not.toContain('no-battery');
    expect(codes(circuit([panel(1)], []))).not.toContain('no-battery');
  });

  it('gives its current to a load, a little lower than its resting voltage', () => {
    const loaded = circuit([cell(0.5), resistor('R1', 'c1', 'c7', 10)], []);
    const reading = simulate(loaded).readings.CELL1!;
    // Delivering: negative into its + terminal.
    expect(reading.current).toBeCloseTo(-3.74 / 10.05, 3);
    expect(reading.voltage).toBeLessThan(3.74);
    expect(problems(loaded)).toEqual([]);
  });

  it('a wire across it is a short circuit', () => {
    const shorted = circuit([cell(1)], [['b1', 'b7']]);
    expect(problems(shorted)).toMatchObject([{ code: 'short-circuit', componentId: 'CELL1' }]);
  });

  it('charged straight from a 5 V supply, with no charger to stop it, the lab warns', () => {
    const forced = circuit(
      [battery(5), cell(0.9)],
      [
        ['BAT1.pos', 'b1'],
        ['BAT1.neg', 'b7'],
      ],
    );
    expect(problems(forced)).toMatchObject([{ code: 'cell-overcharge', componentId: 'CELL1' }]);
  });
});

describe('5 V solar panel', () => {
  const across = (light: number, ohms: number) =>
    simulate(circuit([panel(light), resistor('R1', 'c20', 'c22', ohms)], [])).readings.PV1!;

  it('gives 7.2 V with almost nothing connected in full sun, and nothing in the dark', () => {
    expect(across(1, 1e6).voltage).toBeCloseTo(SOLAR_OPEN_VOLTS, 1);
    expect(across(0, 1e6).voltage).toBeCloseTo(0, 3);
  });

  it('gives about 1.1 A into a short in full sun, and half that in half the light', () => {
    expect(across(1, 0.01).current).toBeCloseTo(1.1, 1);
    expect(across(0.5, 0.01).current).toBeCloseTo(0.55, 1);
  });

  it('gives most power at around 5 to 6 V, as a 5 V panel should', () => {
    const power = (ohms: number) => {
      const r = across(1, ohms);
      return { volts: r.voltage, watts: r.voltage * r.current };
    };
    const curve = [3, 4, 5, 6, 8, 12, 20].map(power);
    const best = curve.reduce((a, b) => (b.watts > a.watts ? b : a));
    expect(best.volts).toBeGreaterThan(4.5);
    expect(best.volts).toBeLessThan(6.5);
    expect(best.watts).toBeGreaterThan(4);
    expect(best.watts).toBeLessThan(6.5);
  });
});

describe('TP4056 charger', () => {
  const fromBattery = (charge: number, volts = 5) =>
    circuit(
      [battery(volts), charger, cell(charge)],
      [['BAT1.pos', 'a10'], ['BAT1.neg', 'a11'], ...cellOnCharger],
    );

  it('charges a half-full cell at 1 A, taking the same 1 A from its input, red light on', () => {
    const result = simulate(fromBattery(0.5));
    const reading = result.readings.CHG1!;
    expect(reading.current).toBeCloseTo(1, 3);
    expect(result.readings.CELL1!.current).toBeCloseTo(1, 3);
    // The battery delivers it (a battery's reading counts what it delivers as positive).
    expect(result.readings.BAT1!.current).toBeCloseTo(1, 2);
    expect(reading.activity).toBe(1);
    expect(problems(fromBattery(0.5))).toEqual([]);
  });

  it('holds a full cell at 4.2 V with little current, blue light on', () => {
    const result = simulate(fromBattery(1));
    expect(result.readings.CHG1!.voltage).toBeCloseTo(4.2, 2);
    expect(result.readings.CHG1!.current).toBeLessThan(0.1);
    expect(result.readings.CHG1!.activity).toBe(2);
    expect(result.readings.CELL1!.voltage).toBeLessThan(4.25);
  });

  it('with nothing on its input it does nothing, and the cell does not feed back', () => {
    const idle = circuit([charger, cell(0.5)], cellOnCharger);
    const result = simulate(idle);
    expect(Math.abs(result.readings.CELL1!.current)).toBeLessThan(1e-5);
    expect(result.readings.CHG1!.activity).toBe(0);
  });

  it('warns above 8 V on its input', () => {
    expect(problems(fromBattery(0.5, 9))).toMatchObject([
      { code: 'charger-input-high', componentId: 'CHG1', limit: 8 },
    ]);
  });

  it('from a dim panel it charges with what the panel can give', () => {
    const solar = (light: number) =>
      simulate(
        circuit(
          [panel(light), charger, cell(0.5)],
          [['a20', 'a10'], ['a22', 'a11'], ...cellOnCharger],
        ),
      ).readings;
    const bright = solar(1);
    const dim = solar(0.3);
    // Full sun: the charge current is reached. Dim: the panel limits it, about 0.33 A.
    expect(bright.CHG1!.current).toBeCloseTo(1, 2);
    expect(dim.CHG1!.current).toBeGreaterThan(0.25);
    expect(dim.CHG1!.current).toBeLessThan(0.34);
    // In dim light the panel is pulled down close to the cell's voltage.
    expect(dim.PV1!.voltage).toBeLessThan(dim.CHG1!.voltage + 0.5);
  });

  it('its protection cuts off a load that takes too much, and lets go when it is removed', () => {
    const heavy = circuit([charger, cell(0.8), resistor('R1', 'a16', 'a17', 0.5)], cellOnCharger);
    const result = simulate(heavy);
    expect(problems(heavy)).toMatchObject([{ code: 'protection-tripped', componentId: 'CHG1' }]);
    // The load is cut off: the cell gives almost nothing.
    expect(Math.abs(result.readings.CELL1!.current)).toBeLessThan(0.01);
    const light = circuit([charger, cell(0.8), resistor('R1', 'a16', 'a17', 100)], cellOnCharger);
    // 3.97 V into 100 Ω, the cell's 50 mΩ and the protection's 50 mΩ.
    expect(simulate(light).readings.CELL1!.current).toBeCloseTo(-3.97 / 100.1, 3);
  });

  it('a running session charges steadily', () => {
    const session = new SimulationSession(fromBattery(0.5));
    session.advance(50);
    expect(session.frame().result.readings.CHG1!.current).toBeCloseTo(1, 3);
  });
});

describe('LM2596 step-down regulator', () => {
  /** The regulator along columns 24 to 30: IN+ 24, IN− 25, OUT− 29, OUT+ 30. */
  const regulator = (volts: number): CircuitComponent => ({
    id: 'REG1',
    type: 'lm2596',
    pins: { inp: 'c24', inn: 'c25', outn: 'c29', outp: 'c30' },
    props: { volts },
  });
  const powered = (supply: number, set: number, load: number) =>
    circuit(
      [battery(supply), regulator(set), resistor('R1', 'b30', 'b29', load)],
      [
        ['BAT1.pos', 'a24'],
        ['BAT1.neg', 'a25'],
      ],
    );

  it('makes 5 V from 9 V, taking less current from its input than it gives', () => {
    const result = simulate(powered(9, 5, 10));
    const reg = result.readings.REG1!;
    expect(reg.voltage).toBeCloseTo(5, 1);
    expect(reg.current).toBeCloseTo(0.5, 1);
    // 2.5 W out at 80 % and 5 mA of its own: about 0.35 A from 9 V.
    expect(result.readings.BAT1!.current).toBeGreaterThan(0.33);
    expect(result.readings.BAT1!.current).toBeLessThan(0.37);
    expect(reg.activity).toBe(1);
    expect(problems(powered(9, 5, 10))).toEqual([]);
  });

  it('cannot make 8 V from 9 V: its output is about 1.2 V below its input', () => {
    const result = simulate(powered(9, 8, 100));
    expect(result.readings.REG1!.voltage).toBeLessThan(7.9);
    expect(problems(powered(9, 8, 100))).toMatchObject([
      { code: 'regulator-dropout', componentId: 'REG1' },
    ]);
  });

  it('warns past 3 A, and says so when its input is too low to work', () => {
    expect(problems(powered(12, 5, 1))).toMatchObject([
      { code: 'regulator-overload', componentId: 'REG1' },
    ]);
    expect(problems(powered(3, 2, 100))).toMatchObject([
      { code: 'module-underpowered', componentId: 'REG1', limit: 4.5 },
    ]);
  });
});
