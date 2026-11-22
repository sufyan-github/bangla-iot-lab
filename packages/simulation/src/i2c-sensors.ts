/**
 * Two I2C sensors as their chips' registers: what a program reads from them
 * over the bus, a byte at a time. The real libraries (Adafruit's, built into
 * the program) do the rest, exactly as on a board.
 */

/** A device on an I2C bus: it is written to and read from, an exchange at a time. */
export interface I2cDevice {
  write(bytes: Uint8Array): void;
  read(length: number): Uint8Array;
  /** As when switched on: whatever a program set is lost. */
  reset(): void;
}

// ---------------------------------------------------------------------------
// BME280: temperature, humidity and pressure.
// ---------------------------------------------------------------------------

/**
 * The trimming values a BME280 holds from the factory, which the library reads
 * at start-up and uses to turn the chip's raw readings into °C, %RH and Pa.
 * Every real chip has its own. These are example values: the lab writes the raw
 * readings that these values turn back into what the sliders are set to.
 */
export const BME280_CALIBRATION = {
  T1: 27504,
  T2: 26435,
  T3: -1000,
  P1: 36477,
  P2: -10685,
  P3: 3024,
  P4: 2855,
  P5: 140,
  P6: -7,
  P7: 15500,
  P8: -14600,
  P9: 6000,
  H1: 75,
  H2: 362,
  H3: 0,
  H4: 313,
  H5: 50,
  H6: 30,
} as const;
type Calibration = typeof BME280_CALIBRATION;

/** C's integer division, which drops the fraction towards zero. */
const div = (a: number, b: number) => Math.trunc(a / b);

/**
 * Bosch's integer formulas as Adafruit's library (2.3.0) writes them: the
 * temperature in hundredths of a degree and `tFine`, which the other two use.
 */
export function bme280Temperature(adc: number, c: Calibration = BME280_CALIBRATION) {
  const var1 = div((div(adc, 8) - c.T1 * 2) * c.T2, 2048);
  const d = div(adc, 16) - c.T1;
  const var2 = div(div(d * d, 4096) * c.T3, 16384);
  const tFine = var1 + var2;
  return { centi: div(tFine * 5 + 128, 256), tFine };
}

/** Pressure in pascals, from the library's 64-bit formula. */
export function bme280Pressure(adc: number, tFine: number, c: Calibration = BME280_CALIBRATION) {
  const big = (n: number) => BigInt(n);
  let var1 = big(tFine) - 128000n;
  let var2 = var1 * var1 * big(c.P6);
  var2 = var2 + var1 * big(c.P5) * 131072n;
  var2 = var2 + big(c.P4) * 34359738368n;
  var1 = (var1 * var1 * big(c.P3)) / 256n + var1 * big(c.P2) * 4096n;
  var1 = ((140737488355328n + var1) * big(c.P1)) / 8589934592n;
  if (var1 === 0n) return 0;
  let var4 = 1048576n - big(adc);
  var4 = ((var4 * 2147483648n - var2) * 3125n) / var1;
  const v1 = (big(c.P9) * (var4 / 8192n) * (var4 / 8192n)) / 33554432n;
  const v2 = (big(c.P8) * var4) / 524288n;
  var4 = (var4 + v1 + v2) / 256n + big(c.P7) * 16n;
  return Number(var4) / 256;
}

/** Relative humidity in percent, from the library's 32-bit formula. */
export function bme280Humidity(adc: number, tFine: number, c: Calibration = BME280_CALIBRATION) {
  const var1 = tFine - 76800;
  let var2 = adc * 16384;
  let var3 = c.H4 * 1048576;
  let var4 = c.H5 * var1;
  let var5 = div(var2 - var3 - var4 + 16384, 32768);
  var2 = div(var1 * c.H6, 1024);
  var3 = div(var1 * c.H3, 2048);
  var4 = div(var2 * (var3 + 32768), 1024) + 2097152;
  var2 = div(var4 * c.H2 + 8192, 16384);
  var3 = var5 * var2;
  var4 = div(div(var3, 32768) * div(var3, 32768), 128);
  var5 = var3 - div(var4 * c.H1, 16);
  var5 = Math.min(419430400, Math.max(0, var5));
  return div(var5, 4096) / 1024;
}

