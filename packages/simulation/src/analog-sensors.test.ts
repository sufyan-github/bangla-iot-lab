import {
  CIRCUIT_SCHEMA_VERSION,
  type CircuitComponent,
  type CircuitDocument,
  type Wire,
} from '@banglalab/shared';
import { describe, expect, it } from 'vitest';
import { tdsPpm, tdsVolts, turbidityVolts } from './library';
import { SimulationSession } from './session';
import { simulate } from './simulate';

/**
 * Stage 1's analog sensor modules: the voltage and current sensors, the carbon
 * monoxide and pH modules, and the two water sensors. Each is checked against
 * the figures its model is built from (see library.ts for where each comes from).
 * None of this has been compared with the real parts.
 */

function circuit(components: CircuitComponent[], wires: [string, string][]): CircuitDocument {
  return {
    schemaVersion: CIRCUIT_SCHEMA_VERSION,
    components,
    wires: wires.map(([from, to], i): Wire => ({ id: `W${i + 1}`, from, to, color: '#000000' })),
  };
}
const battery = (id: string, voltage: number): CircuitComponent => ({
  id,
  type: 'battery',
  props: { voltage },
});
const resistor = (id: string, a: string, b: string, resistance: number): CircuitComponent => ({
  id,
  type: 'resistor',
  pins: { a, b },
  props: { resistance },
});
const esp32: CircuitComponent = { id: 'ESP1', type: 'esp32', props: {} };
const uno: CircuitComponent = { id: 'UNO1', type: 'uno', props: {} };
const warnings = (document: CircuitDocument) =>
  simulate(document).diagnostics.filter((d) => d.severity !== 'info');

describe('0–25 V voltage sensor module', () => {
  // VCC at a10, GND at a11, S at a12.
  const module: CircuitComponent = {
    id: 'VS1',
    type: 'voltagesensor',
    pins: { vin: 'a10', gnd: 'a11', s: 'a12' },
    props: {},
  };

  it('gives a fifth of what it measures on S', () => {
    const measured = circuit(
      [battery('BAT1', 9), module],
      [
        ['BAT1.pos', 'b10'],
        ['BAT1.neg', 'b11'],
      ],
    );
    const reading = simulate(measured).readings.VS1!;
    // 9 V through 37.5 kΩ: the battery hardly notices.
    expect(reading.voltage).toBeCloseTo(9 / 5, 3);
    expect(reading.current).toBeCloseTo(9 / 37_500, 6);
    expect(warnings(measured)).toEqual([]);
  });

  it('warns above the 25 V it is rated for', () => {
    // Two 15 V batteries in series: 30 V.
    const measured = circuit(
      [battery('BAT1', 15), battery('BAT2', 15), module],
      [
        ['BAT1.pos', 'b10'],
        ['BAT1.neg', 'BAT2.pos'],
        ['BAT2.neg', 'b11'],
      ],
    );
    expect(warnings(measured)).toMatchObject([
      { code: 'voltage-sensor-overrange', componentId: 'VS1', limit: 25 },
    ]);
  });

  it('on the ESP32, S reaches the pin limit above 16.5 V', () => {
    const wired = (volts: number) =>
      circuit(
        [esp32, battery('BAT1', volts), module],
        [
          ['BAT1.pos', 'b10'],
          ['BAT1.neg', 'b11'],
          ['ESP1.gnd1', 'c11'],
          ['ESP1.d34', 'b12'],
        ],
      );
    expect(warnings(wired(12))).toEqual([]);
    expect(warnings(wired(20))).toMatchObject([{ code: 'pin-overvoltage', socket: 'd34' }]);
  });
});

