import { THERMAL_VOLTAGE, type DiodeModel } from '@banglalab/circuit-engine';
import type { LedColor } from '@banglalab/shared';

/**
 * Electrical data for the parts students can use. Values are typical datasheet
 * figures for common 5 mm through-hole parts, not measurements of one product.
 */

/** Emission coefficient used for every LED model. */
const LED_EMISSION = 2;
/** Current at which the forward voltages below are specified. */
export const LED_RATED_CURRENT = 0.02;
/** Above this the LED is being overdriven and its life shortens. */
export const LED_MAX_CURRENT = 0.03;
/** Above this a real 5 mm LED fails almost immediately. */
export const LED_BURN_CURRENT = 0.1;
/** Below this the light is too faint to notice in a lit room. */
export const LED_VISIBLE_CURRENT = 0.0002;

/** Forward voltage at 20 mA, by colour. */
export const LED_FORWARD_VOLTAGE: Record<LedColor, number> = {
  red: 1.8,
  yellow: 2.0,
  green: 2.1,
  blue: 3.0,
  white: 3.1,
};

/** Shockley parameters that reproduce the colour's forward voltage at 20 mA. */
export function ledDiodeModel(color: LedColor): DiodeModel {
  const nVt = LED_EMISSION * THERMAL_VOLTAGE;
  return {
    saturationCurrent: LED_RATED_CURRENT / Math.expm1(LED_FORWARD_VOLTAGE[color] / nVt),
    emissionCoefficient: LED_EMISSION,
  };
}

/**
 * Internal resistance of a battery, ohms. It keeps a shorted battery solvable
 * and is what makes the terminal voltage sag under a heavy load.
 */
export const BATTERY_INTERNAL_RESISTANCE = 0.5;
/** A jumper wire. Small but non-zero so each wire's current can be reported. */
export const WIRE_RESISTANCE = 0.01;

/** Choices offered in the editor. */
export const BATTERY_VOLTAGES = [1.5, 3, 4.5, 6, 9, 12] as const;
export const RESISTOR_VALUES = [
  100, 150, 220, 330, 470, 680, 1_000, 2_200, 4_700, 10_000, 47_000, 100_000,
] as const;

/** Electrical model of an ATmega328P pin at 5 V (typical datasheet values). */
export const PIN_OUTPUT_RESISTANCE = 25;
export const PIN_PULLUP_RESISTANCE = 35_000;
/** Leakage path of a high-impedance input; it also makes an unconnected input read 0 V. */
export const PIN_INPUT_RESISTANCE = 100_000_000;
/** Absolute maximum current for one pin. */
export const PIN_MAX_CURRENT = 0.04;
/** Above this an input reads HIGH, below `LOGIC_LOW` it reads LOW, between them it keeps its last value. */
export const LOGIC_HIGH = 3.0;
export const LOGIC_LOW = 1.5;
/** The board's 5 V socket: a stiff supply that a USB port limits to about half an ampere. */
export const SUPPLY_RESISTANCE = 0.2;
export const SUPPLY_MAX_CURRENT = 0.5;
export const BUTTON_CLOSED_RESISTANCE = 0.05;
/** Choices offered in the editor. */
export const POTENTIOMETER_VALUES = [1_000, 10_000, 100_000] as const;
export const CAPACITOR_VALUES = [100e-9, 1e-6, 10e-6, 100e-6, 1000e-6] as const;
