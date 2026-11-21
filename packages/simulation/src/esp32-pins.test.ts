import { describe, expect, it } from 'vitest';
import {
  ESP32_ADC_ATTENUATIONS,
  ESP32_ADC_EFFECTIVE_RANGE_MV,
  ESP32_ANALOG_WRITE_BITS,
  ESP32_ANALOG_WRITE_FREQUENCY,
  ESP32_DEVKIT_PINS,
  ESP32_FLASH_GPIOS,
  ESP32_INPUT_MAX_VOLTAGE,
  ESP32_INPUT_RESISTANCE,
  ESP32_LEDC_CLOCKS,
  ESP32_LED_GPIO,
  ESP32_LOGIC_HIGH,
  ESP32_LOGIC_LOW,
  ESP32_PINS_PER_ROW,
  ESP32_PIN_SINK_RESISTANCE,
  ESP32_PIN_SOURCE_RESISTANCE,
  ESP32_PULL_RESISTANCE,
  ESP32_VIN_FROM_USB,
  esp32AdcCalibratedMillivolts,
  esp32AdcCount,
  esp32AdcDeadZoneVoltage,
  esp32AdcIdealCount,
  esp32AdcSaturationVoltage,
  esp32AdcUsable,
  esp32AnalogRead,
  esp32DacVoltage,
  esp32DigitalRead,
  esp32LedcMaxBits,
  esp32LedcMaxFrequency,
  esp32LedcMinBits,
  esp32LedcMinFrequency,
  esp32OutputResistance,
  esp32OutputVoltage,
  esp32PinByGpio,
  esp32PinById,
  esp32RegulatorCurrentLimit,
  esp32SpareCurrentFromUsb,
} from './esp32-pins';

/**
 * These tests pin the code to the numbers in docs/engineering/esp32-pin-model.md.
 * If one changes, the document's tables and charts must change with it.
 */

describe('ESP32 digital output', () => {
  it('has the output resistance worked out in the document', () => {
    expect(ESP32_PIN_SOURCE_RESISTANCE).toBeCloseTo(33, 6); // 0.66 V / 20 mA
    expect(ESP32_PIN_SINK_RESISTANCE).toBeCloseTo(35.357, 3); // 0.495 V / 14 mA
    expect(esp32OutputResistance('high', 3)).toBeCloseTo(16.5, 6); // 0.66 V / 40 mA
    expect(esp32OutputResistance('low', 3)).toBeCloseTo(17.679, 3); // 0.495 V / 28 mA
    expect(esp32OutputResistance('high', 0)).toBeCloseTo(132, 6); // 0.66 V / 5 mA
  });

  it('reproduces the datasheet test points', () => {
    // V_OH = 0.8 × VDD at the strength's rated current, default and highest.
    expect(esp32OutputVoltage('high', 0.02)).toBeCloseTo(2.64, 6);
    expect(esp32OutputVoltage('high', 0.04, 3)).toBeCloseTo(2.64, 6);
    // I_OL = 28 mA at 0.495 V, highest strength.
    expect(esp32OutputVoltage('low', 0.028, 3)).toBeCloseTo(0.495, 6);
    // No load: the rails.
    expect(esp32OutputVoltage('high', 0)).toBe(3.3);
    expect(esp32OutputVoltage('low', 0)).toBe(0);
  });

  it('gives the LED example of the document', () => {
    // A red LED (1.8 V) with 220 Ω: (3.3 − 1.8) / (220 + 33) = 5.93 mA.
    const current = (3.3 - 1.8) / (220 + ESP32_PIN_SOURCE_RESISTANCE);
    expect(current * 1000).toBeCloseTo(5.93, 2);
    expect(esp32OutputVoltage('high', current)).toBeCloseTo(3.104, 3);
  });

  it('never leaves the supply rails', () => {
    expect(esp32OutputVoltage('high', 1)).toBe(0);
    expect(esp32OutputVoltage('low', 1)).toBe(3.3);
  });
});

