/**
 * Electrical model of the pins of the ESP32 development board the lab uses by
 * default: the 30-pin "ESP-32S" NodeMCU-style board carrying an ESP-WROOM-32
 * module. Nothing here is wired into the editor or the simulation session yet.
 *
 * Every number is derived, with the arithmetic shown, in
 * `docs/engineering/esp32-pin-model.md`. Each constant carries one of three labels:
 *
 * - VERIFIED: read from the named primary document on 22 November 2026.
 * - REPORTED: widely published, but no primary document was found for it.
 * - ESTIMATE: our own calculation or modelling choice, built on the numbers above.
 *
 * None of it has been checked on real hardware.
 *
 * Sources, by the short names used in the comments:
 * - [DS]   ESP32 Series Datasheet v5.3 (Espressif, 2026.07)
 * - [MOD]  ESP32-WROOM-32 Datasheet v3.8 (Espressif, 2026-09-16)
 * - [TRM]  ESP32 Technical Reference Manual v5.9 (Espressif)
 * - [IDF]  ESP-IDF v6.1.1 source and documentation (Espressif, Apache-2.0)
 * - [CORE] Arduino core for ESP32, release 4.0.0 (Espressif)
 * - [REG]  AMS1117 datasheet (Advanced Monolithic Systems)
 *
 * This file imports nothing, so plain Node can load it to draw the charts.
 */

/** Supply voltage every figure below is given for. VERIFIED [DS] Table 5-3 heading "3.3 V, 25 °C". */
export const ESP32_VDD = 3.3;

// ---------------------------------------------------------------------------
// Digital output
// ---------------------------------------------------------------------------

/** A pin driving HIGH is at least this fraction of VDD. VERIFIED [DS] Table 5-3, V_OH min. */
export const ESP32_VOH_MIN_FRACTION = 0.8;
/** A pin driving LOW is at most this fraction of VDD. VERIFIED [DS] Table 5-3, V_OL max. */
export const ESP32_VOL_MAX_FRACTION = 0.1;
/** Current a pin sources while still at V_OH, at the highest drive strength. VERIFIED [DS] Table 5-3, I_OH typ. */
export const ESP32_IOH_AT_MAX_DRIVE = 0.04;
/** Current a pin sinks at the test voltage below, at the highest drive strength. VERIFIED [DS] Table 5-3, I_OL typ. */
export const ESP32_IOL_AT_MAX_DRIVE = 0.028;
/** Pin voltage at which the sink current above is given. VERIFIED [DS] Table 5-3, I_OL condition. */
export const ESP32_IOL_TEST_VOLTAGE = 0.495;

/** Nominal current of the four drive-strength settings 0 to 3. VERIFIED [DS] Appendix A.1, note 8 ("~5, ~10, ~20, ~40 mA"). */
export const ESP32_DRIVE_STRENGTH_CURRENT = [0.005, 0.01, 0.02, 0.04] as const;
export type Esp32DriveStrength = 0 | 1 | 2 | 3;
/** Setting every pin has after reset. VERIFIED [DS] Appendix A.1, note 8 ("The default value is 2") and the IO_MUX table. */
export const ESP32_DEFAULT_DRIVE_STRENGTH: Esp32DriveStrength = 2;

/**
 * Output resistance of a pin modelled as a voltage source behind a resistor.
 *
 * ESTIMATE. Driving HIGH: the drop allowed down to V_OH, over the strength's
 * current: (3.3 − 2.64) V / I. Driving LOW: the test voltage over the sink
 * current, scaled by the same 28:40 ratio the datasheet gives at full strength.
 * At the default strength that is 33 Ω high and 35.4 Ω low. The datasheet gives
 * currents at one voltage only; a real pin is not a resistor and limits its
 * current when shorted.
 */
export function esp32OutputResistance(
  level: 'high' | 'low',
  strength: Esp32DriveStrength = ESP32_DEFAULT_DRIVE_STRENGTH,
): number {
  const current = ESP32_DRIVE_STRENGTH_CURRENT[strength];
  if (level === 'high') return (ESP32_VDD * (1 - ESP32_VOH_MIN_FRACTION)) / current;
  const sinkCurrent = current * (ESP32_IOL_AT_MAX_DRIVE / ESP32_IOH_AT_MAX_DRIVE);
  return ESP32_IOL_TEST_VOLTAGE / sinkCurrent;
}

/** Output resistance at the default drive strength, ohms. ESTIMATE: 0.66 V / 20 mA and 0.495 V / 14 mA. */
export const ESP32_PIN_SOURCE_RESISTANCE = esp32OutputResistance('high');
export const ESP32_PIN_SINK_RESISTANCE = esp32OutputResistance('low');

/**
 * Voltage on an output pin carrying `current` amperes: out of the pin when it
 * drives HIGH, into it when it drives LOW. ESTIMATE (the resistor model above),
 * kept between the supply rails.
 */
