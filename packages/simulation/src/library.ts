import { THERMAL_VOLTAGE, type DiodeModel, type TransistorModel } from '@banglalab/circuit-engine';
import type { Acs712Range, CircuitComponent, LedColor } from '@banglalab/shared';

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
export type AnalogModule = Extract<
  CircuitComponent,
  { type: 'ldrmodule' | 'rain' | 'mq135' | 'mq7' | 'ph' }
>;
/** Modules whose AO rises with what they sense, so DO trips above the trimmer's setting. */
const RISING_MODULES = new Set(['mq135', 'mq7', 'ph']);
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
    case 'mq7':
      // The same kind of sensing layer, for carbon monoxide. ESTIMATE of the range, as for the MQ-135.
      return 0.1 + 0.7 * module.props.co;
    case 'ph':
      return Math.min(0.98, Math.max(0.02, PH_NEUTRAL_FRACTION + (7 - module.props.ph) * PH_SLOPE));
  }
}

/** True while the module's comparator pulls DO LOW: bright, wet, or bad air. */
export function moduleTripped(module: AnalogModule): boolean {
  const fraction = moduleOutputFraction(module);
  return RISING_MODULES.has(module.type)
    ? fraction > module.props.threshold
    : fraction < module.props.threshold;
}

/**
 * MQ-135 heater. REPORTED: 33 Ω ± 5 % in one maker's datasheet (Hanwei), 30 Ω ± 3 Ω
 * in another's (Winsen); both give 5 V as the heater's supply. About 150 mA.
 */
export const MQ135_HEATER_RESISTANCE = 33;

/** MQ-7 heater. REPORTED: 31 Ω ± 3 Ω in Hanwei's datasheet (a later version says 29 Ω). */
export const MQ7_HEATER_RESISTANCE = 31;

/**
 * pH module (PH-4502C). REPORTED by sellers and users, after the board's offset
 * is set: 2.5 V at pH 7 on a 5 V supply, and about 0.18 V more for each pH unit
 * more acid (one user's buffers read 3.04 V at pH 4.01 and 2.54 V at pH 6.86).
 * ESTIMATE: that both scale with the supply. As shares of 5 V:
 */
export const PH_NEUTRAL_FRACTION = 0.5;
export const PH_SLOPE = 0.18 / 5;

/**
 * 0–25 V voltage sensor module. REPORTED by sellers: a 30 kΩ and 7.5 kΩ divider,
 * so S is a fifth of the input, rated to 25 V.
 */
export const VOLTAGE_SENSOR_UPPER = 30_000;
export const VOLTAGE_SENSOR_LOWER = 7_500;
export const VOLTAGE_SENSOR_MAX = 25;

/**
 * ACS712 current sensor. REPORTED in Allegro's datasheet: a 1.2 mΩ current path;
 * a 4.5 V to 5.5 V supply; OUT is half the supply with no current, and moves by
 * 185, 100 or 66 mV per ampere for the 5 A, 20 A and 30 A versions at 5 V; both
 * are ratiometric, that is, they scale with the supply. About 10 mA supply current.
 * ESTIMATE: the output resistance, and how the supply current is split below.
 */
export const ACS712_PATH_RESISTANCE = 0.0012;
export const ACS712_SENSITIVITY: Record<Acs712Range, number> = {
  '5A': 0.185,
  '20A': 0.1,
  '30A': 0.066,
};
export const ACS712_RANGE_AMPS: Record<Acs712Range, number> = { '5A': 5, '20A': 20, '30A': 30 };
export const ACS712_OUTPUT_RESISTANCE = 1000;
export const ACS712_SUPPLY_RESISTANCE = 570;
/** OUT as a share of the supply, for a current from IP+ to IP−; it cannot leave the rails. */
export function acs712OutputFraction(range: Acs712Range, amps: number): number {
  return Math.min(0.98, Math.max(0.02, 0.5 + (ACS712_SENSITIVITY[range] * amps) / 5));
}

/**
 * TDS meter (DFRobot SEN0244). REPORTED by DFRobot: 3.3 V to 5.5 V supply,
 * 3 to 6 mA, output 0 to 2.3 V for 0 to 1000 ppm, and the formula their sample
 * code turns the voltage back into ppm with, at 25 °C. ESTIMATE: that the output
 * does not depend on the supply (their page gives one output range for all of
 * it), and its output resistance.
 */
export const TDS_MAX_VOLTS = 2.3;
export const TDS_OUTPUT_RESISTANCE = 1000;
export const TDS_SUPPLY_RESISTANCE = 1100;
export const tdsPpm = (volts: number) =>
  (133.42 * volts ** 3 - 255.86 * volts ** 2 + 857.39 * volts) * 0.5;
