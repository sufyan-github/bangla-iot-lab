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
 * The 74HC595 shift register: driven by hand with two buttons, and by the
 * ESP32's shiftOut() in the ready-made program `shift`. The chip's pin 1 is at
 * f10: pins 1-8 along row f, 16-9 back along row e.
 */
const COLUMN = 10;
const hole = (n: number) => (n <= 8 ? `BB1.f${COLUMN + n - 1}` : `BB1.e${COLUMN + 16 - n}`);
const beside = (n: number) => (n <= 8 ? `BB1.j${COLUMN + n - 1}` : `BB1.a${COLUMN + 16 - n}`);
const strip = (n: number) =>
  n <= 8 ? `BB1:strip:${COLUMN + n - 1}:bottom` : `BB1:strip:${COLUMN + 16 - n}:top`;
const chip: CircuitComponent = {
  id: 'U1',
  type: 'logic16',
  pins: Object.fromEntries(Array.from({ length: 16 }, (_, i) => [`p${i + 1}`, hole(i + 1)])),
  props: { chip: '74HC595' },
};
/** Q0 to Q7, by pin. */
const Q = [15, 1, 2, 3, 4, 5, 6, 7];

function circuit(components: CircuitComponent[], wires: [string, string][]): CircuitDocument {
  return {
    schemaVersion: CIRCUIT_SCHEMA_VERSION,
    components,
    wires: wires.map(([from, to], i): Wire => ({ id: `W${i + 1}`, from, to, color: '#000000' })),
  };
}
/** The outputs Q0 to Q7 as a byte, read over one millisecond from now. */
function outputs(session: SimulationSession): number {
  session.frame();
  session.advance(1);
  const nodes = session.frame().result.nodeVoltages;
  return Q.reduce((byte, pin, bit) => byte | ((nodes[strip(pin)] ?? 0) > 1.6 ? 1 << bit : 0), 0);
}

describe('74HC595 by hand', () => {
  /**
   * DS held HIGH or LOW by a wire; the shift clock (SHCP, pin 11) and the store clock
   * (STCP, pin 12) each held LOW by 10 kΩ and taken HIGH by a button.
   */
  const byHand = (data: boolean) =>
    circuit(
      [
        { id: 'BAT1', type: 'battery', props: { voltage: 5 } },
        chip,
        { id: 'SH', type: 'button', pins: { a: 'BB1.b15', b: 'BB1.b30' }, props: {} },
        {
          id: 'R1',
          type: 'resistor',
          pins: { a: 'BB1.c15', b: 'BB1.c31' },
          props: { resistance: 10_000 },
        },
        { id: 'ST', type: 'button', pins: { a: 'BB1.b14', b: 'BB1.b34' }, props: {} },
        {
          id: 'R2',
          type: 'resistor',
          pins: { a: 'BB1.c14', b: 'BB1.c35' },
          props: { resistance: 10_000 },
        },
      ],
      [
        ['BAT1.pos', beside(16)],
        ['BAT1.neg', beside(8)],
        ['BAT1.pos', beside(10)], // MR̅ HIGH
        ['BAT1.neg', beside(13)], // OE̅ LOW
        [data ? 'BAT1.pos' : 'BAT1.neg', beside(14)],
        ['BAT1.pos', 'BB1.a30'],
        ['BAT1.neg', 'BB1.a31'],
        ['BAT1.pos', 'BB1.a34'],
        ['BAT1.neg', 'BB1.a35'],
      ],
    );
  const pulse = (session: SimulationSession, document: CircuitDocument, button: string) => {
    session.update(document, [button]);
    session.advance(10);
    session.update(document, []);
    session.advance(10);
  };

  it('shifts a bit in on each SHCP pulse, and shows them only on an STCP pulse', () => {
    const ones = byHand(true);
    const session = new SimulationSession(ones);
    session.advance(10); // powered up with both clocks LOW
    pulse(session, ones, 'SH');
    pulse(session, ones, 'SH');
    pulse(session, ones, 'SH');
    expect(outputs(session)).toBe(0); // held in the shift register, not shown yet
    pulse(session, ones, 'ST');
    expect(outputs(session)).toBe(0b111);
    // A LOW on DS comes in at Q0 and pushes the ones up.
    const zero = byHand(false);
    session.update(zero, []);
    pulse(session, zero, 'SH');
    pulse(session, zero, 'ST');
    expect(outputs(session)).toBe(0b1110);
  });
});

describe('74HC595 on the ESP32', () => {
  it('the ready-made running light lights Q0 to Q7 one after another', () => {
    const document = circuit(
      [{ id: 'ESP1', type: 'esp32', props: {} }, chip],
      [
        ['ESP1.3v3', beside(16)],
        ['ESP1.gnd1', beside(8)],
        ['ESP1.3v3', beside(10)],
        ['ESP1.gnd2', beside(13)],
        ['ESP1.d23', beside(14)],
        ['ESP1.d18', beside(11)],
        ['ESP1.d5', beside(12)],
      ],
    );
    const session = new SimulationSession(document);
    session.loadFirmware(
      'ESP1',
      readFileSync(
        new URL('../../board-emulators/fixtures/esp32-starters/shift.wasm.base64', import.meta.url),
        'utf8',
      ),
    );
    const seen: number[] = [];
    // The program shows each light for 300 ms: look in the middle of each.
    session.advance(150);
    for (let i = 0; i < 9; i++) {
      seen.push(outputs(session));
      session.advance(299);
    }
    expect(seen).toEqual([1, 2, 4, 8, 16, 32, 64, 128, 1]);
    expect(session.frame().result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  });
});