export function esp32OutputVoltage(
  level: 'high' | 'low',
  current: number,
  strength: Esp32DriveStrength = ESP32_DEFAULT_DRIVE_STRENGTH,
): number {
  const drop = Math.max(0, current) * esp32OutputResistance(level, strength);
  return level === 'high' ? Math.max(0, ESP32_VDD - drop) : Math.min(ESP32_VDD, drop);
}

/**
 * Current one pin should not be asked to carry.
 * ESTIMATE as a limit: the datasheet states no absolute maximum for a single
 * pin. 40 mA is the largest current it characterises (VERIFIED [DS] Table 5-3),
 * and that falls to about 29 mA when many pins source at once (note 2).
 */
export const ESP32_PIN_MAX_CURRENT = 0.04;
/** Current up to which a pin at the default drive strength still meets V_OH. VERIFIED [DS] Appendix A.1, note 8. */
export const ESP32_PIN_RATED_CURRENT = 0.02;
/** Absolute maximum for all pins together, amperes. VERIFIED: 1.2 A in [DS] Table 5-1; the module's own figure is lower. */
export const ESP32_CHIP_TOTAL_IO_CURRENT = 1.2;
/** VERIFIED [MOD] Table 12, "Cumulative IO output current". */
export const ESP32_MODULE_TOTAL_IO_CURRENT = 1.1;

// ---------------------------------------------------------------------------
// Digital input
// ---------------------------------------------------------------------------

/** At or above this fraction of VDD an input is guaranteed to read HIGH. VERIFIED [DS] Table 5-3, V_IH min. */
export const ESP32_VIH_FRACTION = 0.75;
/** At or below this fraction of VDD an input is guaranteed to read LOW. VERIFIED [DS] Table 5-3, V_IL max. */
export const ESP32_VIL_FRACTION = 0.25;
/** The same thresholds in volts at 3.3 V: 2.475 V and 0.825 V. */
export const ESP32_LOGIC_HIGH = ESP32_VIH_FRACTION * ESP32_VDD;
export const ESP32_LOGIC_LOW = ESP32_VIL_FRACTION * ESP32_VDD;

/** Internal pull-up and pull-down resistance, ohms. VERIFIED [DS] Table 5-3, R_PU and R_PD typ. */
export const ESP32_PULL_RESISTANCE = 45_000;
/** Largest leakage current of an input, amperes. VERIFIED [DS] Table 5-3, I_IH and I_IL max. */
export const ESP32_INPUT_LEAKAGE = 50e-9;
/** The resistance that leakage amounts to at 3.3 V: 66 MΩ. ESTIMATE (3.3 V / 50 nA). */
export const ESP32_INPUT_RESISTANCE = ESP32_VDD / ESP32_INPUT_LEAKAGE;
/** Capacitance of a pin, farads. VERIFIED [DS] Table 5-3, C_IN typ. */
export const ESP32_PIN_CAPACITANCE = 2e-12;
/**
 * Highest voltage a pin may be given: VDD + 0.3 V. The pins are not 5 V tolerant.
 * VERIFIED [DS] Table 5-3, V_IH max, and Table 5-1 (supply absolute maximum 3.6 V).
 */
export const ESP32_INPUT_MAX_VOLTAGE = ESP32_VDD + 0.3;
/** Lowest voltage a pin may be given. VERIFIED [DS] Table 5-3, V_IL min. */
export const ESP32_INPUT_MIN_VOLTAGE = -0.3;
/** Below this the EN pin holds the chip in reset. VERIFIED [DS] Table 5-3, V_IL_nRST max. */
export const ESP32_EN_LOW = 0.6;

/**
 * The level a digital input reads.
 *
 * At or above V_IH it reads HIGH, at or below V_IL it reads LOW. In between the
 * datasheet promises nothing and gives no hysteresis figure, so the input keeps
 * the level it read last (ESTIMATE: a modelling choice, the same one the
 * UNO-compatible board's pins use).
 */
export function esp32DigitalRead(volts: number, previous: boolean, vdd = ESP32_VDD): boolean {
  if (volts >= ESP32_VIH_FRACTION * vdd) return true;
  if (volts <= ESP32_VIL_FRACTION * vdd) return false;
  return previous;
}

// ---------------------------------------------------------------------------
// Analog input (ADC)
// ---------------------------------------------------------------------------

/** Native resolution of both converters, bits. VERIFIED [DS] 4.9.1 ("two 12-bit SAR ADCs"). */
export const ESP32_ADC_BITS = 12;
export const ESP32_ADC_MAX_COUNT = 4095;
/** Hardware widths the chip offers. VERIFIED [IDF] soc_caps.h, SOC_ADC_RTC_MIN_BITWIDTH and _MAX_BITWIDTH. */
export const ESP32_ADC_MIN_HARDWARE_BITS = 9;
/** Design value of the converter's reference, millivolts. VERIFIED [IDF] ADC calibration guide; real chips range from 1000 to 1200. */
export const ESP32_ADC_VREF_MV = 1100;