/** The raw reading in [0, top] whose value is closest to `target`, for a formula that only rises or only falls. */
function invert(value: (raw: number) => number, target: number, top: number): number {
  const rising = value(top) > value(0);
  let low = 0;
  let high = top;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (value(middle) < target === rising) low = middle;
    else high = middle;
  }
  return Math.abs(value(low) - target) <= Math.abs(value(high) - target) ? low : high;
}

/** The conditions a BME280 is in, as its sliders set them. */
export interface Weather {
  celsius: number;
  humidity: number;
  /** Air pressure in hectopascals. */
  hpa: number;
}

export const BME280_CHIP_ID = 0x60;

export class Bme280 implements I2cDevice {
  private readonly registers = new Uint8Array(256);
  private pointer = 0;

  constructor(private weather: Weather) {
    this.reset();
  }

  /** What the chip senses now: the program sees it at its next reading. */
  setWeather(weather: Weather): void {
    this.weather = weather;
  }

  /** As when switched on: its identity and factory trimming, its settings cleared. */
  reset(): void {
    this.registers.fill(0);
    this.registers[0xd0] = BME280_CHIP_ID;
    const c = BME280_CALIBRATION;
    const put16 = (at: number, value: number) => {
      this.registers[at] = value & 0xff;
      this.registers[at + 1] = (value >> 8) & 0xff;
    };
    [c.T1, c.T2, c.T3, c.P1, c.P2, c.P3, c.P4, c.P5, c.P6, c.P7, c.P8, c.P9].forEach((value, i) =>
      put16(0x88 + 2 * i, value),
    );
    this.registers[0xa1] = c.H1;
    put16(0xe1, c.H2);
    this.registers[0xe3] = c.H3;
    // H4 and H5 are twelve bits each, sharing the middle byte.
    this.registers[0xe4] = (c.H4 >> 4) & 0xff;
    this.registers[0xe5] = (c.H4 & 0x0f) | ((c.H5 & 0x0f) << 4);
    this.registers[0xe6] = (c.H5 >> 4) & 0xff;
    this.registers[0xe7] = c.H6 & 0xff;
  }

  /**
   * As the datasheet has it: a write is pairs of register address and value. A
   * lone address only sets where the next read starts.
   */
  write(bytes: Uint8Array): void {
    if (bytes.length === 0) return;
    this.pointer = bytes[0]!;
    for (let i = 0; i + 1 < bytes.length; i += 2) {
      const at = bytes[i]!;
      const value = bytes[i + 1]!;
      if (at === 0xe0 && value === 0xb6) this.reset();
      else if (at === 0xf2 || at === 0xf4 || at === 0xf5) this.registers[at] = value;
    }
  }

  read(length: number): Uint8Array {
    this.measure();
    const out = new Uint8Array(length);
    for (let i = 0; i < length; i++) out[i] = this.registers[(this.pointer + i) & 0xff]!;
    this.pointer = (this.pointer + length) & 0xff;
    return out;
  }

  /** Writes the raw readings that the library's formulas turn into the present weather. */
  private measure(): void {
    const { celsius, humidity, hpa } = this.weather;
    const top = (1 << 20) - 1;
    const adcT = invert((raw) => bme280Temperature(raw).centi, Math.round(celsius * 100), top);
    const { tFine } = bme280Temperature(adcT);
    const adcP = invert((raw) => bme280Pressure(raw, tFine), hpa * 100, top);
    const adcH = invert((raw) => bme280Humidity(raw, tFine), humidity, 0xffff);
    const put20 = (at: number, raw: number) => {
      this.registers[at] = (raw >> 12) & 0xff;
      this.registers[at + 1] = (raw >> 4) & 0xff;
      this.registers[at + 2] = (raw & 0x0f) << 4;
    };
    put20(0xf7, adcP);
    put20(0xfa, adcT);
    this.registers[0xfd] = (adcH >> 8) & 0xff;
    this.registers[0xfe] = adcH & 0xff;
  }
}

