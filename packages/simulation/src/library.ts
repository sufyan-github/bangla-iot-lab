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