/** The output voltage that the formula reads as `ppm`. */
export function tdsVolts(ppm: number): number {
  let low = 0;
  let high = TDS_MAX_VOLTS;
  for (let i = 0; i < 40; i++) {
    const middle = (low + high) / 2;
    if (tdsPpm(middle) < ppm) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}

/**
 * 18650 lithium-ion cell. REPORTED by cell datasheets: charged to 4.2 V, cut off
 * at 2.5 V (some say 3.0 V), 35 to 100 mΩ inside (measured at 1 kHz). ESTIMATE:
 * the curve below, the usual shape of a cell's resting voltage against how full
 * it is, and 50 mΩ. No one maker's curve is used.
 */
export const CELL_RESISTANCE = 0.05;
export const CELL_FULL_VOLTS = 4.2;
export const CELL_CUTOFF_VOLTS = 2.5;
/** Above this a cell is being overcharged. */
export const CELL_OVERCHARGE_VOLTS = 4.25;
/** More than this through a cell is a short circuit, whatever the cell. ESTIMATE. */
export const CELL_SHORT_AMPS = 10;
const CELL_CURVE: readonly [number, number][] = [
  [0, 3.0],
  [0.05, 3.3],
  [0.1, 3.45],
  [0.2, 3.55],
  [0.3, 3.62],
  [0.4, 3.68],
  [0.5, 3.74],
  [0.6, 3.81],
  [0.7, 3.89],
  [0.8, 3.97],
  [0.9, 4.07],
  [1, 4.2],
];
/** The cell's resting voltage when it is `charge` full (0 to 1). */
export function cellVolts(charge: number): number {
  const c = Math.min(1, Math.max(0, charge));
  for (let i = 1; i < CELL_CURVE.length; i++) {
    const [x1, y1] = CELL_CURVE[i]!;
    const [x0, y0] = CELL_CURVE[i - 1]!;
    if (c <= x1) return y0 + ((y1 - y0) * (c - x0)) / (x1 - x0);
  }
  return CELL_FULL_VOLTS;
}

/**
 * TP4056 charger. REPORTED in its datasheet (and its clones'): 4.2 V ± 1.5 %;
 * 1200 V / R_PROG of charge current, 1 A with the 1.2 kΩ the common module has;
 * 130 mA below 2.9 V; finished at a tenth of the charge current; input 4.0 V to
 * 8.0 V. A linear charger: what goes into the cell comes from the input.
 * ESTIMATE: the pass transistor's least resistance, and that it keeps charging
 * while its input stays above the cell once started.
 */
export const CHARGER_VOLTS = 4.2;
export const CHARGER_AMPS = 1;
export const CHARGER_TRICKLE_AMPS = 0.13;
export const CHARGER_TRICKLE_BELOW = 2.9;
export const CHARGER_MIN_INPUT = 4;
export const CHARGER_MAX_INPUT = 8;
export const CHARGER_MIN_PASS = 0.3;
export const CHARGER_OFF_PASS = 1e7;
/**
 * The module's protection (DW01A and two transistors). REPORTED by the DW01A's
 * makers: cut-off below 2.4 V, released above 3.0 V. ESTIMATE: about 3 A before
 * it cuts off (it depends on the transistors), 50 mΩ through them, and that it
 * releases once the load is taken away, which it senses on OUT−.
 */
export const PROTECTION_CUTOFF_VOLTS = 2.4;
export const PROTECTION_RELEASE_VOLTS = 3;
export const PROTECTION_MAX_AMPS = 3;
export const PROTECTION_RESISTANCE = 0.05;
export const PROTECTION_OPEN = 1e8;
export const PROTECTION_LOAD_GONE_VOLTS = 1;

/**
 * LM2596 step-down regulator. REPORTED by TI and onsemi: input up to 40 V, 3 A
 * out, output from 1.23 V; 73 % efficient at 12 V in, 3 V out, 3 A; the switch
 * drops 1.16 V (TI) to 1.5 V (onsemi) at 3 A. ESTIMATE: 1.2 V of drop at any
 * load, 80 % efficiency, 5 mA of its own, 4.5 V as its least input.
 */
export const REGULATOR_DROP = 1.2;
export const REGULATOR_EFFICIENCY = 0.8;
export const REGULATOR_OWN_AMPS = 0.005;
export const REGULATOR_MAX_INPUT = 40;
export const REGULATOR_MAX_AMPS = 3;
export const REGULATOR_OUTPUT_RESISTANCE = 0.05;
export const REGULATOR_OFF = 1e6;

/**
 * 5 V solar panel. REPORTED by DFRobot for its 5 V 1 A panel: 7.2 V open
 * circuit, 1 A at most. ESTIMATE: 1.1 A of light current in full sun, a string of
 * twelve cells (emission coefficient 1.3 each), 0.3 Ω in series and 300 Ω across.
 */
export const SOLAR_LIGHT_AMPS = 1.1;
export const SOLAR_OPEN_VOLTS = 7.2;
export const SOLAR_SERIES_RESISTANCE = 0.3;
export const SOLAR_SHUNT_RESISTANCE = 300;
const SOLAR_EMISSION = 1.3 * 12;
export const SOLAR_DIODE: DiodeModel = {
  // Chosen so the panel gives exactly its open-circuit voltage in full sun.
  saturationCurrent:
    (SOLAR_LIGHT_AMPS - SOLAR_OPEN_VOLTS / SOLAR_SHUNT_RESISTANCE) /
    (Math.exp(SOLAR_OPEN_VOLTS / (SOLAR_EMISSION * THERMAL_VOLTAGE)) - 1),
  emissionCoefficient: SOLAR_EMISSION,
};

/**
 * BME280 module. REPORTED by Bosch: 1.71 V to 3.6 V. ESTIMATE: the module's
 * supply current and its 10 kΩ pull-ups on SCL and SDA.
 */
export const BME280_MAX_SUPPLY = 3.6;
export const BME280_SUPPLY_RESISTANCE = 33_000;
/**
 * INA219 module. REPORTED by TI: 3 V to 5.5 V, bus voltage up to 26 V. REPORTED
 * by Adafruit (its module and library): a 0.1 Ω shunt, address 0x40, gain /8
 * (±320 mV, so ±3.2 A). ESTIMATE: about 1 mA of supply, 10 kΩ pull-ups.
 */
export const INA219_SHUNT = 0.1;
export const INA219_ADDRESS = 0x40;
export const INA219_MAX_SHUNT_VOLTS = 0.32;
export const INA219_MAX_BUS = 26;
export const INA219_SUPPLY_RESISTANCE = 5_000;
export const I2C_MODULE_PULLUP = 10_000;
/**
 * DS18B20. REPORTED in Maxim's datasheet: 3.0 V to 5.5 V, a 4.7 kΩ pull-up on
 * DQ, and about 5 µA drawn by its DQ pin. ESTIMATE: its supply current.
 */
export const DS18B20_SUPPLY_RESISTANCE = 100_000;
export const DS18B20_DQ_LEAK = 660_000;
/**
 * Serial modules. Their TX lines are 3.3 V signals (REPORTED: u-blox, Plantower),
 * held HIGH between bytes. ESTIMATE: their output resistance, and supply currents
 * of about 45 mA (the GPS) and 100 mA (the particle sensor, its fan running).
 */
export const UART_TX_VOLTS = 3.3;
export const UART_TX_RESISTANCE = 1000;
export const GPS_SUPPLY_RESISTANCE = 110;
export const PMS_SUPPLY_RESISTANCE = 50;
/**
 * HC-05, DFPlayer Mini and SIM800L. REPORTED: the HC-05 board works on 3.6 V to
 * 6 V (sellers) and its TX is 3.3 V; the DFPlayer on 3.2 V to 5 V (DFRobot); the
 * SIM800L on 3.4 V to 4.4 V with 2.8 V signals (SIMCom). ESTIMATE: supply
 * currents of about 40 mA, 25 mA without a speaker, and 20 mA between the
 * SIM800L's bursts, whose 2 A peaks are not modelled.
 */
export const BLUETOOTH_SUPPLY_RESISTANCE = 125;
export const MP3_SUPPLY_RESISTANCE = 200;
export const GSM_SUPPLY_RESISTANCE = 200;
export const GSM_TX_VOLTS = 2.8;
export const GSM_MAX_SUPPLY = 4.4;

/**
 * Turbidity sensor (DFRobot SEN0189). REPORTED by DFRobot: a 5 V supply, up to
 * 40 mA, output 0 to 4.5 V, about 4.1 V in clean water and lower as the water
 * gets cloudier. REPORTED by users reading DFRobot's published curve (a picture
 * on their page): NTU = −1120.4 V² + 5742.3 V − 4352.9, from about 4.2 V (clear)
 * to 2.5 V (3000 NTU). ESTIMATE: that it scales with the supply, its output
 * resistance and its supply current.
 */
export const TURBIDITY_SUPPLY_RESISTANCE = 170;
export const TURBIDITY_OUTPUT_RESISTANCE = 1000;
/** The output voltage at 5 V for a turbidity, from the users' formula's falling side. */
export function turbidityVolts(ntu: number): number {
  const a = 1120.4;
  const b = 5742.3;
  const room = b * b - 4 * a * (4352.9 + ntu);
  return (b + Math.sqrt(Math.max(0, room))) / (2 * a);
}

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
 * WS2812B LED ring. REPORTED, from WorldSemi's WS2812B datasheet: a supply of
 * 3.5 V to 5.3 V. REPORTED, from Adafruit's NeoPixel guide: up to about 60 mA
 * an LED at full white, 20 mA for each of its three colours. ESTIMATE: about
 * 1 mA an LED while dark, which is all the circuit sees (`LED_RING_OHMS_PER_LED`).
 */
export const LED_RING_MAX_SUPPLY = 5.3;
export const LED_RING_MA_PER_COLOUR = 20;
export const LED_RING_IDLE_MA = 1;
/** The ring's supply load is this many ohms divided by its number of LEDs: 1 mA each at 5 V. */
export const LED_RING_OHMS_PER_LED = 5000;

/**
 * 1.54 inch ST7789 colour display module. REPORTED, from Sitronix's ST7789V
 * datasheet: 240 × 320 pixels of memory, of which this panel shows 240 × 240.
 * ESTIMATE: about 30 mA at 3.3 V, nearly all of it the backlight.
 */
export const TFT_SUPPLY_RESISTANCE = 110;
/** Memory columns and rows; the panel shows the first `TFT_SIZE` rows. */
export const ST7789_COLUMNS = 240;
export const ST7789_ROWS = 320;
export const TFT_SIZE = 240;

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
 * 74HC logic chips. REPORTED, from the family's datasheets (for example Texas
 * Instruments' and Nexperia's 74HC00): a supply of 2 V to 6 V (7 V absolute
 * maximum); an input is HIGH above 70 % and LOW below 30 % of the supply; an
 * output gives about 4 mA while staying within a few tenths of a volt of the
 * rail, and may carry 25 mA at most. ESTIMATE: the 50 Ω output resistance that
 * reproduces that, and the leakage that stands for an input.
 */