describe('ESP32 digital input', () => {
  it('has thresholds at three quarters and one quarter of the supply', () => {
    expect(ESP32_LOGIC_HIGH).toBeCloseTo(2.475, 9);
    expect(ESP32_LOGIC_LOW).toBeCloseTo(0.825, 9);
  });

  it('reads HIGH and LOW outside the thresholds whatever it read before', () => {
    for (const previous of [true, false]) {
      expect(esp32DigitalRead(2.48, previous)).toBe(true);
      expect(esp32DigitalRead(3.3, previous)).toBe(true);
      expect(esp32DigitalRead(0.82, previous)).toBe(false);
      expect(esp32DigitalRead(0, previous)).toBe(false);
    }
  });

  it('keeps its last level between the thresholds', () => {
    for (const volts of [0.83, 1.65, 2.47]) {
      expect(esp32DigitalRead(volts, true)).toBe(true);
      expect(esp32DigitalRead(volts, false)).toBe(false);
    }
  });

  it('follows a slow ramp up and down with hysteresis', () => {
    let level = false;
    const seen: boolean[] = [];
    for (const volts of [0, 1, 2, 2.4, 2.5, 3.3, 2, 1, 0.9, 0.8, 0]) {
      level = esp32DigitalRead(volts, level);
      seen.push(level);
    }
    expect(seen).toEqual([false, false, false, false, true, true, true, true, true, false, false]);
  });

  it('scales the thresholds with another supply voltage', () => {
    expect(esp32DigitalRead(2.3, false, 3.0)).toBe(true); // 0.75 × 3.0 = 2.25 V
    expect(esp32DigitalRead(2.3, false, 3.3)).toBe(false);
  });

  it('has the pull, leakage and voltage limits of the datasheet', () => {
    expect(ESP32_PULL_RESISTANCE).toBe(45_000);
    expect(ESP32_INPUT_RESISTANCE).toBeCloseTo(66e6, 0); // 3.3 V / 50 nA
    expect(ESP32_INPUT_MAX_VOLTAGE).toBeCloseTo(3.6, 9);
    // The pull current the datasheet quotes separately (~75 µA) agrees with 45 kΩ.
    expect((3.3 / ESP32_PULL_RESISTANCE) * 1e6).toBeCloseTo(73.3, 1);
  });
});

