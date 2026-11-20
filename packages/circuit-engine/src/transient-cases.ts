import type { Circuit } from './dc';
import { capacitor, diode, resistor, voltageSource } from './devices';

/**
 * Time-dependent reference circuits. ngspice solves each one
 * (`pnpm golden:regen`) and the node voltages at `sampleSeconds` are stored in
 * golden/transient-*.json for the tests to compare against.
 */
export interface TransientCase {
  name: string;
  description: string;
  /** Step used by this engine, seconds. */
  stepSeconds: number;
  stopSeconds: number;
  sampleSeconds: number[];
  /** Largest disagreement with ngspice allowed, volts (backward Euler is first-order). */
  toleranceVolts: number;
  build(): Circuit;
}

const samples = (stop: number, count: number) =>
  Array.from({ length: count }, (_, i) => (stop * (i + 1)) / count);

export const TRANSIENT_CASES: TransientCase[] = [
  {
    name: 'rc-charge',
    description: '1 µF charging from 5 V through 1 kΩ (time constant 1 ms)',
    stepSeconds: 10e-6,
    stopSeconds: 5e-3,
    sampleSeconds: samples(5e-3, 10),
    toleranceVolts: 0.012,
    build: () => ({
      nodeCount: 3,
      devices: [
        voltageSource('V1', 1, 0, 5),
        resistor('R1', 1, 2, 1000),
        capacitor('C1', 2, 0, 1e-6),
      ],
    }),
  },
  {
    name: 'capacitor-led-discharge',
    description: '100 µF charged to 5 V, discharging through 220 Ω and a red LED',
    stepSeconds: 50e-6,
    stopSeconds: 0.1,
    sampleSeconds: samples(0.1, 10),
    toleranceVolts: 0.01,
    build: () => ({
      nodeCount: 3,
      devices: [
        capacitor('C1', 1, 0, 100e-6, 5),
        resistor('R1', 1, 2, 220),
        diode('D1', 2, 0, { saturationCurrent: 1.557e-17, emissionCoefficient: 2 }),
      ],
    }),
  },
  {
    name: 'two-capacitors-in-series',
    description: 'Two capacitors in series charging through 470 Ω: the middle node has no DC path',
    // Time constant 0.7 ms: a 5 µs step keeps backward Euler's first-order error near 10 mV.
    stepSeconds: 5e-6,
    stopSeconds: 4e-3,
    sampleSeconds: samples(4e-3, 8),
    toleranceVolts: 0.02,
    build: () => ({
      nodeCount: 4,
      devices: [
        voltageSource('V1', 1, 0, 9),
        resistor('R1', 1, 2, 470),
        capacitor('C1', 2, 3, 2.2e-6),
        capacitor('C2', 3, 0, 4.7e-6),
      ],
    }),
  },
];
