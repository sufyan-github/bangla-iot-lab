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

/** Shockley parameters that reproduce a forward voltage at 20 mA. */
export function diodeModelFor(forwardVoltage: number): DiodeModel {
  const nVt = LED_EMISSION * THERMAL_VOLTAGE;
  return {
    saturationCurrent: LED_RATED_CURRENT / Math.expm1(forwardVoltage / nVt),
    emissionCoefficient: LED_EMISSION,
  };
}

/** Shockley parameters that reproduce the colour's forward voltage at 20 mA. */
export function ledDiodeModel(color: LedColor): DiodeModel {
  return diodeModelFor(LED_FORWARD_VOLTAGE[color]);
}

/**
 * The three LEDs of an RGB LED module. REPORTED by one maker of the module
 * (Joy-IT, KY-016: red 1.8 V, green and blue 2.8 V); not measured on the kit's
 * module. Green here is not the green of a single 5 mm LED above: an RGB LED
 * uses a different kind, which needs nearly as much voltage as blue.
 */
export const RGB_CHANNELS = ['r', 'g', 'b'] as const;
export type RgbChannel = (typeof RGB_CHANNELS)[number];
export const RGB_FORWARD_VOLTAGE: Record<RgbChannel, number> = { r: 1.8, g: 2.8, b: 2.8 };

/**
 * Internal resistance of a battery, ohms. It keeps a shorted battery solvable
 * and is what makes the terminal voltage sag under a heavy load.
 */
export const BATTERY_INTERNAL_RESISTANCE = 0.5;
/** A jumper wire. Small but non-zero so each wire's current can be reported. */
export const WIRE_RESISTANCE = 0.01;

