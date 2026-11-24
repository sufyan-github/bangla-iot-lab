import {
  CD4511_DIGITS,
  CIRCUIT_SCHEMA_VERSION,
  SEVEN_SEGMENTS,
  emptyCircuit,
  placePart,
  type AnyLogicChip,
  type CircuitComponent,
  type CircuitDocument,
  type Wire,
} from '@banglalab/shared';
import { describe, expect, it } from 'vitest';
import { SimulationSession } from './session';
import { simulate } from './simulate';

/**
 * Counters, the CD4511 decoder and the seven-segment display, on a 5 V
 * battery. A chip's pin 1 is at f10; a 14-pin chip's pins run 1-7 along row f
 * and 14-8 back along row e, a 16-pin chip's 1-8 and 16-9.
 */
const COLUMN = 10;
function circuit(components: CircuitComponent[], wires: [string, string][]): CircuitDocument {
  return {
    schemaVersion: CIRCUIT_SCHEMA_VERSION,
    components: [{ id: 'BAT1', type: 'battery', props: { voltage: 5 } }, ...components],
    wires: wires.map(([from, to], i): Wire => ({ id: `W${i + 1}`, from, to, color: '#000000' })),
  };
}
/** The column of a pin, and whether it is in the bottom half (row f) or the top (row e). */
function place(pins: number, n: number) {
  const half = pins / 2;
  return n <= half
    ? { column: COLUMN + n - 1, bottom: true }
    : { column: COLUMN + pins - n, bottom: false };
}
const chip = (model: AnyLogicChip, pins: 14 | 16): CircuitComponent => {
  const holes = Object.fromEntries(
    Array.from({ length: pins }, (_, i) => {
      const { column, bottom } = place(pins, i + 1);
      return [`p${i + 1}`, `BB1.${bottom ? 'f' : 'e'}${column}`];
    }),
  );
  return pins === 14
    ? { id: 'U1', type: 'logic', pins: holes, props: { chip: model as '74HC393' } }
    : { id: 'U1', type: 'logic16', pins: holes, props: { chip: model as '74HC161' } };
};
/** Another hole in the same strip as a pin, for wiring to it. */
const beside = (pins: number, n: number) => {
  const { column, bottom } = place(pins, n);
  return `BB1.${bottom ? 'j' : 'a'}${column}`;
};
const strip = (pins: number, n: number) => {
  const { column, bottom } = place(pins, n);
  return `BB1:strip:${column}:${bottom ? 'bottom' : 'top'}`;
};
const tie = (pins: number, n: number, high: boolean): [string, string] => [
  high ? 'BAT1.pos' : 'BAT1.neg',
  beside(pins, n),
];
/** A button from the supply to a pin, with 10 kΩ holding the pin LOW until it is pressed. */
const clockButton = (pins: number, n: number) => {
  const { column, bottom } = place(pins, n);
  const row = bottom ? ['i', 'h'] : ['b', 'c'];
  return {
    components: [
      { id: 'CLK', type: 'button', pins: { a: `BB1.${row[0]}${column}`, b: 'BB1.i40' }, props: {} },
      {
        id: 'RD',
        type: 'resistor',
        pins: { a: `BB1.${row[1]}${column}`, b: 'BB1.h41' },
        props: { resistance: 10_000 },
      },
    ] as CircuitComponent[],
    wires: [
      ['BAT1.pos', 'BB1.j40'],
      ['BAT1.neg', 'BB1.j41'],
    ] as [string, string][],
  };
};
const high = (session: SimulationSession, node: string) => {
  session.advance(10);
  return session.frame().result.nodeVoltages[node]! > 2.5;
};
const count = (session: SimulationSession, pins: number, q: readonly number[]) =>
  q.reduce((sum, n, bit) => sum + (high(session, strip(pins, n)) ? 1 << bit : 0), 0);
