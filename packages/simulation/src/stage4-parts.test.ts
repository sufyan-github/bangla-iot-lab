import { readFileSync } from 'node:fs';
import {
  CIRCUIT_SCHEMA_VERSION,
  stripOf,
  type CircuitComponent,
  type CircuitDocument,
  type Wire,
} from '@banglalab/shared';
import { describe, expect, it } from 'vitest';
import { SimulationSession } from './session';
import { simulate } from './simulate';

/**
 * The JSN-SR04T, the five-channel line sensor and the siren, against the
 * figures their models are built from. Nothing here has been compared with
 * the real parts.
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

describe('JSN-SR04T on the ESP32, read by the distance program', () => {
  // As the HC-SR04's test: 5 V from VIN, TRIG on D5, ECHO to D18 through a 1 kΩ / 2 kΩ divider.
  const measuring = (distance: number) =>
    circuit(
      [
        esp32,
        {
          id: 'US1',
          type: 'jsnsr04t',
          pins: { vcc: 'BB1.c10', trig: 'BB1.c11', echo: 'BB1.c12', gnd: 'BB1.c13' },
          props: { distance },
        } as CircuitComponent,
        resistor('R1', 'BB1.d12', 'BB1.d20', 1000),
        resistor('R2', 'BB1.e20', 'BB1.e25', 2000),
      ],
      [
        ['ESP1.vin', 'BB1.a10'],
        ['ESP1.d5', 'BB1.a11'],
        ['ESP1.gnd1', 'BB1.a13'],
        ['ESP1.d18', 'BB1.a20'],
        ['BB1.a25', 'BB1.a13'],
      ],
    );
  const readings = (distance: number) => {
    const session = new SimulationSession(measuring(distance));
    session.loadFirmware('ESP1', starter('distance'));
    let text = '';
    for (let t = 0; t < 900; t += 50) {
      session.advance(50);
      text += session.frame().boards.ESP1!.serial;
    }
    return text.trim().split(/\r?\n/).filter(Boolean).map(Number);
  };

  it('measures within its range as the HC-SR04 does', () => {
    for (const reading of readings(123)) expect(Math.abs(reading - 123)).toBeLessThanOrEqual(1);
  });

  it('closer than 25 cm it reads 25 cm, and further than 450 cm it reads 450 cm', () => {
    for (const reading of readings(10)) expect(Math.abs(reading - 25)).toBeLessThanOrEqual(1);
    for (const reading of readings(550)) expect(Math.abs(reading - 450)).toBeLessThanOrEqual(1);
  });
});

describe('five-channel line sensor', () => {
  it('each output is HIGH over black and LOW over white', () => {
    const document = circuit(
      [
        {
          id: 'LINE1',
          type: 'linesensor',
          pins: {
            gnd: 'BB1.c10',
            vcc: 'BB1.c11',
            s1: 'BB1.c12',
            s2: 'BB1.c13',
            s3: 'BB1.c14',
            s4: 'BB1.c15',
            s5: 'BB1.c16',
          },
          props: { black: [false, true, true, false, false] },
        } as CircuitComponent,
        { id: 'BAT1', type: 'battery', props: { voltage: 4.5 } },
      ],
      [
        ['BAT1.neg', 'BB1.a10'],
        ['BAT1.pos', 'BB1.a11'],
      ],
    );
    const result = simulate(document);
    const level = (column: number) => result.nodeVoltages[stripOf(`BB1.c${column}`)] ?? -1;
    // Nothing loads the outputs, so HIGH is the module's supply and LOW is ground.
    expect([12, 13, 14, 15, 16].map((c) => level(c) > 2)).toEqual([
      false,
      true,
      true,
      false,
      false,
    ]);
    expect(problemsOf(document)).toEqual([]);
  });
});
const problemsOf = (document: CircuitDocument) =>
  simulate(document).diagnostics.filter((d) => d.severity !== 'info');

describe('12 V siren', () => {
  const powered = (volts: number, reversed = false) =>
    circuit(
      [
        { id: 'SIR1', type: 'siren', pins: { pos: 'BB1.c10', neg: 'BB1.c13' }, props: {} },
        { id: 'BAT1', type: 'battery', props: { voltage: volts } },
      ],
      [
        [reversed ? 'BAT1.neg' : 'BAT1.pos', 'BB1.a10'],
        [reversed ? 'BAT1.pos' : 'BAT1.neg', 'BB1.a13'],
      ],
    );

  it('sounds on 12 V, drawing about 300 mA; not on 4.5 V, nor the wrong way round', () => {
    const on = simulate(powered(12)).readings.SIR1!;
    expect(on.activity).toBe(1);
    expect(on.current).toBeCloseTo(12 / 40.5, 2);
    expect(simulate(powered(4.5)).readings.SIR1!.activity).toBe(0);
    expect(simulate(powered(12, true)).readings.SIR1!.activity).toBe(0);
  });
});
