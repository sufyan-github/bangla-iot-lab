import { readFileSync } from 'node:fs';
import {
  CIRCUIT_SCHEMA_VERSION,
  type CircuitComponent,
  type CircuitDocument,
  type Wire,
} from '@banglalab/shared';
import { describe, expect, it } from 'vitest';
import { SimulationSession } from './session';

/**
 * Parts of the school kit on the ESP32 board, run with the ready-made programs
 * exactly as shipped. The kit's servo and ultrasonic sensor are 5 V parts: they
 * are powered from VIN, and the sensor's 5 V echo must not reach a 3.3 V pin.
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
const resistor = (id: string, a: string, b: string, resistance: number): CircuitComponent => ({
  id,
  type: 'resistor',
  pins: { a, b },
  props: { resistance },
});

describe('servo on the ESP32', () => {
  const servo: CircuitComponent = {
    id: 'SRV1',
    type: 'servo',
    pins: { gnd: 'c10', vcc: 'c11', signal: 'c12' },
    props: {},
  };
  const wired = (supply: string) =>
    circuit(
      [esp32, servo],
      [
        ['ESP1.gnd1', 'a10'],
        [supply, 'a11'],
        ['ESP1.d13', 'a12'],
      ],
    );
  const angles = (session: SimulationSession) => {
    const seen: number[] = [];
    for (let i = 0; i < 80; i++) {
      session.advance(50);
      const angle = session.frame().result.readings.SRV1!.angle;
      if (angle !== undefined) seen.push(angle);
    }
    return seen;
  };

  it('sweeps from 0° to 180° and back, powered from VIN', () => {
    const session = new SimulationSession(wired('ESP1.vin'));
    session.loadFirmware('ESP1', starter('servo'));
    const seen = angles(session);
    expect(Math.min(...seen)).toBeLessThan(3);
    expect(Math.max(...seen)).toBeGreaterThan(177);
    // The sketch moves in 10° steps; the board's 10-bit timer can only make pulses in
    // 19.5 µs steps, which is up to 2° off.
    for (const angle of seen)
      expect(Math.abs(angle - Math.round(angle / 10) * 10)).toBeLessThan(2.5);
    expect(session.frame().result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  });

  it('does not move from the 3.3 V pin: the kit’s servo needs 5 V', () => {
    const session = new SimulationSession(wired('ESP1.3v3'));
    session.loadFirmware('ESP1', starter('servo'));
    expect(angles(session)).toEqual([]);
  });
});

describe('ultrasonic distance sensor on the ESP32', () => {
  const sensor = (distance: number): CircuitComponent => ({
    id: 'US1',
    type: 'ultrasonic',
    pins: { vcc: 'c10', trig: 'c11', echo: 'c12', gnd: 'c13' },
    props: { distance },
  });
  const supply: [string, string][] = [
    ['ESP1.vin', 'a10'],
    ['ESP1.d5', 'a11'],
    ['ESP1.gnd1', 'a13'],
  ];
  /** Echo to GPIO18 through `top`, and GPIO18 to ground through `bottom`: a voltage divider. */
  const divided = (distance: number, top: number, bottom: number) =>
    circuit(
      [
        esp32,
        sensor(distance),
        resistor('R1', 'd12', 'd20', top),
        resistor('R2', 'e20', 'e25', bottom),
      ],
      [...supply, ['ESP1.d18', 'a20'], ['a25', 'a13']],
    );
  const direct = (distance: number) =>
    circuit([esp32, sensor(distance)], [...supply, ['ESP1.d18', 'a12']]);

  function measure(session: SimulationSession, milliseconds: number) {
    let printed = '';
    const errors = new Set<string>();
    for (let t = 0; t < milliseconds; t += 50) {
      session.advance(50);
      const frame = session.frame();
      printed += frame.boards.ESP1!.serial;
      for (const d of frame.result.diagnostics) if (d.severity === 'error') errors.add(d.code);
    }
    return { readings: printed.trim().split(/\r?\n/).filter(Boolean).map(Number), errors };
  }

  it.each([5, 50, 123, 300])('measures %i cm through a 1 kΩ and 2 kΩ divider', (distance) => {
    const session = new SimulationSession(divided(distance, 1000, 2000));
    session.loadFirmware('ESP1', starter('distance'));
    const { readings, errors } = measure(session, 900);
    expect(readings.length).toBeGreaterThanOrEqual(3);
    for (const reading of readings) expect(Math.abs(reading - distance)).toBeLessThanOrEqual(1);
    // Two thirds of 5 V is 3.3 V: safe for the pin.
    expect([...errors]).toEqual([]);
  });

  it('wired straight to the pin it still measures, and the lab says the pin is getting 5 V', () => {
    const session = new SimulationSession(direct(50));
    session.loadFirmware('ESP1', starter('distance'));
    const { readings, errors } = measure(session, 900);
    expect(readings.length).toBeGreaterThanOrEqual(3);
    for (const reading of readings) expect(Math.abs(reading - 50)).toBeLessThanOrEqual(1);
    expect([...errors]).toEqual(['pin-overvoltage']);
  });

  it('a divider that takes the echo down too far gives no reading', () => {
    // 10 kΩ over 1 kΩ leaves under half a volt: the pin never sees HIGH.
    const session = new SimulationSession(divided(50, 10_000, 1000));
    session.loadFirmware('ESP1', starter('distance'));
    const { readings } = measure(session, 2500);
    expect(readings.length).toBeGreaterThanOrEqual(1);
    for (const reading of readings) expect(reading).toBe(0);
  });
});