describe('ACS712 current sensor', () => {
  // IP+ a10, IP− a11, then VCC a13, OUT a14, GND a15.
  const sensor = (range: '5A' | '20A' | '30A' = '5A'): CircuitComponent => ({
    id: 'CS1',
    type: 'acs712',
    pins: { ip1: 'a10', ip2: 'a11', vcc: 'a13', out: 'a14', gnd: 'a15' },
    props: { range },
  });
  /** A battery driving a resistor through the sensor, and the sensor powered from the board's 5 V. */
  const measuring = (load: number, range: '5A' | '20A' | '30A' = '5A', reversed = false) =>
    circuit(
      [uno, sensor(range), battery('BAT1', 12), resistor('R1', 'c20', 'c22', load)],
      [
        ['UNO1.5v', 'b13'],
        ['UNO1.gnd', 'b15'],
        [reversed ? 'BAT1.neg' : 'BAT1.pos', 'b10'],
        ['b11', 'a20'],
        ['a22', reversed ? 'BAT1.pos' : 'BAT1.neg'],
      ],
    );

  it('gives half its supply with no current', () => {
    const idle = circuit(
      [uno, sensor()],
      [
        ['UNO1.5v', 'b13'],
        ['UNO1.gnd', 'b15'],
      ],
    );
    const reading = simulate(idle).readings.CS1!;
    const supply = simulate(idle).readings.CS1!;
    expect(reading.current).toBeCloseTo(0, 9);
    expect(reading.voltage).toBeGreaterThan(2.45);
    expect(reading.voltage).toBeLessThan(2.51);
    expect(warnings(idle)).toEqual([]);
    expect(supply).toBeDefined();
  });

  it('moves 185 mV per ampere on the 5 A version, and the other way for a reversed current', () => {
    // 12 V into 6 Ω, with the battery's own 0.5 Ω: about 1.85 A.
    const forward = simulate(measuring(6)).readings.CS1!;
    const back = simulate(measuring(6, '5A', true)).readings.CS1!;
    const idle = 2.5;
    expect(forward.current).toBeGreaterThan(1.8);
    expect(forward.current).toBeLessThan(1.9);
    // Within the sag of the board's 5 V under the sensor's own load.
    expect(forward.voltage - idle).toBeCloseTo(0.185 * forward.current, 1);
    expect(back.current).toBeCloseTo(-forward.current, 3);
    expect(forward.voltage + back.voltage).toBeCloseTo(2 * 2.49, 1);
    expect(warnings(measuring(6))).toEqual([]);
  });

  it('the 20 A and 30 A versions move less for the same current', () => {
    const step = (range: '5A' | '20A' | '30A') =>
      simulate(measuring(6, range)).readings.CS1!.voltage -
      simulate(measuring(1e6, range)).readings.CS1!.voltage;
    expect(step('20A') / step('5A')).toBeCloseTo(100 / 185, 2);
    expect(step('30A') / step('5A')).toBeCloseTo(66 / 185, 2);
  });

  it('warns past its range', () => {
    // 12 V into 1 Ω and the battery's 0.5 Ω: 8 A, more than the 5 A version takes.
    expect(warnings(measuring(1))).toMatchObject([
      { code: 'current-sensor-overrange', componentId: 'CS1' },
    ]);
    expect(warnings(measuring(1, '20A'))).toEqual([]);
  });

  it('says it is underpowered on 3.3 V', () => {
    const low = circuit(
      [esp32, sensor()],
      [
        ['ESP1.3v3', 'b13'],
        ['ESP1.gnd1', 'b15'],
      ],
    );
    expect(warnings(low)).toMatchObject([
      { code: 'module-underpowered', componentId: 'CS1', limit: 4.5 },
    ]);
  });

  it('a running session follows the current as it changes', () => {
    // A board pin switches a load through the sensor; the session must see each state.
    const document = circuit(
      [uno, sensor(), resistor('R1', 'c20', 'c22', 1000)],
      [
        ['UNO1.5v', 'b13'],
        ['UNO1.gnd', 'b15'],
        ['UNO1.d7', 'b10'],
        ['b11', 'a20'],
        ['a22', 'UNO1.gnd2'],
      ],
    );
    const session = new SimulationSession(document);
    session.advance(10);
    const reading = session.frame().result.readings.CS1!;
    expect(reading.voltage).toBeGreaterThan(2.4);
    expect(reading.current).toBeCloseTo(0, 6);
  });
});

describe('MQ-7 and pH modules', () => {
  const pins = { vcc: 'a10', gnd: 'a11', do: 'a12', ao: 'a13' };
  const powered = (component: CircuitComponent) =>
    circuit(
      [uno, component],
      [
        ['UNO1.5v', 'b10'],
        ['UNO1.gnd', 'b11'],
      ],
    );

  it('MQ-7: about 160 mA of heater on 5 V; AO rises with carbon monoxide', () => {
    const at = (co: number) =>
      simulate(powered({ id: 'MQ1', type: 'mq7', pins, props: { co, threshold: 0.5 } })).readings
        .MQ1!;
    expect(at(0).current).toBeCloseTo(5 / 31, 2);
    expect(at(1).voltage).toBeGreaterThan(at(0).voltage + 3);
    expect(at(0).activity).toBe(0);
    expect(at(1).activity).toBe(1);
  });

  it('pH: 2.5 V at pH 7, about 0.18 V higher for each unit more acid', () => {
    const at = (ph: number) =>
      simulate(powered({ id: 'PH1', type: 'ph', pins, props: { ph, threshold: 0.6 } })).readings
        .PH1!;
    // The board's 5 V sags a little under the module's small load.
    expect(at(7).voltage).toBeCloseTo(2.5, 1);
    expect(at(4).voltage - at(7).voltage).toBeCloseTo(3 * 0.18, 1);
    expect(at(10).voltage).toBeLessThan(at(7).voltage);
    // The trimmer at 60 % of the supply: DO trips for water more acid than about pH 4.2.
    expect(at(7).activity).toBe(0);
    expect(at(3).activity).toBe(1);
  });
});