/** Presses and releases the button `times` times. */
function press(session: SimulationSession, document: CircuitDocument, times: number) {
  for (let i = 0; i < times; i++) {
    session.update(document, ['CLK']);
    session.advance(10);
    session.update(document, []);
    session.advance(10);
  }
}

describe('74HC393 counter', () => {
  const Q = [3, 4, 5, 6];
  const counter = (reset: boolean) => {
    const button = clockButton(14, 1);
    return circuit(
      [chip('74HC393', 14), ...button.components],
      [
        ['BAT1.pos', beside(14, 14)],
        ['BAT1.neg', beside(14, 7)],
        ...button.wires,
        tie(14, 2, reset),
      ],
    );
  };

  it('counts each press on the release (the falling edge), and wraps after 15', () => {
    const document = counter(false);
    const session = new SimulationSession(document);
    expect(count(session, 14, Q)).toBe(0);
    session.update(document, ['CLK']);
    expect(count(session, 14, Q)).toBe(0); // pressed: the rising edge does nothing
    session.update(document, []);
    expect(count(session, 14, Q)).toBe(1);
    press(session, document, 4);
    expect(count(session, 14, Q)).toBe(5);
    press(session, document, 11);
    expect(count(session, 14, Q)).toBe(0);
  });

  it('master reset HIGH holds it at 0', () => {
    const document = counter(true);
    const session = new SimulationSession(document);
    press(session, document, 3);
    expect(count(session, 14, Q)).toBe(0);
  });
});

describe('74HC161 counter', () => {
  const Q = [14, 13, 12, 11];
  /** Clear HIGH and the enables HIGH; load as given, and D0-D3 set to 9 (1001). */
  const counter = (load: boolean) => {
    const button = clockButton(16, 2);
    return circuit(
      [chip('74HC161', 16), ...button.components],
      [
        ['BAT1.pos', beside(16, 16)],
        ['BAT1.neg', beside(16, 8)],
        ...button.wires,
        tie(16, 1, true),
        tie(16, 7, true),
        tie(16, 10, true),
        tie(16, 9, !load),
        tie(16, 3, true),
        tie(16, 4, false),
        tie(16, 5, false),
        tie(16, 6, true),
      ],
    );
  };

  it('counts on the press (the rising edge), with TC HIGH at 15', () => {
    const document = counter(false);
    const session = new SimulationSession(document);
    expect(count(session, 16, Q)).toBe(0);
    session.update(document, ['CLK']);
    expect(count(session, 16, Q)).toBe(1);
    session.update(document, []);
    expect(count(session, 16, Q)).toBe(1);
    press(session, document, 13);
    expect(count(session, 16, Q)).toBe(14);
    expect(high(session, strip(16, 15))).toBe(false);
    press(session, document, 1);
    expect(count(session, 16, Q)).toBe(15);
    expect(high(session, strip(16, 15))).toBe(true);
    press(session, document, 1);
    expect(count(session, 16, Q)).toBe(0);
  });

  it('PE̅ LOW loads D0 to D3 on the clock edge', () => {
    const document = counter(true);
    const session = new SimulationSession(document);
    expect(count(session, 16, Q)).toBe(0);
    press(session, document, 1);
    expect(count(session, 16, Q)).toBe(9);
  });
});

describe('CD4511 decoder', () => {
  const SEGMENT_PINS: Record<string, number> = { a: 13, b: 12, c: 11, d: 10, e: 9, f: 15, g: 14 };
  const decoder = (digit: number, { test = true, blank = true } = {}) =>
    circuit(
      [chip('CD4511', 16)],
      [
        ['BAT1.pos', beside(16, 16)],
        ['BAT1.neg', beside(16, 8)],
        tie(16, 3, test),
        tie(16, 4, blank),
        tie(16, 5, false), // LE LOW: the outputs follow the inputs
        ...[7, 1, 2, 6].map((pin, bit) => tie(16, pin, ((digit >> bit) & 1) === 1)),
      ],
    );
  const lit = (document: CircuitDocument) => {
    const result = simulate(document);
    return Object.entries(SEGMENT_PINS)
      .filter(([, pin]) => result.nodeVoltages[strip(16, pin)]! > 2.5)
      .map(([segment]) => segment)
      .join('');
  };

  it('lights the datasheet segments for 0 to 9, and none for 10 to 15', () => {
    for (let digit = 0; digit < 16; digit++) {
      expect(lit(decoder(digit)), `digit ${digit}`).toBe(CD4511_DIGITS[digit] ?? '');
    }
  });

  it('LT̅ LOW lights every segment, and BL̅ LOW none', () => {
    expect(lit(decoder(1, { test: false }))).toBe('abcdefg');
    expect(lit(decoder(8, { blank: false }))).toBe('');
  });
});

