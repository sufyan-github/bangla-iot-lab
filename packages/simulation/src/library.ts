import { THERMAL_VOLTAGE, type DiodeModel, type TransistorModel } from '@banglalab/circuit-engine';
import type { CircuitComponent, LedColor } from '@banglalab/shared';

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
/** Closed contacts of a push button or switch. */
export const CONTACT_RESISTANCE = 0.05;
/** Choices offered in the editor. */
export const POTENTIOMETER_VALUES = [1_000, 10_000, 100_000] as const;
export const CAPACITOR_VALUES = [100e-9, 1e-6, 10e-6, 100e-6, 1000e-6] as const;

/** General-purpose rectifier diode (1N4007): about 0.7 V at 20 mA. */
export const SILICON_DIODE: DiodeModel = { saturationCurrent: 7.03e-9, emissionCoefficient: 1.81 };
/** Small-signal NPN transistor (BC547 / 2N2222 class) with a gain of 200. */
export const NPN_TRANSISTOR: TransistorModel = {
  saturationCurrent: 1e-14,
  forwardGain: 200,
  reverseGain: 2,
};

/** LDR resistance: 1 MΩ in the dark falling to 1 kΩ in bright light, evenly on a log scale. */
export function ldrResistance(light: number): number {
  return 10 ** (6 - 3 * light);
}

/** A 5 V buzzer with a built-in oscillator draws about 25 mA and starts sounding near 2.5 V. */
export const BUZZER_RESISTANCE = 200;
export const BUZZER_ON_VOLTAGE = 2.5;

/**
 * A small hobby motor, modelled as its winding resistance only. That gives the
 * stall current (240 mA at 6 V), which is what decides whether a pin can drive
 * it; a spinning motor draws less. Speed is shown in proportion to voltage.
 */
export const MOTOR_RESISTANCE = 25;
export const MOTOR_RATED_VOLTAGE = 6;
export const MOTOR_START_VOLTAGE = 0.6;

/** Total resistance of a three-pin sensor module from supply to ground. */
export const SENSOR_RESISTANCE = 10_000;

/**
 * Output of a three-pin sensor module as a fraction of its supply voltage.
 * The modules are modelled as voltage dividers, which is exact at 5 V and
 * makes the output fall to zero when the module is not powered.
 */
export function sensorOutputFraction(
  sensor: Extract<CircuitComponent, { type: 'temperature' | 'soil' | 'ir' }>,
): number {
  switch (sensor.type) {
    case 'temperature':
      return (sensor.props.celsius * 0.01) / 5; // LM35: 10 mV per °C
    case 'soil':
      return 0.9 - 0.6 * sensor.props.moisture; // dry reads high, wet reads low
    case 'ir':
      return sensor.props.detected ? 0.01 : 0.999; // output is pulled LOW by an obstacle
  }
}

/**
 * Small 5 V relay: a 70 Ω coil (71 mA at 5 V, more than a board pin may supply).
 * The contact closes once the coil carries 50 mA and stays closed until the
 * current falls below 15 mA, as a real relay holds on with less than it needs to pull in.
 */
export const RELAY_COIL_RESISTANCE = 70;
export const RELAY_PULL_IN_CURRENT = 0.05;
export const RELAY_DROP_OUT_CURRENT = 0.015;

/** What each powered module draws from its supply, as a resistance at 5 V. */
export const MODULE_SUPPLY_RESISTANCE = { servo: 500, ultrasonic: 330, lcd: 2500 } as const;
/** A module counts as powered above this supply voltage. */
export const MODULE_MIN_SUPPLY = 4;

/**
 * DHT11 temperature and humidity sensor. Timing and supply from its datasheet
 * (Aosong, "DHT11 Humidity & Temperature Sensor"); none of it measured here.
 */
/** Works from 3 V, so also from the ESP32's 3.3 V pin. */
export const DHT11_MIN_SUPPLY = 3;
/** About 1 mA while measuring at 3.3 V. */
export const DHT11_SUPPLY_RESISTANCE = 3300;
/** The pull-up resistor on the three-pin module's data line. ESTIMATE: modules carry 4.7 kΩ to 10 kΩ. */
export const DHT11_PULLUP_RESISTANCE = 5100;
/** How long the program must hold the data line LOW to ask for a reading, milliseconds. */
export const DHT11_START_MS = 18;
/** The answer, in microseconds: a pause, LOW, HIGH, then for each of 40 bits a LOW and a HIGH. */
export const DHT11_TIMING_US = {
  pause: 30,
  low: 80,
  high: 80,
  bitLow: 50,
  zero: 27,
  one: 70,
} as const;

/** Arduino's Servo library: 544 µs is 0° and 2400 µs is 180°. */
export const SERVO_MIN_PULSE_US = 544;
export const SERVO_MAX_PULSE_US = 2400;
/** HC-SR04: the echo starts about 460 µs after the trigger and lasts 58 µs per centimetre. */
export const ULTRASONIC_ECHO_DELAY_MS = 0.46;
export const ULTRASONIC_MS_PER_CM = 0.058;
export const ULTRASONIC_MIN_TRIGGER_MS = 0.008;