export const LOGIC_MAX_SUPPLY = 6;
export const LOGIC_HIGH_FRACTION = 0.7;
export const LOGIC_LOW_FRACTION = 0.3;
export const LOGIC_OUTPUT_RESISTANCE = 50;
export const LOGIC_MAX_OUTPUT_CURRENT = 0.025;
export const LOGIC_INPUT_RESISTANCE = 1_000_000_000;
/** What the chip itself draws at rest: microamperes, here as a large resistance. */
export const LOGIC_QUIESCENT_RESISTANCE = 10_000_000;

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
/** JSN-SR04T: REPORTED by sellers, about 30 mA while measuring on 5 V. */
export const MODULE_SUPPLY_RESISTANCE = {
  servo: 500,
  ultrasonic: 330,
  jsnsr04t: 170,
  lcd: 2500,
} as const;
/** REPORTED by sellers for the JSN-SR04T version 2.0: it measures from 25 cm to 450 cm. */
export const JSN_SR04T_MIN_CM = 25;
export const JSN_SR04T_MAX_CM = 450;
/**
 * Five-channel line sensor. ESTIMATE: its outputs' drive and its supply current
 * (five infrared LEDs and a comparator).
 */
export const LINE_SENSOR_HIGH_RESISTANCE = 1000;
export const LINE_SENSOR_LOW_RESISTANCE = 100;
export const LINE_SENSOR_SUPPLY_RESISTANCE = 100;
/** 12 V siren. ESTIMATE: about 300 mA at 12 V, and sounding from about 6 V. */
export const SIREN_RESISTANCE = 40;
export const SIREN_ON_VOLTAGE = 6;
/** A module counts as powered above this supply voltage. */
export const MODULE_MIN_SUPPLY = 4;
/**
 * The least supply each powered module works on. Below it the module does not
 * answer (or, for the gas sensor, its heater is too cool to trust), and the lab says so.
 */
export const MIN_SUPPLY: Partial<Record<CircuitComponent['type'], number>> = {
  servo: MODULE_MIN_SUPPLY,
  ultrasonic: MODULE_MIN_SUPPLY,
  jsnsr04t: MODULE_MIN_SUPPLY,
  linesensor: 3,
  lcd: MODULE_MIN_SUPPLY,
  dht11: 3,
  mq135: 4.5,
  mq7: 4.5,
  ph: 4.5,
  acs712: 4.5,
  // DFRobot gives 3.3 V as its least supply; a 3.3 V rail that sags a little under load still counts.
  tds: 3,
  turbidity: 4.5,
  lm2596: 4.5,
  bme280: 1.71,
  ina219: 3,
  ds18b20: 3,
  gps: 3,
  pms5003: 4.5,
  bluetooth: 3.6,
  mp3: 3.2,
  gsm: 3.4,
  pir: 4.5,
  oled: 3,
  ledring: 3.5,
  tft: 3,
  l298n: 6.5,
  relaymodule: 3.75,
  logic: 2,
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