describe('ESP32 analog input', () => {
  it('reads the counts tabulated in the document at 11 dB', () => {
    const counts = [0, 0.1, 0.142, 0.15, 0.5, 1, 1.65, 2, 2.45, 2.5, 3, 3.1, 3.2, 3.3].map(
      (volts) => esp32AdcCount(volts),
    );
    expect(counts).toEqual([
      0, 0, 0, 10, 444, 1065, 1872, 2306, 2865, 2941, 3790, 4015, 4095, 4095,
    ]);
  });

  it('reads 0 below the dead zone and full scale above the saturation point', () => {
    expect(esp32AdcDeadZoneVoltage(11)).toBe(0.142);
    expect(esp32AdcSaturationVoltage(11)).toBe(3.134);
    expect(esp32AdcCount(-0.2)).toBe(0);
    expect(esp32AdcCount(0.14)).toBe(0);
    expect(esp32AdcCount(3.14)).toBe(4095);
    expect(esp32AdcCount(5)).toBe(4095);
  });

  it('reads mid-scale 176 counts below what a perfect 0 to 3.3 V converter would', () => {
    expect(esp32AdcIdealCount(1.65)).toBe(2048);
    expect(esp32AdcCount(1.65)).toBe(1872);
    expect(esp32AdcIdealCount(1.65) - esp32AdcCount(1.65)).toBe(176);
  });

  it('has the dead zone and saturation point of every attenuation', () => {
    const edges = ESP32_ADC_ATTENUATIONS.map((attenuation) => [
      esp32AdcDeadZoneVoltage(attenuation),
      esp32AdcSaturationVoltage(attenuation),
    ]);
    expect(edges).toEqual([
      [0.075, 1.039],
      [0.078, 1.357],
      [0.107, 1.877],
      [0.142, 3.134],
    ]);
    // The second converter has its own, slightly different, line.
    expect(esp32AdcDeadZoneVoltage(11, 2)).toBe(0.128);
    expect(esp32AdcSaturationVoltage(11, 2)).toBe(3.122);
  });

  it("matches Espressif's line by hand at 11 dB", () => {
    // slope = floor(1100 × 196602 / 4096) = 52798; mV = floor((52798 × count + 32768) / 65536) + 142
    expect(esp32AdcCalibratedMillivolts(0)).toBe(142);
    expect(esp32AdcCalibratedMillivolts(1872)).toBe(1650);
    expect(esp32AdcCalibratedMillivolts(2865)).toBe(2450);
    expect(esp32AdcCalibratedMillivolts(2879)).toBe(2461);
  });

  it("matches Espressif's correction table above count 2880", () => {
    // At a 1100 mV reference the table value is the mean of its 1000 mV and 1200 mV rows.
    expect(esp32AdcCalibratedMillivolts(3008)).toBe(Math.floor((2352 + 2745) / 2 + 0.5)); // 2549
    expect(esp32AdcCalibratedMillivolts(4032)).toBe(3107); // (3030 + 3184) / 2
    expect(esp32AdcCalibratedMillivolts(4095)).toBe(3134);
    // With the reference at either end of the table the row itself comes back.
    expect(esp32AdcCalibratedMillivolts(4032, 11, 1, 1000)).toBe(3030);
    expect(esp32AdcCalibratedMillivolts(4032, 11, 1, 1200)).toBe(3184);
    // The first step blends from the line (2462 mV at 2880) into the table (2502 mV at 2944).
    expect(esp32AdcCalibratedMillivolts(2880)).toBe(2462);
    expect(esp32AdcCalibratedMillivolts(2944)).toBe(2502);
  });

  it('never reads lower for a higher voltage', () => {
    for (const attenuation of ESP32_ADC_ATTENUATIONS) {
      for (const unit of [1, 2] as const) {
        // Espressif's rounded curve for the second converter dips by 1 mV where the line
        // meets the table (counts 2880 to 2944 at 11 dB). Nowhere else does either fall.
        const allowed = unit === 2 && attenuation === 11 ? 1 : 0;
        let previous = -1;
        for (let count = 0; count <= 4095; count++) {
          const millivolts = esp32AdcCalibratedMillivolts(count, attenuation, unit);
          expect(millivolts).toBeGreaterThanOrEqual(previous - allowed);
          previous = millivolts;
        }
        let last = 0;
        for (let millivolts = 0; millivolts <= 3300; millivolts += 5) {
          const count = esp32AdcCount(millivolts / 1000, attenuation, unit);
          expect(count).toBeGreaterThanOrEqual(last);
          last = count;
        }
      }
    }
  });

  it('can return every count from 0 to 4095', () => {
    const seen = new Set<number>();
    for (let microvolts = 100_000; microvolts <= 3_200_000; microvolts += 100) {
      seen.add(esp32AdcCount(microvolts / 1e6));
    }
    expect(seen.size).toBe(4096);
  });

  it('gives back the input voltage within a millivolt between the two ends', () => {
    for (const attenuation of ESP32_ADC_ATTENUATIONS) {
      const from = esp32AdcDeadZoneVoltage(attenuation) * 1000;
      const to = esp32AdcSaturationVoltage(attenuation) * 1000;
      for (let millivolts = from; millivolts <= to; millivolts += 0.5) {
        const reading = esp32AnalogRead(millivolts / 1000, { attenuation });
        expect(Math.abs(reading.millivolts - millivolts)).toBeLessThanOrEqual(1);
      }
    }
  });

  it('reports 142 mV for a grounded pin, as the calibration does', () => {
    expect(esp32AnalogRead(0)).toEqual({ count: 0, millivolts: 142 });
    expect(esp32AnalogRead(3.3)).toEqual({ count: 4095, millivolts: 3134 });
  });

  it('follows analogReadResolution', () => {
    const at = (bits: number) => esp32AnalogRead(1.65, { bits }).count;
    expect(at(12)).toBe(1872);
    expect(at(10)).toBe(468); // 1872 >> 2
    expect(at(9)).toBe(234);
    expect(at(8)).toBe(117); // 9 bits from the converter, shifted once more
    expect(at(16)).toBe(29952); // 1872 << 4
    expect(esp32AnalogRead(3.3, { bits: 10 }).count).toBe(1023);
    expect(esp32AnalogRead(3.3, { bits: 16 }).count).toBe(65520);
  });

  it('uses the lower attenuations for small voltages', () => {
    expect(esp32AnalogRead(0.5, { attenuation: 0 })).toEqual({ count: 1806, millivolts: 500 });
    expect(esp32AnalogRead(1.2, { attenuation: 0 }).count).toBe(4095);
  });

  it('keeps the range Espressif states inside the range the model covers', () => {
    for (const attenuation of ESP32_ADC_ATTENUATIONS) {
      const stated = ESP32_ADC_EFFECTIVE_RANGE_MV[attenuation];
      expect(stated.min).toBeGreaterThan(esp32AdcDeadZoneVoltage(attenuation) * 1000);
      expect(stated.max).toBeLessThan(esp32AdcSaturationVoltage(attenuation) * 1000);
    }
    expect(ESP32_ADC_EFFECTIVE_RANGE_MV[11]).toEqual({ min: 150, max: 2450, error: 60 });
  });

  it('cannot use the second converter while Wi-Fi is on', () => {
    expect(esp32AdcUsable(1, true)).toBe(true);
    expect(esp32AdcUsable(2, false)).toBe(true);
    expect(esp32AdcUsable(2, true)).toBe(false);
  });
});