/** Input attenuation in decibels, as the sketch names it: ADC_0db, ADC_2_5db, ADC_6db, ADC_11db. */
export type Esp32AdcAttenuation = 0 | 2.5 | 6 | 11;
export const ESP32_ADC_ATTENUATIONS: readonly Esp32AdcAttenuation[] = [0, 2.5, 6, 11];
/** What `analogRead` uses unless told otherwise. VERIFIED [CORE] esp32-hal-adc.c (`__analogAttenuation = ADC_11db`, width 12). */
export const ESP32_ADC_DEFAULT_ATTENUATION: Esp32AdcAttenuation = 11;
export type Esp32AdcUnit = 1 | 2;

/**
 * Input range, in millivolts, over which Espressif states the accuracy of a
 * calibrated reading, and that accuracy. VERIFIED [DS] Table 4-4.
 */
export const ESP32_ADC_EFFECTIVE_RANGE_MV: Record<
  Esp32AdcAttenuation,
  { min: number; max: number; error: number }
> = {
  0: { min: 100, max: 950, error: 23 },
  2.5: { min: 100, max: 1250, error: 30 },
  6: { min: 150, max: 1750, error: 40 },
  11: { min: 150, max: 2450, error: 60 },
};

/**
 * Espressif's own description of the converter: the straight line, and at
 * 11 dB the correction table, that its calibration code uses to turn a count
 * into millivolts when a chip carries no calibration of its own.
 * VERIFIED: copied from [IDF] components/esp_adc/esp32/adc_cali_line_fitting.c
 * (`adc1_vref_atten_scale`, `adc1_vref_atten_offset`, `lut_adc1_low` and so on).
 */
const ADC_LINE_SCALE: Record<Esp32AdcUnit, readonly number[]> = {
  1: [57431, 76236, 105481, 196602],
  2: [57236, 76175, 105678, 197170],
};
const ADC_LINE_OFFSET_MV: Record<Esp32AdcUnit, readonly number[]> = {
  1: [75, 78, 107, 142],
  2: [63, 66, 89, 128],
};
/** Millivolts at counts 2880, 2944 … 4096 for a reference of 1000 mV (low) and 1200 mV (high). */
const ADC_CURVE: Record<Esp32AdcUnit, { low: readonly number[]; high: readonly number[] }> = {
  1: {
    low: [
      2240, 2297, 2352, 2405, 2457, 2512, 2564, 2616, 2664, 2709, 2754, 2795, 2832, 2868, 2903,
      2937, 2969, 3000, 3030, 3060,
    ],
    high: [
      2667, 2706, 2745, 2780, 2813, 2844, 2873, 2901, 2928, 2956, 2982, 3006, 3032, 3059, 3084,
      3110, 3135, 3160, 3184, 3209,
    ],
  },
  2: {
    low: [
      2238, 2293, 2347, 2399, 2451, 2507, 2561, 2613, 2662, 2710, 2754, 2792, 2831, 2869, 2904,
      2937, 2968, 2999, 3029, 3059,
    ],
    high: [
      2657, 2698, 2738, 2774, 2807, 2838, 2867, 2894, 2921, 2946, 2971, 2996, 3020, 3043, 3067,
      3092, 3116, 3139, 3162, 3185,
    ],
  },
};
/** Count at which the 11 dB curve leaves the straight line, and the spacing of the table. VERIFIED, same file. */
export const ESP32_ADC_CURVE_START = 2880;
const ADC_CURVE_STEP = 64;
const ADC_CURVE_VREF_LOW = 1000;
const ADC_CURVE_VREF_HIGH = 1200;

const attenuationIndex = (attenuation: Esp32AdcAttenuation) =>
  ESP32_ADC_ATTENUATIONS.indexOf(attenuation);

/**
 * Espressif's curve from a 12-bit count to millivolts, for a chip with the
 * given reference and no calibration of its own: `cali_raw_to_voltage` in
 * [IDF] adc_cali_line_fitting.c. With `whole` it rounds at every step exactly
 * as the C code's integer arithmetic does; without, it is the same curve
 * before rounding, which is what the model runs backwards.
 */