describe('DHT11 on the ESP32, read by the real DHT library', () => {
  const dht = (celsius: number, humidity: number): CircuitComponent => ({
    id: 'DHT1',
    type: 'dht11',
    pins: { vcc: 'c10', data: 'c11', gnd: 'c12' },
    props: { celsius, humidity },
  });
  const wired = (sensor: CircuitComponent, supply = 'ESP1.3v3') =>
    circuit(
      [esp32, sensor],
      [
        [supply, 'a10'],
        ['ESP1.d4', 'a11'],
        ['ESP1.gnd1', 'a12'],
      ],
    );
  function printed(session: SimulationSession, milliseconds: number): string[] {
    let text = '';
    for (let t = 0; t < milliseconds; t += 50) {
      session.advance(50);
      text += session.frame().boards.ESP1!.serial;
    }
    return text.trim().split(/\r?\n/).filter(Boolean);
  }

  it.each([
    [28, 70],
    [0, 20],
    [50, 90],
    [37, 45],
  ])('reads %i °C and %i %% from the 3.3 V pin', (celsius, humidity) => {
    const session = new SimulationSession(wired(dht(celsius, humidity)));
    session.loadFirmware('ESP1', starter('dht'));
    const lines = printed(session, 4500);
    expect(lines.length).toBeGreaterThanOrEqual(2);
    for (const line of lines) expect(line).toBe(`তাপমাত্রা ${celsius} °C, আর্দ্রতা ${humidity} %`);
  });

  it('follows the sliders while the program runs', () => {
    const session = new SimulationSession(wired(dht(20, 40)));
    session.loadFirmware('ESP1', starter('dht'));
    expect(printed(session, 2500).at(-1)).toBe('তাপমাত্রা 20 °C, আর্দ্রতা 40 %');
    session.update(wired(dht(33, 81)));
    expect(printed(session, 4500).at(-1)).toBe('তাপমাত্রা 33 °C, আর্দ্রতা 81 %');
  });

  it('with no supply the library says it could not read the sensor', () => {
    const unpowered = circuit([esp32, dht(28, 70)], [['ESP1.d4', 'a11']]);
    const session = new SimulationSession(unpowered);
    session.loadFirmware('ESP1', starter('dht'));
    const lines = printed(session, 4500);
    expect(lines.length).toBeGreaterThanOrEqual(1);
    for (const line of lines) expect(line).toBe('সেন্সর পড়া যায়নি');
  });

  it('draws about a milliampere and does not disturb the pin', () => {
    const session = new SimulationSession(wired(dht(28, 70)));
    session.loadFirmware('ESP1', starter('dht'));
    session.advance(500);
    const result = session.frame().result;
    expect(result.readings.DHT1!.voltage).toBeCloseTo(3.3, 1);
    expect(result.readings.DHT1!.current).toBeGreaterThan(0.0005);
    expect(result.readings.DHT1!.current).toBeLessThan(0.003);
    expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  });
});
