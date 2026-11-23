import { readFileSync } from 'node:fs';
import {
  CIRCUIT_SCHEMA_VERSION,
  FIRST_BREADBOARD,
  type CircuitComponent,
  type CircuitDocument,
  type Wire,
} from '@banglalab/shared';
import { describe, expect, it } from 'vitest';
import { SimulationSession } from './session';
import { simulate } from './simulate';

/**
 * Two programmable boards in one circuit: each runs its own program on the
 * same clock, a pin of one can drive a pin of the other, and two ESP32 boards
 * can talk over a serial line, TX of one to RX of the other.
 */

const starter = (name: string) =>
  readFileSync(
    new URL(`../../board-emulators/fixtures/esp32-starters/${name}.wasm.base64`, import.meta.url),
    'utf8',
  );
function circuit(components: CircuitComponent[], wires: [string, string][]): CircuitDocument {
  return {
    schemaVersion: CIRCUIT_SCHEMA_VERSION,
    components: [FIRST_BREADBOARD, ...components],
    wires: wires.map(([from, to], i): Wire => ({ id: `W${i + 1}`, from, to, color: '#000000' })),
  };
}
const esp = (id: string): CircuitComponent => ({ id, type: 'esp32', props: {} });
/** Runs a session, and collects what each board printed. */
function run(session: SimulationSession, milliseconds: number): Record<string, string> {
  const printed: Record<string, string> = {};
  for (let t = 0; t < milliseconds; t += 50) {
    session.advance(50);
    for (const [id, board] of Object.entries(session.frame().boards)) {
      printed[id] = (printed[id] ?? '') + board.serial;
    }
  }
  return printed;
}

describe('two boards in one circuit', () => {
  it('each runs its own program, side by side', () => {
    const document = circuit([esp('ESP1'), esp('ESP2')], []);
    const session = new SimulationSession(document);
    session.loadFirmware('ESP1', starter('sender'));
    session.loadFirmware('ESP2', starter('receiver'));
    const printed = run(session, 1500);
    expect(printed.ESP1).toContain('পাঠানোর বোর্ড চালু');
    expect(printed.ESP2).toContain('শোনার বোর্ড চালু');
    // Nothing is wired between them, so nothing arrives.
    expect(printed.ESP2).not.toContain('পেলাম');
  });

  it('one board sends lines over serial and the other receives them, at the same baud rate', () => {
    const document = circuit(
      [esp('ESP1'), esp('ESP2')],
      [
        ['ESP1.tx2', 'ESP2.rx2'],
        ['ESP1.gnd1', 'ESP2.gnd1'],
      ],
    );
    const session = new SimulationSession(document);
    session.loadFirmware('ESP1', starter('sender'));
    session.loadFirmware('ESP2', starter('receiver'));
    const printed = run(session, 3500);
    expect(printed.ESP1).toContain('পাঠালাম: 3');
    expect(printed.ESP2).toContain('পেলাম: count 1');
    expect(printed.ESP2).toContain('পেলাম: count 3');
    expect(simulate(document).diagnostics.map((d) => d.code)).not.toContain('no-common-ground');
  });

  it('TX wired to TX carries nothing between boards', () => {
    const document = circuit(
      [esp('ESP1'), esp('ESP2')],
      [
        ['ESP1.tx2', 'ESP2.tx2'],
        ['ESP1.gnd1', 'ESP2.gnd1'],
      ],
    );
    const session = new SimulationSession(document);
    session.loadFirmware('ESP1', starter('sender'));
    session.loadFirmware('ESP2', starter('receiver'));
    expect(run(session, 2500).ESP2).not.toContain('পেলাম');
  });

  it('a signal wire without a shared ground is flagged', () => {
    const document = circuit([esp('ESP1'), esp('ESP2')], [['ESP1.tx2', 'ESP2.rx2']]);
    expect(simulate(document).diagnostics).toContainEqual(
      expect.objectContaining({ code: 'no-common-ground', severity: 'warning' }),
    );
  });

  it('a pin of one board drives an LED wired to the other board’s ground', () => {
    // ESP1's blink program on D2 lights an LED whose cathode goes to ESP2's GND.
    const document = circuit(
      [
        esp('ESP1'),
        esp('ESP2'),
        {
          id: 'R1',
          type: 'resistor',
          pins: { a: 'BB1.f20', b: 'BB1.f24' },
          props: { resistance: 220 },
        },
        {
          id: 'LED1',
          type: 'led',
          pins: { anode: 'BB1.g24', cathode: 'BB1.g25' },
          props: { color: 'red' },
        } as CircuitComponent,
      ],
      [
        ['ESP1.d2', 'BB1.j20'],
        ['ESP2.gnd2', 'BB1.j25'],
        ['ESP1.gnd1', 'ESP2.gnd1'],
      ],
    );
    const session = new SimulationSession(document);
    session.loadFirmware('ESP1', starter('blink'));
    let lit = false;
    for (let t = 0; t < 1500 && !lit; t += 50) {
      session.advance(50);
      lit = session.frame().result.readings.LED1?.led?.state === 'on';
    }
    expect(lit).toBe(true);
  });
});