function adcCurveMillivolts(
  raw: number,
  attenuation: Esp32AdcAttenuation,
  unit: Esp32AdcUnit,
  vrefMillivolts: number,
  whole: boolean,
): number {
  /** Integer division that first adds half the divisor, as the C code does to round. */
  const divide = (value: number, by: number) =>
    whole ? Math.floor((value + by / 2) / by) : value / by;
  const index = attenuationIndex(attenuation);
  const slope = Math.floor((vrefMillivolts * ADC_LINE_SCALE[unit][index]) / 4096);
  const linear = divide(slope * raw, 65536) + ADC_LINE_OFFSET_MV[unit][index];
  if (attenuation !== 11 || raw < ESP32_ADC_CURVE_START) return linear;

  // Above the straight part: interpolate the table over the count and the reference.
  const { low, high } = ADC_CURVE[unit];
  const i = Math.min(18, Math.floor((raw - ESP32_ADC_CURVE_START) / ADC_CURVE_STEP));
  const vrefAbove = ADC_CURVE_VREF_HIGH - vrefMillivolts;
  const vrefBelow = vrefMillivolts - ADC_CURVE_VREF_LOW;
  const countAbove = (i + 1) * ADC_CURVE_STEP + ESP32_ADC_CURVE_START - raw;
  const countBelow = raw - (i * ADC_CURVE_STEP + ESP32_ADC_CURVE_START);
  const curve = divide(
    low[i] * vrefAbove * countAbove +
      high[i] * vrefBelow * countAbove +
      low[i + 1] * vrefAbove * countBelow +
      high[i + 1] * vrefBelow * countBelow,
    (ADC_CURVE_VREF_HIGH - ADC_CURVE_VREF_LOW) * ADC_CURVE_STEP,
  );
  if (raw > ESP32_ADC_CURVE_START + ADC_CURVE_STEP) return curve;
  // The first table step blends from the line to the curve.
  const along = raw - ESP32_ADC_CURVE_START;
  return divide(linear * (ADC_CURVE_STEP - along) + curve * along, ADC_CURVE_STEP);
}

/**
 * The millivolts Espressif's calibration reports for a 12-bit count: what
 * `analogReadMilliVolts` returns on a chip that falls back to the design
 * reference. VERIFIED by reading the C code; the port has not been run against it.
 */
export function esp32AdcCalibratedMillivolts(
  count: number,
  attenuation: Esp32AdcAttenuation = ESP32_ADC_DEFAULT_ATTENUATION,
  unit: Esp32AdcUnit = 1,
  vrefMillivolts = ESP32_ADC_VREF_MV,
): number {
  const raw = Math.max(0, Math.min(ESP32_ADC_MAX_COUNT, Math.round(count)));
  return adcCurveMillivolts(raw, attenuation, unit, vrefMillivolts, true);
}

/**
 * The 12-bit count a nominal chip returns for an input voltage.
 *
 * ESTIMATE: Espressif publishes the curve from count to voltage, not the other
 * way round. The model runs that curve backwards: the count is the one whose
 * voltage on the curve is nearest the input. So an input below the curve's
 * offset (142 mV at 11 dB) reads 0, and an input above its top (3134 mV at
 * 11 dB) reads 4095. Noise and chip-to-chip spread are not modelled.
 */
export function esp32AdcCount(
  volts: number,
  attenuation: Esp32AdcAttenuation = ESP32_ADC_DEFAULT_ATTENUATION,
  unit: Esp32AdcUnit = 1,
): number {
  const millivolts = volts * 1000;
  const curve = (count: number) =>
    adcCurveMillivolts(count, attenuation, unit, ESP32_ADC_VREF_MV, false);
  // Smallest count whose voltage on the curve reaches the input, then the nearer neighbour.
  let low = 0;
  let high = ESP32_ADC_MAX_COUNT;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (curve(middle) >= millivolts) high = middle;
    else low = middle + 1;
  }
  if (low > 0 && millivolts - curve(low - 1) <= curve(low) - millivolts) return low - 1;
  return low;
}

/** The input voltage above which a reading is stuck at full scale, volts. 3.134 V at 11 dB. ESTIMATE (top of the curve above). */
export function esp32AdcSaturationVoltage(
  attenuation: Esp32AdcAttenuation = ESP32_ADC_DEFAULT_ATTENUATION,
  unit: Esp32AdcUnit = 1,
): number {
  return esp32AdcCalibratedMillivolts(ESP32_ADC_MAX_COUNT, attenuation, unit) / 1000;
}

/** The input voltage below which a reading is 0, volts. 0.142 V at 11 dB. ESTIMATE (offset of the curve above). */
export function esp32AdcDeadZoneVoltage(
  attenuation: Esp32AdcAttenuation = ESP32_ADC_DEFAULT_ATTENUATION,
  unit: Esp32AdcUnit = 1,
): number {
  return esp32AdcCalibratedMillivolts(0, attenuation, unit) / 1000;
}

export interface Esp32AdcOptions {
  attenuation?: Esp32AdcAttenuation;
  /** What the sketch passed to `analogReadResolution`: 1 to 16, 12 if it never called it. */
  bits?: number;
  unit?: Esp32AdcUnit;
}

export interface Esp32AdcReading {
  /** What `analogRead` returns. */
  count: number;
  /** What `analogReadMilliVolts` returns. */
  millivolts: number;
}

/**
 * What a sketch reads from an analog pin held at `volts`.
 *
 * The resolution follows [CORE] esp32-hal-adc.c (VERIFIED): 9 to 12 bits set
 * the converter's own width, and anything else is shifted from the nearest
 * width it has. That a narrower width drops the low bits of the 12-bit result
 * is an ESTIMATE.
 */
