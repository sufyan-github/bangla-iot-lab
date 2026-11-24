import type { Circuit } from './dc';
import {
  currentSource,
  diode,
  npnTransistor,
  resistor,
  theveninSource,
  voltageSource,
  type DiodeModel,
  type TransistorModel,
} from './devices';

/**
 * Reference circuits solved by both this engine and ngspice.
 * `pnpm golden:regen` rewrites golden/*.json from ngspice; the unit tests then
 * compare our solver against those files. Node 0 is ground.
 */
export interface GoldenCase {
  name: string;
  description: string;
  build(): Circuit;
}

// LED models fitted so the forward voltage at 20 mA matches typical datasheets.
const RED_LED: DiodeModel = { saturationCurrent: 1.557e-17, emissionCoefficient: 2 };
const BLUE_LED: DiodeModel = { saturationCurrent: 1.296e-27, emissionCoefficient: 2 };
const NPN: TransistorModel = { saturationCurrent: 1e-14, forwardGain: 200, reverseGain: 2 };
const SILICON: DiodeModel = { saturationCurrent: 1e-14, emissionCoefficient: 1 };

export const GOLDEN_CASES: GoldenCase[] = [
  {
    name: 'voltage-divider',
    description: '9 V across 1 kΩ and 2 kΩ in series',
    build: () => ({
      nodeCount: 3,
      devices: [
        voltageSource('V1', 1, 0, 9),
        resistor('R1', 1, 2, 1000),
        resistor('R2', 2, 0, 2000),
      ],
    }),
  },
  {
    name: 'wheatstone-bridge',
    description: 'Unbalanced resistor bridge with a 5 V source and a bridge resistor',
    build: () => ({
      nodeCount: 4,
      devices: [
        voltageSource('V1', 1, 0, 5),
        resistor('R1', 1, 2, 100),
        resistor('R2', 2, 0, 220),
        resistor('R3', 1, 3, 330),
        resistor('R4', 3, 0, 470),
        resistor('R5', 2, 3, 1000),
      ],
    }),
  },
  {
    name: 'led-red-220',
    description: '9 V battery (0.5 Ω internal), 220 Ω resistor and a red LED in series',
    build: () => ({
      nodeCount: 4,
      devices: [
        voltageSource('V1', 1, 0, 9),
        resistor('Rint', 1, 2, 0.5),
        resistor('R1', 2, 3, 220),
        diode('D1', 3, 0, RED_LED),
      ],
    }),
  },
  {
    name: 'led-blue-330',
    description: '5 V source, 330 Ω resistor and a blue LED in series',
    build: () => ({
      nodeCount: 3,
      devices: [
        voltageSource('V1', 1, 0, 5),
        resistor('R1', 1, 2, 330),
        diode('D1', 2, 0, BLUE_LED),
      ],
    }),
  },
  {
    name: 'led-reversed',
    description: 'Red LED connected backwards: almost no current flows',
    build: () => ({
      nodeCount: 3,
      devices: [
        voltageSource('V1', 1, 0, 9),
        resistor('R1', 1, 2, 220),
        diode('D1', 0, 2, RED_LED),
      ],
    }),
  },
  {
    name: 'led-no-resistor',
    description: 'Red LED straight across a 9 V battery: only internal resistance limits current',
    build: () => ({
      nodeCount: 3,
      devices: [
        voltageSource('V1', 1, 0, 9),
        resistor('Rint', 1, 2, 0.5),
        diode('D1', 2, 0, RED_LED),
      ],
    }),
  },
  {
    name: 'leds-in-parallel',
    description: 'Red and blue LED branches, each with its own resistor, on one 9 V source',
    build: () => ({
      nodeCount: 4,
      devices: [
        voltageSource('V1', 1, 0, 9),
        resistor('R1', 1, 2, 330),
        diode('D1', 2, 0, RED_LED),
        resistor('R2', 1, 3, 470),
        diode('D2', 3, 0, BLUE_LED),
      ],
    }),
  },
  {
    name: 'leds-in-series',
    description: 'Two red LEDs and one 150 Ω resistor in series on 9 V',
    build: () => ({
      nodeCount: 4,
      devices: [
        voltageSource('V1', 1, 0, 9),
        resistor('R1', 1, 2, 150),
        diode('D1', 2, 3, RED_LED),
        diode('D2', 3, 0, RED_LED),
      ],
    }),
  },
  {
    name: 'batteries-in-series',
    description: 'Two 1.5 V cells in series driving a red LED through 47 Ω',
    build: () => ({
      nodeCount: 4,
      devices: [
        voltageSource('V1', 1, 0, 1.5),
        voltageSource('V2', 2, 1, 1.5),
        resistor('R1', 2, 3, 47),
        diode('D1', 3, 0, RED_LED),
      ],
    }),
  },
  {
    name: 'silicon-diode-clamp',
    description: 'Silicon diode (n = 1) clamping the midpoint of a resistor divider',
    build: () => ({
      nodeCount: 3,
      devices: [
        voltageSource('V1', 1, 0, 12),
        resistor('R1', 1, 2, 1000),
        resistor('R2', 2, 0, 4700),
        diode('D1', 2, 0, SILICON),
      ],
    }),
  },
  {
    name: 'output-pin-led',
    description: 'Microcontroller pin (5 V behind 25 Ω) driving a red LED through 220 Ω',
    build: () => ({
      nodeCount: 3,
      devices: [
        theveninSource('P13', 1, 0, 5, 25),
        resistor('R1', 1, 2, 220),
        diode('D1', 2, 0, RED_LED),
      ],
    }),
  },
  {
    name: 'pullup-and-divider',
    description:
      '35 kΩ pull-up to 5 V against a 10 kΩ load, beside a 0.2 Ω supply feeding a divider',
    build: () => ({
      nodeCount: 4,
      devices: [
        theveninSource('PU', 1, 0, 5, 35_000),
        resistor('R1', 1, 0, 10_000),
        theveninSource('VCC', 2, 0, 5, 0.2),
        resistor('R2', 2, 3, 7_500),
        resistor('R3', 3, 0, 2_500),
      ],
    }),
  },
  {
    name: 'transistor-switch',
    description:
      'NPN switching a 25 Ω load from 9 V, base driven by a 5 V pin through 1 kΩ (saturated)',
    build: () => ({
      nodeCount: 5,
      devices: [
        voltageSource('V1', 1, 0, 9),
        resistor('RL', 1, 2, 25),
        theveninSource('P9', 3, 0, 5, 25),
        resistor('RB', 3, 4, 1000),
        npnTransistor('Q1', 2, 4, 0, NPN),
      ],
    }),
  },
  {
    name: 'transistor-amplifier',
    description: 'NPN in its active region: divider bias, collector and emitter resistors',
    build: () => ({
      nodeCount: 5,
      devices: [
        voltageSource('V1', 1, 0, 12),
        resistor('R1', 1, 2, 47_000),
        resistor('R2', 2, 0, 10_000),
        resistor('RC', 1, 3, 2_200),
        resistor('RE', 4, 0, 470),
        npnTransistor('Q1', 3, 2, 4, NPN),
      ],
    }),
  },
  {
    // An "off" transistor is deliberately not a reference case: its collector node is set
    // only by picoampere leakage, where simulators legitimately differ by tens of millivolts.
    name: 'transistor-emitter-follower',
    description: 'NPN emitter follower lighting a red LED through 330 Ω from a 3 V base level',
    build: () => ({
      nodeCount: 5,
      devices: [
        voltageSource('V1', 1, 0, 9),
        resistor('R1', 1, 2, 20_000),
        resistor('R2', 2, 0, 10_000),
        npnTransistor('Q1', 1, 2, 3, NPN),
        resistor('RE', 3, 4, 330),
        diode('D1', 4, 0, RED_LED),
      ],
    }),
  },
  {
    name: 'r2r-ladder-dac',
    description: 'A 4-bit R-2R ladder (1 kΩ / 2 kΩ) turning the code 1011 at 5 V into a voltage',
    build: () => ({
      // Bits b3..b0 are sources at nodes 1..4; ladder nodes 5..8, 8 the output.
      nodeCount: 9,
      devices: [
        voltageSource('B3', 1, 0, 5),
        voltageSource('B2', 2, 0, 0),
        voltageSource('B1', 3, 0, 5),
        voltageSource('B0', 4, 0, 5),
        resistor('Rt', 5, 0, 2000),
        resistor('R0', 4, 5, 2000),
        resistor('L1', 5, 6, 1000),
        resistor('R1', 3, 6, 2000),
        resistor('L2', 6, 7, 1000),
        resistor('R2', 2, 7, 2000),
        resistor('L3', 7, 8, 1000),
        resistor('R3', 1, 8, 2000),
      ],
    }),
  },
  {
    name: 'current-divider',
    description: 'A 10 mA source into 100 Ω, 220 Ω and 470 Ω in parallel',
    build: () => ({
      nodeCount: 2,
      devices: [
        currentSource('I1', 1, 0, 0.01),
        resistor('R1', 1, 0, 100),
        resistor('R2', 1, 0, 220),
        resistor('R3', 1, 0, 470),
      ],
    }),
  },
  {
    name: 'batteries-in-parallel',
    description: 'A 9 V (0.5 Ω) and a 7.2 V (0.3 Ω) battery joined in parallel across 100 Ω',
    build: () => ({
      nodeCount: 2,
      devices: [
        theveninSource('BA', 1, 0, 9, 0.5),
        theveninSource('BB', 1, 0, 7.2, 0.3),
        resistor('RL', 1, 0, 100),
      ],
    }),
  },
  {
    name: 'battery-charging',
    description: 'A 9 V supply charging a 3.7 V cell (0.1 Ω) through 10 Ω',
    build: () => ({
      nodeCount: 3,
      devices: [
        voltageSource('V1', 1, 0, 9),
        resistor('R1', 1, 2, 10),
        theveninSource('CELL', 2, 0, 3.7, 0.1),
      ],
    }),
  },
  {
    name: 't-attenuator',
    description:
      'A T-shaped attenuator (50 Ω, 50 Ω, 100 Ω to ground) between a 50 Ω source and load',
    build: () => ({
      nodeCount: 4,
      devices: [
        theveninSource('VS', 1, 0, 2, 50),
        resistor('Ra', 1, 2, 50),
        resistor('Rshunt', 2, 0, 100),
        resistor('Rb', 2, 3, 50),
        resistor('RL', 3, 0, 50),
      ],
    }),
  },
  {
    name: 'balanced-bridge',
    description: 'A balanced Wheatstone bridge (100/200 and 150/300 Ω): no current in the bridge',
    build: () => ({
      nodeCount: 4,
      devices: [
        voltageSource('V1', 1, 0, 6),
        resistor('R1', 1, 2, 100),
        resistor('R2', 2, 0, 200),
        resistor('R3', 1, 3, 150),
        resistor('R4', 3, 0, 300),
        resistor('R5', 2, 3, 1000),
      ],
    }),
  },
  {
    name: 'resistor-chain',
    description: 'Ten resistors from 100 Ω to 1 kΩ in a chain across 12 V: a many-step divider',
    build: () => ({
      nodeCount: 11,
      devices: [
        voltageSource('V1', 1, 0, 12),
        ...Array.from({ length: 10 }, (_, i) =>
          resistor(`R${i + 1}`, i + 1, i === 9 ? 0 : i + 2, 100 * (i + 1)),
        ),
      ],
    }),
  },
  {
    name: 'two-source-mesh',
    description: 'Two sources (10 V and 5 V) in a two-loop circuit sharing a 20 Ω branch',
    build: () => ({
      nodeCount: 4,
      devices: [
        voltageSource('V1', 1, 0, 10),
        resistor('R1', 1, 2, 10),
        resistor('R2', 2, 0, 20),
        resistor('R3', 2, 3, 30),
        voltageSource('V2', 3, 0, 5),
      ],
    }),
  },
  {
    name: 'diode-bridge-rectifier',
    description:
      'Four silicon diodes in a bridge rectifier fed 9 V DC, into 1 kΩ: two diodes conduct',
    build: () => ({
      // Input between node 1 and ground; the bridge's output is + at 2 and − at 3.
      nodeCount: 4,
      devices: [
        voltageSource('V1', 1, 0, 9),
        diode('D1', 1, 2, SILICON),
        diode('D2', 0, 2, SILICON),
        diode('D3', 3, 1, SILICON),
        diode('D4', 3, 0, SILICON),
        resistor('RL', 2, 3, 1000),
      ],
    }),
  },
  {
    name: 'diode-or-gate',
    description: 'Diode OR gate: inputs at 5 V and 0 V through silicon diodes, 10 kΩ to ground',
    build: () => ({
      nodeCount: 4,
      devices: [
        voltageSource('VA', 1, 0, 5),
        voltageSource('VB', 2, 0, 0),
        diode('DA', 1, 3, SILICON),
        diode('DB', 2, 3, SILICON),
        resistor('RL', 3, 0, 10_000),
      ],
    }),
  },
  {
    name: 'diode-and-gate',
    description: 'Diode AND gate: 10 kΩ pull-up to 5 V, one input at 5 V and one at 0 V',
    build: () => ({
      nodeCount: 5,
      devices: [
        voltageSource('VCC', 1, 0, 5),
        resistor('RP', 1, 2, 10_000),
        voltageSource('VA', 3, 0, 5),
        voltageSource('VB', 4, 0, 0),
        diode('DA', 2, 3, SILICON),
        diode('DB', 2, 4, SILICON),
      ],
    }),
  },
  {
    name: 'led-current-source',
    description: 'A red LED fed a steady 15 mA, as from a constant-current driver',
    build: () => ({
      nodeCount: 2,
      devices: [currentSource('I1', 1, 0, 0.015), diode('D1', 1, 0, RED_LED)],
    }),
  },
  {
    name: 'solar-cell-load',
    description: 'A solar cell (40 mA light current, a silicon junction) across a 50 Ω load',
    build: () => ({
      nodeCount: 2,
      devices: [
        currentSource('IL', 1, 0, 0.04),
        diode('DJ', 1, 0, SILICON),
        resistor('RL', 1, 0, 50),
      ],
    }),
  },
  {
    name: 'transistor-led-driver',
    description:
      'A 3.3 V pin (25 Ω) through 1 kΩ to an NPN, lighting a red LED with 220 Ω from 5 V',
    build: () => ({
      nodeCount: 6,
      devices: [
        voltageSource('V5', 1, 0, 5),
        resistor('R1', 1, 2, 220),
        diode('D1', 2, 3, RED_LED),
        theveninSource('PIN', 4, 0, 3.3, 25),
        resistor('RB', 4, 5, 1000),
        npnTransistor('Q1', 3, 5, 0, NPN),
      ],
    }),
  },
  {
    name: 'darlington-pair',
    description:
      'Two NPNs as a Darlington pair driving 100 Ω from 12 V, base through 100 kΩ from 5 V',
    build: () => ({
      nodeCount: 6,
      devices: [
        voltageSource('V12', 1, 0, 12),
        resistor('RL', 1, 2, 100),
        voltageSource('V5', 3, 0, 5),
        resistor('RB', 3, 4, 100_000),
        // The first transistor's emitter feeds the second's base; both collectors share the load.
        npnTransistor('Q1', 2, 4, 5, NPN),
        npnTransistor('Q2', 2, 5, 0, NPN),
      ],
    }),
  },
];