describe('seven-segment display', () => {
  /**
   * The display at column 30: e, d, COM, c, DP along row h, b, a, COM, f, g back
   * along row d. Segment a (d33) is fed through 1 kΩ from a33 to a37.
   */
  const display = (kind: 'cathode' | 'anode') =>
    circuit(
      [
        {
          id: 'DS1',
          type: 'sevenseg',
          pins: {
            e: 'BB1.h30',
            d: 'BB1.h31',
            com: 'BB1.h32',
            c: 'BB1.h33',
            dp: 'BB1.h34',
            b: 'BB1.d34',
            a: 'BB1.d33',
            com2: 'BB1.d32',
            f: 'BB1.d31',
            g: 'BB1.d30',
          },
          props: { kind },
        },
        {
          id: 'R1',
          type: 'resistor',
          pins: { a: 'BB1.a33', b: 'BB1.a37' },
          props: { resistance: 1000 },
        },
      ],
      kind === 'cathode'
        ? [
            ['BAT1.pos', 'BB1.b37'],
            ['BAT1.neg', 'BB1.j32'],
          ]
        : [
            ['BAT1.neg', 'BB1.b37'],
            ['BAT1.pos', 'BB1.j32'],
          ],
    );

  it('lights the one segment fed, in either kind of display', () => {
    for (const kind of ['cathode', 'anode'] as const) {
      const reading = simulate(display(kind)).readings.DS1!;
      for (const segment of SEVEN_SEGMENTS) {
        expect(reading.segments![segment] > 0, `${kind} ${segment}`).toBe(segment === 'a');
      }
      expect(reading.led!.state).toBe('on');
    }
  });

  it('wired the wrong way round for its kind, it stays dark', () => {
    const wrong = display('cathode');
    const reversed = {
      ...wrong,
      components: wrong.components.map((c) =>
        c.type === 'sevenseg' ? { ...c, props: { kind: 'anode' as const } } : c,
      ),
    };
    const reading = simulate(reversed).readings.DS1!;
    expect(Math.max(...Object.values(reading.segments!))).toBe(0);
  });
});

describe('placing them', () => {
  it('a 16-pin chip lands across the gap, pins 1-8 in row f and 16-9 in row e', () => {
    const placed = placePart(emptyCircuit(), 'logic16', 'BB1.a5');
    expect(placed.ok).toBe(true);
    const part = placed.ok ? placed.circuit.components.find((c) => c.id === placed.id) : undefined;
    expect(part?.type === 'logic16' && part.pins).toMatchObject({
      p1: 'BB1.f5',
      p8: 'BB1.f12',
      p9: 'BB1.e12',
      p16: 'BB1.e5',
    });
  });

  it('a display lands with its legs 0.6 inch apart, in rows h and d', () => {
    const placed = placePart(emptyCircuit(), 'sevenseg', 'BB1.e20');
    const part = placed.ok ? placed.circuit.components.find((c) => c.id === placed.id) : undefined;
    expect(part?.type === 'sevenseg' && part.pins).toMatchObject({
      e: 'BB1.h20',
      dp: 'BB1.h24',
      b: 'BB1.d24',
      g: 'BB1.d20',
    });
  });
});