export function esp32AnalogRead(volts: number, options: Esp32AdcOptions = {}): Esp32AdcReading {
  const { attenuation = ESP32_ADC_DEFAULT_ATTENUATION, bits = ESP32_ADC_BITS, unit = 1 } = options;
  const requested = Math.max(1, Math.min(16, Math.round(bits)));
  const width = Math.max(ESP32_ADC_MIN_HARDWARE_BITS, Math.min(ESP32_ADC_BITS, requested));
  const hardware = esp32AdcCount(volts, attenuation, unit) >> (ESP32_ADC_BITS - width);
  const count =
    width > requested ? hardware >> (width - requested) : hardware << (requested - width);
  const millivolts = esp32AdcCalibratedMillivolts(
    hardware << (ESP32_ADC_BITS - width),
    attenuation,
    unit,
  );
  return { count, millivolts };
}

/**
 * What a student would expect if the converter were perfect and its range were
 * exactly 0 V to 3.3 V. Drawn beside the model in the chart; no chip does this.
 */
export function esp32AdcIdealCount(volts: number, fullScale = ESP32_VDD): number {
  return Math.max(0, Math.min(ESP32_ADC_MAX_COUNT, Math.round((volts / fullScale) * 4095)));
}

/**
 * Whether `analogRead` can work on a converter. The second converter is shared
 * with the radio and cannot be read while Wi-Fi is on.
 * VERIFIED [IDF] GPIO guide for ESP32 ("ADC2 pins cannot be used when Wi-Fi is used").
 */
export function esp32AdcUsable(unit: Esp32AdcUnit, wifiOn: boolean): boolean {
  return unit === 1 || !wifiOn;
}

// ---------------------------------------------------------------------------
// PWM (the LED control peripheral, LEDC)
// ---------------------------------------------------------------------------

/** Clocks a PWM timer can run from, hertz. VERIFIED [TRM] 28.2.2 and Table 28.2-1; the 8 MHz one is an RC oscillator and approximate. */
export const ESP32_LEDC_CLOCKS = {
  apb: 80_000_000,
  rcFast: 8_000_000,
  refTick: 1_000_000,
} as const;
/** The divider between the clock and the counter: 10 whole bits and 8 fractional. VERIFIED [TRM] 28.2.2. */
export const ESP32_LEDC_MIN_DIVIDER = 1;
export const ESP32_LEDC_MAX_DIVIDER = 1023 + 255 / 256;
/** Width of the PWM counter, bits. VERIFIED [TRM] 28.2.2 and [IDF] soc_caps.h; [DS] Table 4-6 says "duty accuracy: 16 bits". */
export const ESP32_LEDC_MAX_BITS = 20;
/** What `analogWrite` uses until the sketch changes it. VERIFIED [CORE] esp32-hal-ledc.c (`analog_frequency`, `analog_resolution`). */
export const ESP32_ANALOG_WRITE_FREQUENCY = 1000;
export const ESP32_ANALOG_WRITE_BITS = 8;

/**
 * Highest PWM frequency that still has `bits` of duty resolution:
 * f = clock / (divider × 2^bits) with the divider at 1. VERIFIED [TRM] 28.2.2.
 */
export function esp32LedcMaxFrequency(bits: number, clock: number = ESP32_LEDC_CLOCKS.apb): number {
  return clock / (ESP32_LEDC_MIN_DIVIDER * 2 ** bits);
}

/** Lowest PWM frequency at `bits` of resolution: the same formula with the divider at its largest. */
export function esp32LedcMinFrequency(bits: number, clock: number = ESP32_LEDC_CLOCKS.apb): number {
  return clock / (ESP32_LEDC_MAX_DIVIDER * 2 ** bits);
}

/** Most bits of resolution available at a frequency (rounded down, at most 20). VERIFIED against [TRM] Table 28.2-1. */
export function esp32LedcMaxBits(frequency: number, clock: number = ESP32_LEDC_CLOCKS.apb): number {
  return Math.min(ESP32_LEDC_MAX_BITS, Math.floor(Math.log2(clock / frequency)));
}

/** Fewest bits of resolution a frequency can be made with (rounded up, at least 1). VERIFIED against [TRM] Table 28.2-1. */
export function esp32LedcMinBits(frequency: number, clock: number = ESP32_LEDC_CLOCKS.apb): number {
  return Math.max(1, Math.ceil(Math.log2(clock / (frequency * ESP32_LEDC_MAX_DIVIDER))));
}

// ---------------------------------------------------------------------------
// Analog output (DAC)
// ---------------------------------------------------------------------------

/** Resolution of the two converters, bits. VERIFIED [DS] 4.9.2 ("Two 8-bit DAC channels"). */
export const ESP32_DAC_BITS = 8;
/** GPIO of each channel. VERIFIED [DS] Table 4-6 (DAC_1 on GPIO25, DAC_2 on GPIO26). */
export const ESP32_DAC_PINS = { 1: 25, 2: 26 } as const;

/**
 * Voltage `dacWrite(pin, value)` asks for: VDD × value / 255.
 * VERIFIED [IDF] DAC guide. The output impedance is not specified in [DS] or
 * [TRM], so none is modelled; the datasheet only says the output is buffered.
 */