describe('ESP32 PWM', () => {
  it('has the maximum frequency table of the document', () => {
    expect([8, 10, 12, 16].map((bits) => esp32LedcMaxFrequency(bits))).toEqual([
      312_500, 78_125, 19_531.25, 1_220.703125,
    ]);
  });

  it('has the minimum frequency table of the document', () => {
    const minimum = [8, 10, 12, 16].map((bits) => esp32LedcMinFrequency(bits));
    expect(minimum[0]).toBeCloseTo(305.18, 2);
    expect(minimum[1]).toBeCloseTo(76.29, 2);
    expect(minimum[2]).toBeCloseTo(19.07, 2);
    expect(minimum[3]).toBeCloseTo(1.192, 3);
  });

  it('reproduces the reference manual table of frequencies and resolutions', () => {
    const { apb, rcFast, refTick } = ESP32_LEDC_CLOCKS;
    const rows = [
      [apb, 1_000, 16, 7],
      [apb, 5_000, 13, 4],
      [apb, 10_000, 12, 3],
      [rcFast, 1_000, 12, 3],
      [rcFast, 2_000, 11, 2],
      [refTick, 1_000, 9, 1],
    ] as const;
    for (const [clock, frequency, highest, lowest] of rows) {
      expect(esp32LedcMaxBits(frequency, clock)).toBe(highest);
      expect(esp32LedcMinBits(frequency, clock)).toBe(lowest);
    }
  });

  it('can make the analogWrite default, and stops at the counter width', () => {
    expect(ESP32_ANALOG_WRITE_FREQUENCY).toBe(1000);
    expect(ESP32_ANALOG_WRITE_BITS).toBe(8);
    expect(esp32LedcMaxFrequency(ESP32_ANALOG_WRITE_BITS)).toBeGreaterThan(1000);
    expect(esp32LedcMinFrequency(ESP32_ANALOG_WRITE_BITS)).toBeLessThan(1000);
    expect(esp32LedcMaxBits(1)).toBe(20);
    // A 50 Hz servo signal: up to 20 bits, but no fewer than 11 from the 80 MHz clock.
    expect(esp32LedcMaxBits(50)).toBe(20);
    expect(esp32LedcMinBits(50)).toBe(11);
  });
});

describe('ESP32 analog output', () => {
  it('steps by VDD / 255', () => {
    expect(esp32DacVoltage(0)).toBe(0);
    expect(esp32DacVoltage(255)).toBe(3.3);
    expect(esp32DacVoltage(128)).toBeCloseTo(1.6565, 4);
    expect(esp32DacVoltage(1) * 1000).toBeCloseTo(12.94, 2);
    expect(esp32DacVoltage(300)).toBe(3.3);
    expect(esp32DacVoltage(-5)).toBe(0);
  });
});

