import { readFileSync } from 'node:fs';
import {
  CIRCUIT_SCHEMA_VERSION,
  updateProps,
  type CircuitComponent,
  type CircuitDocument,
  type Wire,
} from '@banglalab/shared';
import { describe, expect, it } from 'vitest';
import { Ds18b20, dallasCrc8, ds18b20Register, ds18b20Rom } from './onewire-sensors';
import { SimulationSession } from './session';
import { simulate } from './simulate';

/**
 * The DS18B20: its registers against Maxim's datasheet, then read by the
 * DallasTemperature library on the ESP32, alone and two to a wire. Nothing
 * here has been compared with a real probe.
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
const probe = (id: string, column: number, celsius: number): CircuitComponent =>
  ({
    id,
    type: 'ds18b20',
    pins: { gnd: `c${column}`, dq: `c${column + 1}`, vdd: `c${column + 2}` },
    props: { celsius },
  }) as CircuitComponent;
function printed(session: SimulationSession, milliseconds: number): string {
  let text = '';
  for (let t = 0; t < milliseconds; t += 50) {
    session.advance(50);
    text += session.frame().boards.ESP1!.serial;
  }
  return text;
}

describe('DS18B20 registers', () => {
  it('encodes temperatures as the datasheet’s table 2 does', () => {
    expect(ds18b20Register(125, 12)).toBe(0x07d0);
    expect(ds18b20Register(25.0625, 12)).toBe(0x0191);
    expect(ds18b20Register(10.125, 12)).toBe(0x00a2);
    expect(ds18b20Register(0.5, 12)).toBe(0x0008);
    expect(ds18b20Register(-0.5, 12)).toBe(0xfff8);
    expect(ds18b20Register(-10.125, 12)).toBe(0xff5e);
    expect(ds18b20Register(-25.0625, 12)).toBe(0xfe6f);
    expect(ds18b20Register(-55, 12)).toBe(0xfc90);
    // At 9 bits only half degrees are kept.
    expect(ds18b20Register(25.3, 9)).toBe(0x0190);
  });

  it('has family code 28h and valid CRCs on its ROM code and scratchpad', () => {
    const rom = ds18b20Rom('TP1');
    expect(rom[0]).toBe(0x28);
    expect(dallasCrc8(rom.subarray(0, 7))).toBe(rom[7]);
    expect(ds18b20Rom('TP2')).not.toEqual(rom);
    const pad = new Ds18b20('TP1', 25).scratchpad();
    expect(dallasCrc8(pad.subarray(0, 8))).toBe(pad[8]);
    // Before any conversion it reads 85 °C, as the datasheet warns.
    expect([pad[0], pad[1]]).toEqual([0x50, 0x05]);
    expect([pad[5], pad[6], pad[7]]).toEqual([0xff, 0x0c, 0x10]);
  });
});

describe('DS18B20 on the ESP32, read by DallasTemperature', () => {
  /** Probes from column 10 on, DQ to D4 with a 4.7 kΩ pull-up to 3.3 V. */
  const thermometer = (probes: CircuitComponent[], pullUp = true) =>
    circuit(
      [
        esp32,
        ...probes,
        ...(pullUp
          ? [
              {
                id: 'R9',
                type: 'resistor',
                pins: { a: 'd11', b: 'd15' },
                props: { resistance: 4700 },
              } as CircuitComponent,
            ]
          : []),
      ],
      [
        ['ESP1.gnd1', 'a10'],
        ['ESP1.d4', 'a11'],
        ['ESP1.3v3', 'a12'],
        ['b12', 'b15'],
        // A second probe at columns 20 to 22 shares the same three lines.
        ...(probes.length > 1
          ? ([
              ['b10', 'a20'],
              ['b11', 'a21'],
              ['c15', 'a22'],
            ] as [string, string][])
          : []),
      ],
    );

  it('finds the probe and prints its temperature, and follows the slider', () => {
    let document = thermometer([probe('TP1', 10, 25)]);
    const session = new SimulationSession(document);
    session.loadFirmware('ESP1', starter('thermo'));
    const first = printed(session, 2500);
    expect(first).toContain('প্রোব পাওয়া গেছে: 1');
    expect(first).toContain('প্রোব 1: 25.00 °C');
    const changed = updateProps(document, 'TP1', { celsius: 42.5 });
    if (!changed.ok) throw new Error(changed.error);
    document = changed.circuit;
    session.update(document);
    expect(printed(session, 4000)).toContain('প্রোব 1: 42.50 °C');
  });

  it('two probes on one wire are both found, each with its own reading', () => {
    const session = new SimulationSession(
      thermometer([probe('TP1', 10, 21.5), probe('TP2', 20, 30.25)]),
    );
    session.loadFirmware('ESP1', starter('thermo'));
    const text = printed(session, 3500);
    expect(text).toContain('প্রোব পাওয়া গেছে: 2');
    const readings = [...text.matchAll(/প্রোব \d: ([\d.]+) °C/g)].map((m) => Number(m[1]));
    expect(new Set(readings)).toEqual(new Set([21.5, 30.25]));
  });

  it('without its pull-up no probe is found, and the lab says why', () => {
    const document = thermometer([probe('TP1', 10, 25)], false);
    const session = new SimulationSession(document);
    session.loadFirmware('ESP1', starter('thermo'));
    expect(printed(session, 1500)).toContain('প্রোব পাওয়া গেছে: 0');
    expect(simulate(document).diagnostics.filter((d) => d.severity !== 'info')).toMatchObject([
      { code: 'onewire-no-pullup', componentId: 'TP1' },
    ]);
  });
});