export function esp32DacVoltage(value: number, vdd = ESP32_VDD): number {
  const code = Math.max(0, Math.min(255, Math.round(value)));
  return (vdd * code) / 255;
}

// ---------------------------------------------------------------------------
// Power
// ---------------------------------------------------------------------------

/**
 * The board's 3.3 V regulator. An AMS1117-3.3 is typical of these boards
 * (REPORTED); clones fit other parts. The figures are VERIFIED from [REG].
 */
export const ESP32_REGULATOR = {
  outputVoltage: 3.3,
  /** Output tolerance over temperature, volts. */
  outputMin: 3.201,
  outputMax: 3.399,
  /** Input must be this far above the output at 0.8 A: typical and maximum. Less at lighter loads. */
  dropoutTypical: 1.1,
  dropoutMax: 1.3,
  /** Current up to which the dropout is specified. */
  ratedCurrent: 0.8,
  /** Current limit: minimum and typical. */
  currentLimitMin: 0.9,
  currentLimitTypical: 1.1,
  /** Current the regulator itself draws: typical and maximum. */
  quiescentTypical: 0.005,
  quiescentMax: 0.011,
  inputMax: 15,
  /** SOT-223 package in still air, °C per watt; 46 or better with copper under it. */
  thermalResistance: 90,
  junctionMax: 125,
} as const;

/** A USB 2.0 port's supply: 5 V, 0.5 A. REPORTED (the USB specification was not consulted). */
export const ESP32_USB_VOLTAGE = 5;
export const ESP32_USB_CURRENT = 0.5;
/** Drop of the diode between the USB socket and VIN. ESTIMATE: a small Schottky diode at 0.1 to 0.5 A; the part varies by clone. */
export const ESP32_USB_DIODE_DROP = 0.35;
/** Voltage on the VIN pin when the board is powered from USB: about 4.65 V. ESTIMATE. */
export const ESP32_VIN_FROM_USB = ESP32_USB_VOLTAGE - ESP32_USB_DIODE_DROP;
/** The current at which the diode's drop above is taken. ESTIMATE. */
export const ESP32_USB_DIODE_CURRENT = 0.1;

/**
 * Current the chip draws from 3.3 V, amperes. VERIFIED [DS] Table 4-2
 * (radio off, both cores running) and Table 5-4 (radio on).
 */
export const ESP32_SUPPLY_CURRENT = {
  /** Radio off, 240 MHz: 30 to 68 mA. */
  wifiOff: { min: 0.03, max: 0.068 },
  /** Radio listening or receiving: 95 to 100 mA. */
  wifiReceiving: { min: 0.095, max: 0.1 },
  /** Transmitting 802.11b at +19.5 dBm, the heaviest case. */
  wifiTransmitPeak: 0.24,
} as const;
/** Current the supply must be able to deliver to the module. VERIFIED [DS] Table 5-2 and [MOD] Table 13, I_VDD min. */
export const ESP32_SUPPLY_MIN_CAPACITY = 0.5;
/** Current of the rest of the board: USB bridge, power light, regulator. ESTIMATE; not from a datasheet. */
export const ESP32_BOARD_OVERHEAD_CURRENT = 0.03;

/**
 * Continuous current the regulator can pass before its junction overheats,
 * for a voltage on VIN and an air temperature. ESTIMATE from [REG]:
 * (125 °C − ambient) / 90 °C/W, divided by the voltage it drops, and no more
 * than its 0.8 A rating.
 */
export function esp32RegulatorCurrentLimit(vin: number, ambientCelsius = 35): number {
  const { junctionMax, thermalResistance, outputVoltage, ratedCurrent } = ESP32_REGULATOR;
  const drop = vin - outputVoltage;
  if (drop <= 0) return 0;
  const power = Math.max(0, junctionMax - ambientCelsius) / thermalResistance;
  return Math.min(ratedCurrent, power / drop);
}

/**
 * Current left on the 3V3 pin for sensors when the board is powered from a
 * USB port: the port's 0.5 A less the board's own parts and the chip's draw.
 * ESTIMATE. 402 mA with the radio off (68 mA), 230 mA while it transmits (240 mA).
 */
export function esp32SpareCurrentFromUsb(chipCurrent: number): number {
  return Math.max(0, ESP32_USB_CURRENT - ESP32_BOARD_OVERHEAD_CURRENT - chipCurrent);
}

// ---------------------------------------------------------------------------
// The 30 header pins
// ---------------------------------------------------------------------------

/**
 * How freely a student may use a pin.
 * - safe: an ordinary input or output.
 * - caution: usable, but its level at power-up matters or something on the board shares it.
 * - input-only: cannot drive anything and has no pull resistors.
 * - avoid: taken by the USB serial link.
 * - power: a supply or ground pin, not a signal.
 */
export type Esp32PinClass = 'safe' | 'caution' | 'input-only' | 'avoid' | 'power';

