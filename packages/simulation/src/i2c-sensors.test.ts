import { readFileSync } from 'node:fs';
import {
  CIRCUIT_SCHEMA_VERSION,
  updateProps,
  type CircuitComponent,
  type CircuitDocument,
  type Wire,
} from '@banglalab/shared';
import { describe, expect, it } from 'vitest';
import {
  BME280_CHIP_ID,
  Bme280,
  Ina219,
  bme280Humidity,
  bme280Pressure,
  bme280Temperature,
} from './i2c-sensors';
import { SimulationSession } from './session';
import { simulate } from './simulate';

/**
 * The BME280 and INA219: first their registers alone, then each read by its
 * ready-made program through Adafruit's own library on the ESP32. Nothing here
 * has been compared with the real chips.
 */

const starter = (name: string) =>
  readFileSync(
    new URL(`../../board-emulators/fixtures/esp32-starters/${name}.wasm.base64`, import.meta.url),
    'utf8',
  );
function circuit(components: CircuitComponent[], wires: [string, string][]): CircuitDocument {
  return {
    schemaVersion: CIRCUIT_SCHEMA_VERSION,
    components,
    wires: wires.map(([from, to], i): Wire => ({ id: `W${i + 1}`, from, to, color: '#000000' })),
  };
}
const esp32: CircuitComponent = { id: 'ESP1', type: 'esp32', props: {} };
function printed(session: SimulationSession, milliseconds: number): string {
  let text = '';
  for (let t = 0; t < milliseconds; t += 50) {
    session.advance(50);
    text += session.frame().boards.ESP1!.serial;
  }
  return text;
}

describe('BME280 registers', () => {
  const weather = { celsius: 25.3, humidity: 60, hpa: 1010 };

  it('says who it is and gives the raw readings that its library turns into the set weather', () => {
    const chip = new Bme280(weather);
    chip.write(Uint8Array.of(0xd0));
    expect(chip.read(1)[0]).toBe(BME280_CHIP_ID);
    chip.write(Uint8Array.of(0xf7));
    const r = chip.read(8);
    const adcP = (r[0]! << 12) | (r[1]! << 4) | (r[2]! >> 4);
    const adcT = (r[3]! << 12) | (r[4]! << 4) | (r[5]! >> 4);
    const adcH = (r[6]! << 8) | r[7]!;
    const t = bme280Temperature(adcT);
    expect(t.centi / 100).toBe(25.3);
    expect(bme280Pressure(adcP, t.tFine) / 100).toBeCloseTo(1010, 2);
    expect(bme280Humidity(adcH, t.tFine)).toBeCloseTo(60, 1);
  });

  it('follows a change of weather at its next reading, and a soft reset keeps its trimming', () => {
    const chip = new Bme280(weather);
    chip.setWeather({ celsius: -10, humidity: 5, hpa: 900 });
    chip.write(Uint8Array.of(0xe0, 0xb6));
    chip.write(Uint8Array.of(0xfa));
    const r = chip.read(3);
    const adcT = (r[0]! << 12) | (r[1]! << 4) | (r[2]! >> 4);
    expect(bme280Temperature(adcT).centi).toBe(-1000);
    chip.write(Uint8Array.of(0x88));
    expect(chip.read(2)).toEqual(Uint8Array.of(27504 & 0xff, 27504 >> 8));
  });
});

describe('INA219 registers', () => {
  it('gives shunt and bus voltage, and current and power once calibrated', () => {
    const chip = new Ina219(() => ({ shunt: 0.05, bus: 5 }));
    const read = (register: number) => {
      chip.write(Uint8Array.of(register));
      const r = chip.read(2);
      return (r[0]! << 8) | r[1]!;
    };
    // 50 mV in 10 µV steps; 5 V in 4 mV steps, shifted by three, with "conversion ready".
    expect(read(1)).toBe(5000);
    expect(read(2)).toBe((1250 << 3) | 0x02);
    // Not calibrated: current and power stay at zero, as the datasheet says.
    expect(read(4)).toBe(0);
    chip.write(Uint8Array.of(5, 0x10, 0x00)); // calibration 4096
    expect(read(4)).toBe(5000); // 5000 × 4096 / 4096
    expect(read(3)).toBe(Math.trunc((5000 * 1250) / 5000));
  });

  it('cannot read past ±320 mV at its default gain, and says it overflowed', () => {
    const chip = new Ina219(() => ({ shunt: 0.5, bus: 5 }));
    chip.write(Uint8Array.of(1));
    const r = chip.read(2);
    expect((r[0]! << 8) | r[1]!).toBe(32000);
    chip.write(Uint8Array.of(2));
    expect(chip.read(2)[1]! & 0x01).toBe(1);
  });
});