describe('ESP32 board power', () => {
  it('has about 4.65 V on VIN when powered from USB', () => {
    expect(ESP32_VIN_FROM_USB).toBeCloseTo(4.65, 9);
  });

  it('has the regulator limits of the document', () => {
    const milliamps = (vin: number, ambient?: number) =>
      Math.round(esp32RegulatorCurrentLimit(vin, ambient) * 1000);
    expect(milliamps(4.65)).toBe(741); // 1.0 W / 1.35 V
    expect(milliamps(4.65, 25)).toBe(800); // the 0.8 A rating comes first
    expect(milliamps(7)).toBe(270);
    expect(milliamps(9)).toBe(175); // 1.0 W / 5.7 V
    expect(milliamps(12)).toBe(115);
    expect(milliamps(3.3)).toBe(0);
  });

  it('has the sensor budget of the document', () => {
    const spare = (chip: number) => Math.round(esp32SpareCurrentFromUsb(chip) * 1000);
    expect(spare(0.068)).toBe(402);
    expect(spare(0.1)).toBe(370);
    expect(spare(0.24)).toBe(230);
    expect(spare(1)).toBe(0);
  });
});

describe('the 30 header pins', () => {
  const pins = ESP32_DEVKIT_PINS;

  it('are 30, 15 on each side, numbered from the antenna end', () => {
    expect(pins).toHaveLength(30);
    for (const side of ['left', 'right'] as const) {
      const row = pins.filter((pin) => pin.side === side);
      expect(row).toHaveLength(ESP32_PINS_PER_ROW);
      expect(row.map((pin) => pin.index)).toEqual([...Array(15).keys()]);
    }
  });

  it('carry the printed labels in header order', () => {
    const labels = (side: string) =>
      pins.filter((pin) => pin.side === side).map((pin) => pin.label);
    expect(labels('left')).toEqual(
      'EN VP VN D34 D35 D32 D33 D25 D26 D27 D14 D12 D13 GND VIN'.split(' '),
    );
    expect(labels('right')).toEqual(
      'D23 D22 TX0 RX0 D21 D19 D18 D5 TX2 RX2 D4 D2 D15 GND 3V3'.split(' '),
    );
  });

  it('have unique ids, and unique labels apart from the two grounds', () => {
    expect(new Set(pins.map((pin) => pin.id)).size).toBe(30);
    const labels = pins.map((pin) => pin.label).filter((label) => label !== 'GND');
    expect(new Set(labels).size).toBe(28);
    expect(esp32PinById('gnd1')?.side).toBe('left');
    expect(esp32PinById('gnd2')?.side).toBe('right');
  });

  it('bring out 25 different GPIOs, none of them wired to the flash chip', () => {
    const gpios = pins.flatMap((pin) => (pin.gpio === null ? [] : [pin.gpio]));
    expect(gpios).toHaveLength(25);
    expect(new Set(gpios).size).toBe(25);
    expect(gpios.filter((gpio) => (ESP32_FLASH_GPIOS as readonly number[]).includes(gpio))).toEqual(
      [],
    );
    expect(gpios).not.toContain(0); // the BOOT button's pin is not on the headers
    for (const pin of pins) expect(pin.kind === 'gpio').toBe(pin.gpio !== null);
  });

  it('name the GPIO behind each label', () => {
    const gpioOf = Object.fromEntries(pins.map((pin) => [pin.id, pin.gpio]));
    expect(gpioOf).toMatchObject({ vp: 36, vn: 39, tx0: 1, rx0: 3, tx2: 17, rx2: 16 });
    for (const pin of pins) {
      if (pin.label.startsWith('D')) expect(pin.gpio).toBe(Number(pin.label.slice(1)));
    }
  });

  it('have the analog channels of the datasheet', () => {
    const channel = (gpio: number) => {
      const adc = esp32PinByGpio(gpio)?.adc;
      return adc ? `${adc.unit}:${adc.channel}` : null;
    };
    // ADC1: channels 0, 3, 4, 5, 6, 7 are on the headers (1 and 2 are GPIO37 and 38, not brought out).
    expect([36, 39, 32, 33, 34, 35].map(channel)).toEqual([
      '1:0',
      '1:3',
      '1:4',
      '1:5',
      '1:6',
      '1:7',
    ]);
    // ADC2: every channel except 1 (GPIO0).
    expect([4, 2, 15, 13, 12, 14, 27, 25, 26].map(channel)).toEqual([
      '2:0',
      '2:2',
      '2:3',
      '2:4',
      '2:5',
      '2:6',
      '2:7',
      '2:8',
      '2:9',
    ]);
    expect(pins.filter((pin) => pin.adc).length).toBe(15);
    expect([23, 22, 21, 19, 18, 5, 17, 16, 1, 3].map(channel)).toEqual(Array(10).fill(null));
  });

  it('have the analog outputs and touch channels of the datasheet', () => {
    expect(esp32PinByGpio(25)?.dac).toBe(1);
    expect(esp32PinByGpio(26)?.dac).toBe(2);
    expect(pins.filter((pin) => pin.dac).length).toBe(2);
    const touch = Object.fromEntries(
      pins.flatMap((pin) => (pin.touch === null ? [] : [[pin.touch, pin.gpio]])),
    );
    // Touch 1 is GPIO0, which is not on the headers.
    expect(touch).toEqual({ 0: 4, 2: 2, 3: 15, 4: 13, 5: 12, 6: 14, 7: 27, 8: 33, 9: 32 });
  });

  it('mark the input-only and strapping pins', () => {
    const gpios = (test: (pin: (typeof pins)[number]) => boolean) =>
      pins
        .filter(test)
        .map((pin) => pin.gpio)
        .sort((a, b) => a! - b!);
    expect(gpios((pin) => pin.inputOnly)).toEqual([34, 35, 36, 39]);
    expect(gpios((pin) => pin.strapping)).toEqual([2, 5, 12, 15]);
    for (const pin of pins) {
      if (pin.inputOnly) {
        expect(pin.class).toBe('input-only');
        expect(pin.pullAfterReset).toBeNull();
      }
      if (pin.strapping) expect(pin.class).toBe('caution');
    }
  });

  it('give every pin a class and a reason', () => {
    const count = (pinClass: string) => pins.filter((pin) => pin.class === pinClass).length;
    expect({
      safe: count('safe'),
      caution: count('caution'),
      inputOnly: count('input-only'),
      avoid: count('avoid'),
      power: count('power'),
    }).toEqual({ safe: 15, caution: 5, inputOnly: 4, avoid: 2, power: 4 });
    for (const pin of pins) expect(pin.reason.length).toBeGreaterThan(5);
    expect(pins.filter((pin) => pin.class === 'avoid').map((pin) => pin.id)).toEqual([
      'tx0',
      'rx0',
    ]);
    expect(pins.filter((pin) => pin.class === 'power').map((pin) => pin.id)).toEqual([
      'gnd1',
      'vin',
      'gnd2',
      '3v3',
    ]);
  });

  it('put the default buses and the on-board parts where the board definition does', () => {
    const role = (name: string) => pins.find((pin) => pin.roles.includes(name))?.gpio;
    expect({
      sda: role('I2C SDA'),
      scl: role('I2C SCL'),
      mosi: role('SPI MOSI'),
      miso: role('SPI MISO'),
      sck: role('SPI SCK'),
      ss: role('SPI SS'),
      tx: role('UART0 TX'),
      rx: role('UART0 RX'),
    }).toEqual({ sda: 21, scl: 22, mosi: 23, miso: 19, sck: 18, ss: 5, tx: 1, rx: 3 });
    expect(esp32PinByGpio(ESP32_LED_GPIO)?.onBoard).toBe('led');
    expect(pins.filter((pin) => pin.onBoard === 'usb-serial').map((pin) => pin.gpio)).toEqual([
      1, 3,
    ]);
    expect(esp32PinById('en')).toMatchObject({ kind: 'enable', class: 'caution', gpio: null });
  });
});