export interface Esp32Pin {
  /** Lower-case name used as the terminal id: "d23", "vin", "gnd1". */
  id: string;
  /** What is printed beside the pin. REPORTED: clones print "D23", "G23", "IO23" or "23". */
  label: string;
  /** Which row, looking down on the board with the antenna away from you. */
  side: 'left' | 'right';
  /** Place in the row, 0 at the antenna end, 14 at the USB end. */
  index: number;
  kind: 'gpio' | 'enable' | 'supply' | 'ground';
  /** GPIO number, or null for EN and the power pins. */
  gpio: number | null;
  /** Converter and channel `analogRead` uses on this pin. */
  adc: { unit: Esp32AdcUnit; channel: number } | null;
  dac: 1 | 2 | null;
  /** Capacitive touch channel. */
  touch: number | null;
  /** What the pin is by default: serial, I2C or SPI signal, as the Arduino core names it. */
  roles: readonly string[];
  /** Read by the chip at reset to choose how it starts. */
  strapping: boolean;
  /** GPIO34 to 39: no output driver and no pull resistors. */
  inputOnly: boolean;
  /** Something on the board that shares the pin. */
  onBoard: 'led' | 'usb-serial' | 'reset-button' | null;
  /** Weak pull the chip applies right after reset. */
  pullAfterReset: 'up' | 'down' | null;
  class: Esp32PinClass;
  reason: string;
}

type PinDetails = Partial<Omit<Esp32Pin, 'id' | 'label' | 'side' | 'index' | 'class' | 'reason'>>;

const ADC2_NOTE = 'Its analog input (ADC2) cannot be read while Wi-Fi is on.';

function pin(
  label: string,
  pinClass: Esp32PinClass,
  reason: string,
  details: PinDetails = {},
): Omit<Esp32Pin, 'id' | 'side' | 'index'> {
  return {
    label,
    kind: 'gpio',
    gpio: null,
    adc: null,
    dac: null,
    touch: null,
    roles: [],
    strapping: false,
    inputOnly: false,
    onBoard: null,
    pullAfterReset: null,
    class: pinClass,
    reason,
    ...details,
  };
}

const adc = (unit: Esp32AdcUnit, channel: number) => ({ unit, channel });
const INPUT_ONLY = 'Input only: it cannot drive anything and has no pull-up or pull-down.';

/**
 * Rows from the antenna end to the USB end.
 *
 * The order of the pins along the headers is REPORTED: it is the layout
 * published for the 30-pin boards of this style, and no document from the
 * maker of the board in the kit was found. Compare it with the board in hand.
 * What each GPIO can do is VERIFIED from [DS] Table 2-1, Table 3-1, Table 4-6,
 * the IO_MUX table and [MOD] Table 2; the default roles from [CORE]
 * variants/doitESP32devkitV1/pins_arduino.h.
 */
const LEFT_ROW = [
  pin('EN', 'caution', 'Reset. Pulling it below 0.6 V stops the chip; the EN button does that.', {
    kind: 'enable',
    onBoard: 'reset-button',
  }),
  pin('VP', 'input-only', INPUT_ONLY, { gpio: 36, adc: adc(1, 0), inputOnly: true }),
  pin('VN', 'input-only', INPUT_ONLY, { gpio: 39, adc: adc(1, 3), inputOnly: true }),
  pin('D34', 'input-only', INPUT_ONLY, { gpio: 34, adc: adc(1, 6), inputOnly: true }),
  pin('D35', 'input-only', INPUT_ONLY, { gpio: 35, adc: adc(1, 7), inputOnly: true }),
  pin('D32', 'safe', 'Ordinary pin. Analog input works with Wi-Fi on (ADC1).', {
    gpio: 32,
    adc: adc(1, 4),
    touch: 9,
  }),
  pin('D33', 'safe', 'Ordinary pin. Analog input works with Wi-Fi on (ADC1).', {
    gpio: 33,
    adc: adc(1, 5),
    touch: 8,
  }),
  pin('D25', 'safe', `Ordinary pin, and analog output 1. ${ADC2_NOTE}`, {
    gpio: 25,
    adc: adc(2, 8),
    dac: 1,
  }),
  pin('D26', 'safe', `Ordinary pin, and analog output 2. ${ADC2_NOTE}`, {
    gpio: 26,
    adc: adc(2, 9),
    dac: 2,
  }),
  pin('D27', 'safe', `Ordinary pin. ${ADC2_NOTE}`, { gpio: 27, adc: adc(2, 7), touch: 7 }),
  pin('D14', 'safe', `Ordinary pin, pulled up after reset. ${ADC2_NOTE}`, {
    gpio: 14,
    adc: adc(2, 6),
    touch: 6,
    pullAfterReset: 'up',
  }),
  pin(
    'D12',
    'caution',
    'Read at reset to choose the flash supply voltage: if it is held HIGH then, the board may not start.',
    { gpio: 12, adc: adc(2, 5), touch: 5, strapping: true, pullAfterReset: 'down' },
  ),
  pin('D13', 'safe', `Ordinary pin, pulled down after reset. ${ADC2_NOTE}`, {
    gpio: 13,
    adc: adc(2, 4),
    touch: 4,
    pullAfterReset: 'down',
  }),
  pin('GND', 'power', 'Ground.', { kind: 'ground' }),
  pin(
    'VIN',
    'power',
    'Supply in, or about 4.65 V out when the board is powered from USB. Not a 3.3 V pin.',
    { kind: 'supply' },
  ),
] as const;