// ---------------------------------------------------------------------------
// INA219: current and bus voltage.
// ---------------------------------------------------------------------------

/** What an INA219 sees in the circuit: across its shunt, and from VIN− to ground, in volts. */
export interface Ina219Inputs {
  shunt: number;
  bus: number;
}

/** REPORTED in TI's datasheet: the configuration register's value after reset. */
export const INA219_RESET_CONFIG = 0x399f;

/**
 * TI's INA219, as its datasheet gives its registers: 0 configuration, 1 shunt
 * voltage (10 µV steps), 2 bus voltage (4 mV steps, shifted left by three), 3
 * power, 4 current, 5 calibration. Current = shunt × calibration / 4096, and
 * power = current × bus / 5000, both worked out when read.
 */
export class Ina219 implements I2cDevice {
  private config = INA219_RESET_CONFIG;
  private calibration = 0;
  private pointer = 0;

  constructor(private readonly inputs: () => Ina219Inputs) {}

  reset(): void {
    this.config = INA219_RESET_CONFIG;
    this.calibration = 0;
    this.pointer = 0;
  }

  write(bytes: Uint8Array): void {
    if (bytes.length === 0) return;
    this.pointer = bytes[0]! & 0x07;
    if (bytes.length < 3) return;
    const value = (bytes[1]! << 8) | bytes[2]!;
    if (this.pointer === 0) {
      // Bit 15 resets the chip.
      if (value & 0x8000) {
        this.config = INA219_RESET_CONFIG;
        this.calibration = 0;
      } else {
        this.config = value;
      }
    } else if (this.pointer === 5) {
      // The lowest bit of the calibration register cannot be set.
      this.calibration = value & 0xfffe;
    }
  }

  read(length: number): Uint8Array {
    const value = this.register(this.pointer);
    const out = new Uint8Array(length);
    if (length > 0) out[0] = (value >> 8) & 0xff;
    if (length > 1) out[1] = value & 0xff;
    return out;
  }

  /** Shunt voltage in 10 µV steps, within the range the gain allows, and whether it overflowed. */
  private shuntSteps() {
    const gain = (this.config >> 11) & 0x03;
    const limit = 4000 * 2 ** gain; // 40 mV × 2^gain, in 10 µV steps
    const steps = Math.round(this.inputs().shunt / 10e-6);
    return { steps: Math.max(-limit, Math.min(limit, steps)), overflow: Math.abs(steps) > limit };
  }

  private busSteps() {
    const full = this.config & 0x2000 ? 32 : 16;
    return Math.round(Math.max(0, Math.min(full, this.inputs().bus)) / 0.004);
  }

  private register(at: number): number {
    const toU16 = (n: number) => n & 0xffff;
    switch (at) {
      case 0:
        return this.config;
      case 1:
        return toU16(this.shuntSteps().steps);
      case 2: {
        // Bit 1: a conversion is ready; bit 0: the current or power overflowed.
        const overflow = this.shuntSteps().overflow ? 1 : 0;
        return toU16((this.busSteps() << 3) | 0x02 | overflow);
      }
      case 3:
        return toU16(Math.trunc((Math.abs(this.current()) * this.busSteps()) / 5000));
      case 4:
        return toU16(this.current());
      case 5:
        return this.calibration;
      default:
        return 0;
    }
  }

  private current(): number {
    const raw = Math.trunc((this.shuntSteps().steps * this.calibration) / 4096);
    return Math.max(-32768, Math.min(32767, raw));
  }
}