/** Choices offered in the editor. */
/** 7.2 V is the school kit's pack of six rechargeable AA cells. */
export const BATTERY_VOLTAGES = [1.5, 3, 4.5, 6, 7.2, 9, 12] as const;
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
 * Four-pin sensor modules (LDR, rain, gas): the sensing part and a fixed
 * resistor make a voltage divider, whose tap is the AO pin; a comparator
 * compares the tap with a trimmer and pulls the DO pin LOW (and lights the
 * module's second LED) on one side of it.
 *
 * REPORTED by sellers' pages: which way AO moves and when DO is LOW. ESTIMATE:
 * every resistance below. No schematic of the kit's modules has been seen and
 * nothing here is measured; hardware tests C11, C12 and C14 are there for that.
 */
export type AnalogModule = Extract<CircuitComponent, { type: 'ldrmodule' | 'rain' | 'mq135' }>;
/** The fixed resistor that the LDR is in series with. ESTIMATE. */
export const LDR_MODULE_RESISTANCE = 10_000;
/** The resistor that holds DO HIGH; the comparator can only pull it LOW. ESTIMATE. */
export const MODULE_DO_PULLUP = 10_000;
/** The comparator's output while it pulls DO LOW. ESTIMATE. */
export const MODULE_DO_LOW_RESISTANCE = 100;
/** Below this supply the comparator and its LED do nothing (LM393: from 2 V). */
export const MODULE_COMPARATOR_MIN_SUPPLY = 2;

/**
 * The AO pin of a four-pin module as a fraction of its supply, with nothing
 * heavy connected to it.
 */
export function moduleOutputFraction(module: AnalogModule): number {
  switch (module.type) {
    case 'ldrmodule': {
      // The LDR is the lower half of the divider: more light, less voltage.
      const ldr = ldrResistance(module.props.light);
      return ldr / (ldr + LDR_MODULE_RESISTANCE);
    }
    case 'rain':
      // Dry tracks hardly conduct; water joins them. ESTIMATE of how far AO falls.
      return 0.98 - 0.68 * module.props.wetness;
    case 'mq135':
      // The sensing layer conducts better in bad air, which raises AO. ESTIMATE of the range.
      return 0.1 + 0.7 * module.props.gas;
  }
}

/** True while the module's comparator pulls DO LOW: bright, wet, or bad air. */
export function moduleTripped(module: AnalogModule): boolean {
  const fraction = moduleOutputFraction(module);
  return module.type === 'mq135'
    ? fraction > module.props.threshold
    : fraction < module.props.threshold;
}

/**
 * MQ-135 heater. REPORTED: 33 Ω ± 5 % in one maker's datasheet (Hanwei), 30 Ω ± 3 Ω
 * in another's (Winsen); both give 5 V as the heater's supply. About 150 mA.
 */
export const MQ135_HEATER_RESISTANCE = 33;

/**
 * HC-SR501 motion sensor. REPORTED by sellers' datasheets, which do not all
 * agree: supply 4.5 V to 20 V; output 3.3 V or 0 V; after its output falls it
 * ignores movement for 2.5 s (one seller says 8 s). The shortest hold time of
 * its trimmer is given as 0.3 s, 3 s or 5 s, and the longest as 200 s or 300 s.
 * ESTIMATE: the output and supply resistances. Nothing measured (test C15).
 */
export const PIR_OUTPUT_VOLTS = 3.3;
export const PIR_OUTPUT_RESISTANCE = 1000;
/** Draws well under a milliamp. */
export const PIR_SUPPLY_RESISTANCE = 100_000;
export const PIR_BLOCK_MS = 2500;

/**
 * 0.96 inch OLED display module (SSD1306, I2C). REPORTED by sellers: it works
 * from 3.3 V to 5 V, answers at address 0x3C, and carries pull-up resistors on
 * both bus lines. ESTIMATE: the value of those resistors, and its current,
 * which on a real module rises with the number of lit pixels.
 */
export const OLED_ADDRESS = 0x3c;
export const OLED_PULLUP_RESISTANCE = 4700;
/** About 10 mA at 3.3 V. */
export const OLED_SUPPLY_RESISTANCE = 330;

/**
 * L298N dual motor driver module. REPORTED, from the chip's datasheet
 * (STMicroelectronics, "L298", electrical characteristics): what its outputs
 * lose, typically 1.35 V on the supply side and 1.2 V on the ground side at
 * 1 A, and 2.0 V and 1.7 V at 2 A; an input is HIGH above 2.3 V and LOW below
 * 1.5 V. REPORTED, from sellers' descriptions of the module: a 78M05 regulator
 * makes its 5 V from the motor supply, and both enable pins are jumpered to
 * 5 V as sold. ESTIMATE: what the module draws at rest, and the 2 V the
 * regulator needs above its output. Nothing measured (hardware test C17).
 */
/** Each output is modelled as a junction and a resistance, fitted to the two datasheet points. */
export const L298N_JUNCTION: DiodeModel = {
  // 0.7 V at 0.2 A.
  saturationCurrent: 0.2 / Math.expm1(0.7 / (2 * THERMAL_VOLTAGE)),
  emissionCoefficient: 2,
};
export const L298N_SOURCE_RESISTANCE = 0.65;
export const L298N_SINK_RESISTANCE = 0.5;
export const L298N_INPUT_HIGH = 2.3;
export const L298N_INPUT_LOW = 1.5;
/** What an input draws, as a resistance to ground; it also makes an unconnected input read LOW. */
export const L298N_INPUT_RESISTANCE = 100_000;
/**
 * What the module takes at rest, about 43 mA in all: 13 mA straight from the
 * motor supply and 30 mA of logic current from its 5 V (the datasheet's typical
 * figures are 13 mA and 24 to 36 mA), each as a resistance.
 */
export const L298N_REST_RESISTANCE = 550;
export const L298N_LOGIC_RESISTANCE = 167;
/** The 5 V the module makes, and how far above it the motor supply must be. */
export const L298N_LOGIC_VOLTS = 5;
export const L298N_REGULATOR_DROPOUT = 2;
/** The chip's logic works from 4.5 V. */
export const L298N_LOGIC_MIN = 4.5;
/** An enable jumper joins its pin to the module's 5 V. */
export const L298N_JUMPER_RESISTANCE = 1;

/**
 * One-channel 5 V relay module. REPORTED, by the relay maker for a 5 V relay of
 * this kind: a 70 Ω coil that must pull in at 75 % of 5 V (3.75 V). REPORTED by
 * sellers: an optocoupler drives the module's transistor, and a jumper chooses
 * HIGH or LOW to switch on. ESTIMATE: the optocoupler's LED resistor, the LED
 * currents at which the relay pulls in and lets go, and the lights' current.
 * Nothing measured (hardware test C9).
 */
export const RELAY_MODULE_COIL_RESISTANCE = 70;
export const RELAY_MODULE_OPTO_RESISTANCE = 1000;
/** An infrared LED, about 1.2 V. */
export const RELAY_MODULE_OPTO_FORWARD = 1.2;
export const RELAY_MODULE_PULL_IN = 0.001;
export const RELAY_MODULE_DROP_OUT = 0.0004;
/** A 5 V relay lets go once its coil has less than about this. ESTIMATE (makers give 10 % of rated). */
export const RELAY_MODULE_HOLD_VOLTS = 1.5;
/** The power light, about 2 mA. */
export const RELAY_MODULE_IDLE_RESISTANCE = 2200;

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
 * The least supply each powered module works on. Below it the module does not
 * answer (or, for the gas sensor, its heater is too cool to trust), and the lab says so.
 */
export const MIN_SUPPLY: Partial<Record<CircuitComponent['type'], number>> = {
  servo: MODULE_MIN_SUPPLY,
  ultrasonic: MODULE_MIN_SUPPLY,
  lcd: MODULE_MIN_SUPPLY,
  dht11: 3,
  mq135: 4.5,
  pir: 4.5,
  oled: 3,
  l298n: 6.5,
  relaymodule: 3.75,
};

/**
 * DHT11 temperature and humidity sensor. Timing and supply from its datasheet
 * (Aosong, "DHT11 Humidity & Temperature Sensor"); none of it measured here.
 */
/** It works from 3 V (see `MIN_SUPPLY`), so also from the ESP32's 3.3 V pin. */
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