const RIGHT_ROW = [
  pin('D23', 'safe', 'Ordinary pin. SPI data out by default.', { gpio: 23, roles: ['SPI MOSI'] }),
  pin('D22', 'safe', 'Ordinary pin. I2C clock by default.', { gpio: 22, roles: ['I2C SCL'] }),
  pin('TX0', 'avoid', 'Serial out to the USB link: used to upload programs and by Serial.', {
    gpio: 1,
    roles: ['UART0 TX'],
    onBoard: 'usb-serial',
    pullAfterReset: 'up',
  }),
  pin('RX0', 'avoid', 'Serial in from the USB link: used to upload programs and by Serial.', {
    gpio: 3,
    roles: ['UART0 RX'],
    onBoard: 'usb-serial',
    pullAfterReset: 'up',
  }),
  pin('D21', 'safe', 'Ordinary pin. I2C data by default.', { gpio: 21, roles: ['I2C SDA'] }),
  pin('D19', 'safe', 'Ordinary pin. SPI data in by default.', { gpio: 19, roles: ['SPI MISO'] }),
  pin('D18', 'safe', 'Ordinary pin. SPI clock by default.', { gpio: 18, roles: ['SPI SCK'] }),
  pin(
    'D5',
    'caution',
    'Read at reset and pulled up then, so it is HIGH until the program starts.',
    {
      gpio: 5,
      roles: ['SPI SS'],
      strapping: true,
      pullAfterReset: 'up',
    },
  ),
  pin('TX2', 'safe', 'Ordinary pin. The chip routes the third serial port out here.', {
    gpio: 17,
    roles: ['UART2 TX'],
  }),
  pin('RX2', 'safe', 'Ordinary pin. The chip routes the third serial port in here.', {
    gpio: 16,
    roles: ['UART2 RX'],
  }),
  pin('D4', 'safe', `Ordinary pin, pulled down after reset. ${ADC2_NOTE}`, {
    gpio: 4,
    adc: adc(2, 0),
    touch: 0,
    pullAfterReset: 'down',
  }),
  pin(
    'D2',
    'caution',
    'Read at reset: it must not be held HIGH while a program is uploaded. Drives the on-board LED.',
    { gpio: 2, adc: adc(2, 2), touch: 2, strapping: true, onBoard: 'led', pullAfterReset: 'down' },
  ),
  pin(
    'D15',
    'caution',
    'Read at reset: held LOW then, it silences the start-up messages. Pulled up after reset.',
    { gpio: 15, adc: adc(2, 3), touch: 3, strapping: true, pullAfterReset: 'up' },
  ),
  pin('GND', 'power', 'Ground.', { kind: 'ground' }),
  pin('3V3', 'power', 'The 3.3 V rail from the regulator. Never connect 5 V here.', {
    kind: 'supply',
  }),
] as const;

const pinId = (label: string, side: 'left' | 'right') =>
  label === 'GND' ? (side === 'left' ? 'gnd1' : 'gnd2') : label.toLowerCase();

/** The 30 pins: the left row then the right row, each from the antenna end. */
export const ESP32_DEVKIT_PINS: readonly Esp32Pin[] = (
  [
    ['left', LEFT_ROW],
    ['right', RIGHT_ROW],
  ] as const
).flatMap(([side, row]) =>
  row.map((entry, index) => ({ ...entry, id: pinId(entry.label, side), side, index })),
);

export const ESP32_PINS_PER_ROW = 15;

/** GPIO the on-board LED hangs on. VERIFIED for the board definition ([CORE] `LED_BUILTIN = 2`); REPORTED for a given clone. */
export const ESP32_LED_GPIO = 2;
/** GPIO the BOOT button pulls LOW. It is a strapping pin and is not on the 30-pin headers. VERIFIED [DS] Table 3-1; REPORTED for the button. */
export const ESP32_BOOT_BUTTON_GPIO = 0;
/** GPIOs wired to the flash chip inside the module, so never on the headers. VERIFIED [MOD] Table 2, note 2. */
export const ESP32_FLASH_GPIOS = [6, 7, 8, 9, 10, 11] as const;

export function esp32PinById(id: string): Esp32Pin | undefined {
  return ESP32_DEVKIT_PINS.find((entry) => entry.id === id);
}

export function esp32PinByGpio(gpio: number): Esp32Pin | undefined {
  return ESP32_DEVKIT_PINS.find((entry) => entry.gpio === gpio);
}