describe('TDS meter', () => {
  const meter = (ppm: number): CircuitComponent => ({
    id: 'TDS1',
    type: 'tds',
    pins: { out: 'a10', vcc: 'a11', gnd: 'a12' },
    props: { ppm },
  });

  it('its output is what DFRobot’s formula reads back as the set value', () => {
    for (const ppm of [0, 50, 300, 1000]) expect(tdsPpm(tdsVolts(ppm))).toBeCloseTo(ppm, 3);
    expect(tdsVolts(1000)).toBeLessThan(2.3);
  });

  it('gives the same output on 3.3 V and 5 V, and nothing without a supply', () => {
    const on = (supply: '3v3' | 'vin' | null) =>
      simulate(
        circuit(
          [esp32, meter(500)],
          [
            ...(supply ? ([[`ESP1.${supply}`, 'b11']] as [string, string][]) : []),
            ['ESP1.gnd1', 'b12'],
          ],
        ),
      ).readings.TDS1!.voltage;
    expect(on('3v3')).toBeCloseTo(tdsVolts(500), 2);
    expect(on('vin')).toBeCloseTo(tdsVolts(500), 2);
    expect(on(null)).toBeCloseTo(0, 6);
  });

  it('read on an ESP32 pin, the reading converts back to about the set ppm', () => {
    const document = circuit(
      [esp32, meter(400)],
      [
        ['ESP1.3v3', 'b11'],
        ['ESP1.gnd1', 'b12'],
        ['ESP1.d34', 'b10'],
      ],
    );
    const pin = simulate(document).sockets['ESP1.d34']!.voltage;
    expect(tdsPpm(pin)).toBeGreaterThan(390);
    expect(tdsPpm(pin)).toBeLessThan(410);
    expect(warnings(document)).toEqual([]);
  });
});

describe('Turbidity sensor', () => {
  const sensor = (ntu: number): CircuitComponent => ({
    id: 'TU1',
    type: 'turbidity',
    pins: { out: 'a10', vcc: 'a11', gnd: 'a12' },
    props: { ntu },
  });
  const on5v = (ntu: number) =>
    circuit(
      [uno, sensor(ntu)],
      [
        ['UNO1.5v', 'b11'],
        ['UNO1.gnd', 'b12'],
      ],
    );

  it('about 4.2 V in clear water, falling as the water gets cloudier', () => {
    expect(turbidityVolts(0)).toBeCloseTo(4.2, 1);
    expect(turbidityVolts(3000)).toBeGreaterThan(2.5);
    const clear = simulate(on5v(0)).readings.TU1!.voltage;
    const cloudy = simulate(on5v(2000)).readings.TU1!.voltage;
    expect(clear).toBeGreaterThan(4);
    // By the users' curve, 2000 NTU is about 3.5 V.
    expect(cloudy).toBeCloseTo(turbidityVolts(2000), 1);
    expect(cloudy).toBeLessThan(clear - 0.6);
    expect(warnings(on5v(0))).toEqual([]);
  });

  it('on the ESP32 its output is too much for a pin, and on 3.3 V it is underpowered', () => {
    const direct = circuit(
      [esp32, sensor(0)],
      [
        ['ESP1.vin', 'b11'],
        ['ESP1.gnd1', 'b12'],
        ['ESP1.d34', 'b10'],
      ],
    );
    expect(warnings(direct)).toMatchObject([{ code: 'pin-overvoltage', socket: 'd34' }]);
    const low = circuit(
      [esp32, sensor(0)],
      [
        ['ESP1.3v3', 'b11'],
        ['ESP1.gnd1', 'b12'],
      ],
    );
    expect(warnings(low)).toMatchObject([
      { code: 'module-underpowered', componentId: 'TU1', limit: 4.5 },
    ]);
  });
});
