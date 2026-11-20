import type { Circuit } from './dc';
import {
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
];