describe('BME280 on the ESP32, read by its library', () => {
  const sensor = (
    props: Partial<{ celsius: number; humidity: number; hpa: number; address: number }> = {},
  ) =>
    ({
      id: 'BME1',
      type: 'bme280',
      pins: { vcc: 'c10', gnd: 'c11', scl: 'c12', sda: 'c13' },
      props: { celsius: 28, humidity: 70, hpa: 1010, address: 0x76, ...props },
    }) as CircuitComponent;
  const wired = (component: CircuitComponent, supply = 'ESP1.3v3') =>
    circuit(
      [esp32, component],
      [
        [supply, 'a10'],
        ['ESP1.gnd1', 'a11'],
        ['ESP1.d22', 'a12'],
        ['ESP1.d21', 'a13'],
      ],
    );

  it('prints the temperature, humidity and pressure set on its sliders, and follows them', () => {
    let document = wired(sensor());
    const session = new SimulationSession(document);
    session.loadFirmware('ESP1', starter('weather'));
    const first = printed(session, 3000);
    expect(first).toContain('BME280 পাওয়া গেছে');
    expect(first).toContain('তাপমাত্রা: 28.0 °C, আর্দ্রতা: 70 %, বায়ুচাপ: 1010.0 hPa');
    const changed = updateProps(document, 'BME1', { celsius: 35.5, humidity: 85, hpa: 995 });
    if (!changed.ok) throw new Error(changed.error);
    document = changed.circuit;
    session.update(document);
    expect(printed(session, 4500)).toContain('তাপমাত্রা: 35.5 °C, আর্দ্রতা: 85 %, বায়ুচাপ: 995.0 hPa');
  });

  it('at the other address it is not found, and the program says so', () => {
    const session = new SimulationSession(wired(sensor({ address: 0x77 })));
    session.loadFirmware('ESP1', starter('weather'));
    expect(printed(session, 1500)).toContain('BME280 পাওয়া যায়নি');
  });

  it('on 5 V the lab warns: the module is for 3.3 V, and its pull-ups put 5 V on the bus pins', () => {
    const codes = simulate(wired(sensor(), 'ESP1.vin'))
      .diagnostics.filter((d) => d.severity !== 'info')
      .map((d) => `${d.code} ${d.componentId}${d.socket ? ` ${d.socket}` : ''}`)
      .sort();
    expect(codes).toEqual([
      'module-overvoltage BME1',
      'pin-overvoltage ESP1 d21',
      'pin-overvoltage ESP1 d22',
    ]);
  });
});

describe('INA219 on the ESP32, read by its library', () => {
  // A 9 V battery drives 100 Ω through the shunt; the battery's − is the board's ground.
  const monitor = circuit(
    [
      esp32,
      { id: 'BAT1', type: 'battery', props: { voltage: 9 } },
      {
        id: 'INA1',
        type: 'ina219',
        pins: { vcc: 'c10', gnd: 'c11', scl: 'c12', sda: 'c13', vinm: 'c14', vinp: 'c15' },
        props: {},
      },
      { id: 'R1', type: 'resistor', pins: { a: 'c20', b: 'c24' }, props: { resistance: 100 } },
    ],
    [
      ['ESP1.3v3', 'a10'],
      ['ESP1.gnd1', 'a11'],
      ['ESP1.d22', 'a12'],
      ['ESP1.d21', 'a13'],
      ['BAT1.pos', 'a15'],
      ['a14', 'a20'],
      ['a24', 'BAT1.neg'],
      ['ESP1.gnd2', 'b24'],
    ],
  );

  it('prints the load’s voltage, current and power', () => {
    const session = new SimulationSession(monitor);
    session.loadFirmware('ESP1', starter('monitor'));
    const text = printed(session, 2500);
    expect(text).toContain('INA219 পাওয়া গেছে');
    // 9 V into 100 Ω, the shunt's 0.1 Ω and the battery's 0.5 Ω: about 89.4 mA and 8.94 V across
    // the load. The chip rounds down in its own steps, so the power comes out just under 0.8 W.
    expect(text).toMatch(/ভোল্টেজ: 8\.9\d V, কারেন্ট: 89\.\d mA, ক্ষমতা: (79|80)\d mW/);
  });

  it('the current through its shunt is what the meter shows too', () => {
    const reading = simulate(monitor).readings.INA1!;
    expect(reading.current).toBeCloseTo(9 / 100.6, 4);
  });
});
