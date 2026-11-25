import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { PART_SHAPES } from '@banglalab/shared';
import {
  CIRCUIT_SCHEMA_VERSION,
  updateProps,
  type CircuitComponent,
  type CircuitDocument,
  type Wire,
} from '@banglalab/shared';
import {
  addSheetElement,
  connectBus,
  connectSheet,
  emptySheet,
  makeBlock,
  setSheetElement,
  type LogicSheet,
  type SheetEdit,
  type SheetKind,
} from '@banglalab/shared';
import {
  SimulationSession,
  evaluateSheet,
  nextSheetClockChange,
  type SheetState,
} from '@banglalab/simulation';
import { describe, expect, it } from 'vitest';
import { LESSONS, lessonProblems } from './index';
import { checkStep, unmetWiring, type LessonWorld } from './checks';
import type { Check, Lesson, Place } from './schema';

const STARTERS = new URL('../../board-emulators/fixtures/esp32-starters/', import.meta.url);
const starter = (id: string) => readFileSync(new URL(`${id}.wasm.base64`, STARTERS), 'utf8');

describe('lesson files', () => {
  it('are all registered, valid, and numbered 1, 2, 3… without gaps', () => {
    const files = readdirSync(new URL('../content/', import.meta.url))
      .filter((file) => file.endsWith('.json'))
      .map((file) => file.replace(/\.json$/, ''))
      .sort();
    expect(LESSONS.map((lesson) => lesson.id).sort()).toEqual(files);
    expect(LESSONS.map((lesson) => lesson.order)).toEqual(LESSONS.map((_, i) => i + 1));
    for (const lesson of LESSONS) expect(lessonProblems(lesson), lesson.id).toEqual([]);
  });

  it('use ready-made programs that exist, and part types and legs that exist', () => {
    const types = new Set<string>([
      ...Object.keys(PART_SHAPES),
      'battery',
      'uno',
      'esp32',
      'l298n',
    ]);
    const legsOf = (type: string) =>
      type in PART_SHAPES ? PART_SHAPES[type as keyof typeof PART_SHAPES].pins : null;
    for (const lesson of LESSONS) {
      if (lesson.program) {
        expect(existsSync(new URL(`${lesson.program}.ino`, STARTERS)), lesson.id).toBe(true);
      }
      const places: Place[] = [];
      const parts: string[] = [];
      for (const check of lesson.steps.flatMap((step) => step.checks)) {
        if (check.kind === 'connected') places.push(check.from, check.to);
        if (check.kind === 'part') parts.push(check.type);
        if (check.kind === 'prop' || check.kind === 'reading') parts.push(check.part);
      }
      for (const place of places) {
        if (!('part' in place)) continue;
        parts.push(place.part);
        const legs = legsOf(place.part);
        if (legs && place.pin !== '*')
          expect(legs, `${lesson.id}: ${place.part}`).toContain(place.pin);
      }
      for (const type of parts) expect(types.has(type), `${lesson.id}: ${type}`).toBe(true);
    }
  });

  it('keep logic sheet checks to logic sheet lessons, naming real elements', () => {
    const lesson = LESSONS.find((l) => !l.sheet)!;
    const withSheetCheck = {
      ...lesson,
      steps: [{ ...lesson.steps[0]!, checks: [{ kind: 'sheet-block' }] }, ...lesson.steps.slice(1)],
    };
    expect(lessonProblems(withSheetCheck)).toContain(
      'a sheet-block check belongs in a lesson on the logic sheet',
    );
    const sheetLesson = LESSONS.find((l) => l.sheet)!;
    const unknown = {
      ...sheetLesson,
      steps: [
        { ...sheetLesson.steps[0]!, checks: [{ kind: 'sheet-part', type: 'FLUX' }] },
        ...sheetLesson.steps.slice(1),
      ],
    };
    expect(lessonProblems(unknown)).toContain('no element "FLUX" on the logic sheet');
    expect(lessonProblems({ ...lesson, parts: [] })).toContain('a lesson needs a part');
  });

  it('refuse a lesson that is malformed or points at nothing', () => {
    const lesson = LESSONS[0]!;
    expect(lessonProblems({ ...lesson, steps: [] }).length).toBeGreaterThan(0);
    expect(lessonProblems({ ...lesson, parts: ['no-such-part'] })).toContain(
      'no part definition "no-such-part"',
    );
    expect(lessonProblems({ ...lesson, program: undefined })).toContain(
      'a step puts a program on the board, but the lesson has none',
    );
    const wrongProgram = {
      ...lesson,
      steps: lesson.steps.map((step) =>
        step.program ? { ...step, checks: [{ kind: 'program', starter: 'servo' }] } : step,
      ),
    };
    expect(lessonProblems(wrongProgram)).toContain(
      'a step checks for program "servo", not the lesson\'s own',
    );
  });
});

/**
 * A student's way through each lesson: a circuit that does what the lesson
 * asks, and what they change on a step. Each lesson is then walked through,
 * step by step, against the real simulation and the ready-made program, and
 * every step must complete. This is what keeps a lesson from asking for
 * something the lab cannot show.
 */
interface Walkthrough {
  components: CircuitComponent[];
  wires: [string, string][];
  /** What the student does on a step, by step index; a change may wait a while. */
  actions?: Record<number, Action[]>;
}
type Action =
  | { set: string; props: Record<string, unknown>; afterMs?: number }
  | { press: string; afterMs?: number }
  /** A line typed on a module's phone panel. */
  | { phone: string; text: string; afterMs?: number }
  | { release: string; afterMs?: number }
  | { edit: (circuit: CircuitDocument) => CircuitDocument; afterMs?: number }
  /** The circuit is stopped and started again: the board keeps only what it saved. */
  | { restart: true; afterMs?: number }
  /** An edit to the logic sheet, as the student makes it there. */
  | { sheet: (sheet: LogicSheet) => LogicSheet; afterMs?: number };

/** Sheet edits that must succeed. */
const sheetOk = (edit: SheetEdit): LogicSheet => {
  if (!edit.ok) throw new Error(edit.error);
  return edit.sheet;
};
const place = (kind: SheetKind, x: number, y: number) => (s: LogicSheet) =>
  sheetOk(addSheetElement(s, kind, x, y));
const wire = (pairs: [string, string][]) => (s: LogicSheet) =>
  pairs.reduce((sheet, [a, b]) => sheetOk(connectSheet(sheet, a, b)), s);
/** What the sheet's displays and lamps show, as the lab's sheet view reports it. */
function sheetValues(sheet: LogicSheet, state: SheetState) {
  return sheet.elements.flatMap((e): { type: string; value: number }[] => {
    const level = (port: string) => state.levels[`${e.id}.${port}`] === true;
    if (e.kind === 'output') return [{ type: e.kind, value: level('a') ? 1 : 0 }];
    if (e.kind === 'HEX')
      return [
        {
          type: e.kind,
          value: [0, 1, 2, 3].reduce((sum, bit) => sum + (level(`d${bit}`) ? 1 << bit : 0), 0),
        },
      ];
    if (e.kind === 'CNT' || e.kind === 'REG')
      return [{ type: e.kind, value: state.store[e.id]?.[0] ?? 0 }];
    return [];
  });
}

const esp32: CircuitComponent = { id: 'ESP1', type: 'esp32', props: {} };
/** A Ra-02's legs, and the ESP32 pins the LoRa lesson joins them to, in the same order. */
const LORA_LEGS = ['gnd', 'vcc', 'rst', 'dio0', 'nss', 'mosi', 'miso', 'sck'] as const;
const LORA_PINS = ['gnd1', '3v3', 'd14', 'd2', 'd5', 'd23', 'd19', 'd18'] as const;
const part = (
  id: string,
  type: string,
  pins: Record<string, string>,
  props: Record<string, unknown> = {},
) => ({ id, type, pins, props }) as unknown as CircuitComponent;
/** The LED with its 220 Ω resistor on the lower half of the breadboard, from D2. */
const lamp = [
  part('R1', 'resistor', { a: 'BB1.f20', b: 'BB1.f24' }, { resistance: 220 }),
  part('LED1', 'led', { anode: 'BB1.g24', cathode: 'BB1.g25' }, { color: 'red' }),
];
const lampWires: [string, string][] = [
  ['ESP1.d2', 'BB1.j20'],
  ['ESP1.gnd2', 'BB1.j25'],
];

/** A 14- or 16-pin chip with pin 1 at f10: pins along row f, then back along row e. */
const dip = (id: string, type: 'logic' | 'logic16', chip: string, pins: 14 | 16) =>
  part(
    id,
    type,
    Object.fromEntries(
      Array.from({ length: pins }, (_, i) => {
        const n = i + 1;
        const half = pins / 2;
        return [`p${n}`, n <= half ? `BB1.f${9 + n}` : `BB1.e${10 + pins - n}`];
      }),
    ),
    { chip },
  );

const WALKTHROUGHS: Record<string, Walkthrough> = {
  'half-adder': {
    components: [esp32],
    wires: [],
    actions: {
      0: [{ sheet: place('input', 2, 2) }, { sheet: place('input', 2, 8) }],
      1: [{ sheet: place('XOR', 8, 2) }, { sheet: place('AND', 8, 8) }],
      2: [
        {
          sheet: wire([
            ['IN1.q', 'G1.a'],
            ['IN2.q', 'G1.b'],
            ['IN1.q', 'G2.a'],
            ['IN2.q', 'G2.b'],
          ]),
        },
      ],
      3: [
        { sheet: place('output', 14, 2) },
        { sheet: place('output', 14, 8) },
        {
          sheet: wire([
            ['G1.y', 'OUT1.a'],
            ['G2.y', 'OUT2.a'],
          ]),
        },
        { sheet: (s) => sheetOk(setSheetElement(s, 'OUT1', { label: 'Sum' })) },
      ],
      5: [
        {
          sheet: (s) =>
            sheetOk(
              makeBlock(
                s,
                s.elements.map((e) => e.id),
                'Half add',
              ),
            ),
        },
      ],
    },
  },
  'binary-counter': {
    components: [esp32],
    wires: [],
    actions: {
      0: [{ sheet: place('clock', 2, 4) }, { sheet: place('CNT', 8, 3) }],
      1: [{ sheet: wire([['CLK1.q', 'CNT1.clk']]) }],
      2: [
        { sheet: place('HEX', 14, 4) },
        { sheet: (s) => sheetOk(connectBus(s, 'CNT1.q', 'HEX1.d')) },
      ],
      // Faster, as the step suggests, so 9 comes in under two seconds.
      3: [{ sheet: (s) => sheetOk(setSheetElement(s, 'CLK1', { hz: 5 })) }],
    },
  },
  'majority-vote': {
    components: [esp32],
    wires: [],
    actions: {
      0: [
        { sheet: place('input', 2, 1) },
        { sheet: place('input', 2, 7) },
        { sheet: place('input', 2, 13) },
        { sheet: place('output', 26, 7) },
      ],
      1: [
        { sheet: place('AND', 9, 1) },
        { sheet: place('AND', 9, 7) },
        { sheet: place('AND', 9, 13) },
        { sheet: place('OR', 17, 7) },
        { sheet: (s) => sheetOk(setSheetElement(s, 'G4', { inputs: 3 })) },
      ],
      2: [
        {
          sheet: wire([
            ['IN1.q', 'G1.a'],
            ['IN2.q', 'G1.b'],
            ['IN1.q', 'G2.a'],
            ['IN3.q', 'G2.b'],
            ['IN2.q', 'G3.a'],
            ['IN3.q', 'G3.b'],
            ['G1.y', 'G4.a'],
            ['G2.y', 'G4.b'],
            ['G3.y', 'G4.c'],
            ['G4.y', 'OUT1.a'],
          ]),
        },
      ],
    },
  },
  'shift-register': {
    // The 74HC595 at f10: pins 1-8 f10-f17 (Q1-Q7, GND), 16-9 e10-e17 (VCC, Q0, DS, OE̅,
    // STCP, SHCP, MR̅, Q7S). LEDs on Q0 (column 11, top) and Q1 (column 10, bottom).
    components: [
      esp32,
      dip('U1', 'logic16', '74HC595', 16),
      part('R0', 'resistor', { a: 'BB1.c11', b: 'BB1.c22' }, { resistance: 330 }),
      part('LED0', 'led', { anode: 'BB1.b22', cathode: 'BB1.b23' }, { color: 'red' }),
      part('R1', 'resistor', { a: 'BB1.g10', b: 'BB1.g24' }, { resistance: 330 }),
      part('LED1', 'led', { anode: 'BB1.h24', cathode: 'BB1.h25' }, { color: 'green' }),
    ],
    wires: [
      ['ESP1.3v3', 'BB1.a10'],
      ['ESP1.gnd1', 'BB1.j17'],
      ['ESP1.3v3', 'BB1.a16'],
      ['ESP1.gnd1', 'BB1.a13'],
      ['ESP1.d23', 'BB1.a12'],
      ['ESP1.d18', 'BB1.a15'],
      ['ESP1.d5', 'BB1.a14'],
      ['ESP1.gnd2', 'BB1.a23'],
      ['ESP1.gnd2', 'BB1.j25'],
    ],
  },
  'counter-display': {
    // On a full breadboard. The clock module at c2-c4; the 74HC393 at f10 (pins 1-7 f10-f16,
    // 14-8 e10-e16); the CD4511 at f20 (pins 1-8 f20-f27, 16-9 e20-e27); the display at
    // h30-h34 (e, d, COM, c, DP) and d34-d30 (b, a, COM, f, g).
    components: [
      esp32,
      part('CLK1', 'clock', { vcc: 'BB1.c2', out: 'BB1.c3', gnd: 'BB1.c4' }, { hz: 1 }),
      dip('U1', 'logic', '74HC393', 14),
      part(
        'U2',
        'logic16',
        Object.fromEntries(
          Array.from({ length: 16 }, (_, i) => [
            `p${i + 1}`,
            i < 8 ? `BB1.f${20 + i}` : `BB1.e${35 - i}`,
          ]),
        ),
        { chip: 'CD4511' },
      ),
      part(
        'DS1',
        'sevenseg',
        {
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
        { kind: 'cathode' },
      ),
      // A resistor from each output's column to the segment's column, or to a free column
      // wired across the gap to it.
      part('RG', 'resistor', { a: 'BB1.c22', b: 'BB1.c30' }, { resistance: 470 }),
      part('RF', 'resistor', { a: 'BB1.b21', b: 'BB1.b31' }, { resistance: 470 }),
      part('RA', 'resistor', { a: 'BB1.a23', b: 'BB1.a33' }, { resistance: 470 }),
      part('RB', 'resistor', { a: 'BB1.c24', b: 'BB1.c34' }, { resistance: 470 }),
      part('RC', 'resistor', { a: 'BB1.c25', b: 'BB1.c35' }, { resistance: 470 }),
      part('RD', 'resistor', { a: 'BB1.c26', b: 'BB1.c36' }, { resistance: 470 }),
      part('RE', 'resistor', { a: 'BB1.c27', b: 'BB1.c37' }, { resistance: 470 }),
    ],
    wires: [
      ['ESP1.vin', 'BB1.a2'],
      ['ESP1.gnd1', 'BB1.a4'],
      ['ESP1.vin', 'BB1.a10'], // 393 VCC
      ['ESP1.gnd1', 'BB1.j16'], // 393 GND
      ['ESP1.gnd1', 'BB1.j11'], // 1MR
      ['BB1.a3', 'BB1.j10'], // clock to 1CP
      ['ESP1.vin', 'BB1.a20'], // 4511 VDD
      ['ESP1.gnd2', 'BB1.j27'], // 4511 VSS
      ['ESP1.vin', 'BB1.j22'], // LT̅
      ['ESP1.vin', 'BB1.j23'], // BL̅
      ['ESP1.gnd2', 'BB1.j24'], // LE
      ['BB1.j12', 'BB1.j26'], // Q0 to A
      ['BB1.i13', 'BB1.i20'], // Q1 to B
      ['BB1.i14', 'BB1.i21'], // Q2 to C
      ['BB1.i15', 'BB1.i25'], // Q3 to D
      ['BB1.a35', 'BB1.j33'], // to segment c
      ['BB1.a36', 'BB1.j31'], // to segment d
      ['BB1.a37', 'BB1.j30'], // to segment e
      ['ESP1.gnd2', 'BB1.j32'], // COM
    ],
    actions: { 5: [{ set: 'CLK1', props: { hz: 5 }, afterMs: 100 }] },
  },
  'flip-flop': {
    // The 74HC74 at f10: pin 1 f10 … pin 7 f16, pin 14 e10 … pin 8 e16.
    components: [
      esp32,
      dip('U1', 'logic', '74HC74', 14),
      // The clock button from pin 3 (column 12) to column 8 (3V3), and 10 kΩ to column 6 (GND).
      part('SW1', 'button', { a: 'BB1.i12', b: 'BB1.i8' }),
      part('R1', 'resistor', { a: 'BB1.h12', b: 'BB1.h6' }, { resistance: 10_000 }),
      // Q (pin 5, column 14) through 330 Ω to the LED, whose − goes to pin 7's column (GND).
      part('R2', 'resistor', { a: 'BB1.g14', b: 'BB1.g22' }, { resistance: 330 }),
      part('LED1', 'led', { anode: 'BB1.h22', cathode: 'BB1.h23' }, { color: 'red' }),
    ],
    wires: [
      ['ESP1.3v3', 'BB1.a10'],
      ['ESP1.gnd1', 'BB1.j16'],
      ['ESP1.3v3', 'BB1.j8'],
      ['ESP1.gnd2', 'BB1.j6'],
      ['ESP1.3v3', 'BB1.j10'], // CLR
      ['ESP1.3v3', 'BB1.j13'], // PRE
      ['BB1.j15', 'BB1.j11'], // Q̅ to D
      ['BB1.j23', 'BB1.i16'],
    ],
    actions: {
      5: [
        { press: 'SW1', afterMs: 200 },
        { release: 'SW1', afterMs: 200 },
      ],
      6: [
        { press: 'SW1', afterMs: 200 },
        { release: 'SW1', afterMs: 200 },
      ],
    },
  },
  'logic-gates': {
    // The 74HC08 at f10: pin 1 f10 … pin 7 f16, pin 14 e10 … pin 8 e16.
    components: [
      esp32,
      dip('U1', 'logic', '74HC08', 14),
      // Pull-downs from pins 1 and 2 (columns 10, 11) to columns 6 and 7, which are GND.
      part('R1', 'resistor', { a: 'BB1.g10', b: 'BB1.g6' }, { resistance: 10_000 }),
      part('R2', 'resistor', { a: 'BB1.h11', b: 'BB1.h7' }, { resistance: 10_000 }),
      // Switches from pins 1 and 2 to columns 8 and 9, which are 3V3.
      part('S1', 'switch', { a: 'BB1.i10', b: 'BB1.i8' }, { closed: false }),
      part('S2', 'switch', { a: 'BB1.j11', b: 'BB1.j9' }, { closed: false }),
      // Pin 3 (column 12) through 330 Ω to the LED, whose − goes to pin 7's column (GND).
      part('R3', 'resistor', { a: 'BB1.g12', b: 'BB1.g20' }, { resistance: 330 }),
      part('LED1', 'led', { anode: 'BB1.h20', cathode: 'BB1.h21' }, { color: 'red' }),
    ],
    wires: [
      ['ESP1.3v3', 'BB1.a10'],
      ['ESP1.gnd1', 'BB1.j16'],
      ['ESP1.gnd2', 'BB1.j6'],
      ['BB1.i6', 'BB1.i7'],
      ['ESP1.3v3', 'BB1.j8'],
      ['BB1.h8', 'BB1.h9'],
      ['BB1.j21', 'BB1.i16'],
    ],
    actions: {
      4: [
        { set: 'S1', props: { closed: true }, afterMs: 200 },
        { set: 'S2', props: { closed: true }, afterMs: 200 },
      ],
      5: [{ set: 'S2', props: { closed: false }, afterMs: 200 }],
      6: [{ set: 'U1', props: { chip: '74HC32' }, afterMs: 200 }],
    },
  },
  'esp32-blink': { components: [esp32, ...lamp], wires: lampWires },
  'led-resistor': {
    components: [esp32, ...lamp],
    wires: [
      ['ESP1.3v3', 'BB1.j20'],
      ['ESP1.gnd2', 'BB1.j25'],
    ],
    actions: {
      3: [{ set: 'R1', props: { resistance: 1000 } }],
      // The resistor taken out, and the LED's long leg wired straight to 3V3.
      4: [
        {
          edit: (circuit) => ({
            ...circuit,
            components: circuit.components.filter((c) => c.id !== 'R1'),
            wires: [
              ...circuit.wires,
              { id: 'W9', from: 'ESP1.3v3', to: 'BB1.j24', color: '#000000' },
            ],
          }),
        },
      ],
    },
  },
  'push-button': {
    components: [esp32, part('SW1', 'button', { a: 'BB1.e10', b: 'BB1.f10' }), ...lamp],
    wires: [['ESP1.d4', 'BB1.a10'], ['ESP1.gnd1', 'BB1.j10'], ...lampWires],
    actions: {
      3: [
        { press: 'SW1', afterMs: 300 },
        { release: 'SW1', afterMs: 300 },
      ],
    },
  },
  'rgb-led': {
    components: [
      esp32,
      part('RGB1', 'rgbled', { r: 'BB1.e10', g: 'BB1.e11', b: 'BB1.e12', gnd: 'BB1.e13' }),
      part('R1', 'resistor', { a: 'BB1.c6', b: 'BB1.c10' }, { resistance: 220 }),
      part('R2', 'resistor', { a: 'BB1.d7', b: 'BB1.d11' }, { resistance: 220 }),
      part('R3', 'resistor', { a: 'BB1.b8', b: 'BB1.b12' }, { resistance: 220 }),
    ],
    wires: [
      ['ESP1.d25', 'BB1.a6'],
      ['ESP1.d26', 'BB1.a7'],
      ['ESP1.d27', 'BB1.a8'],
      ['ESP1.gnd1', 'BB1.a13'],
    ],
  },
  dht11: {
    components: [
      esp32,
      part(
        'DHT1',
        'dht11',
        { vcc: 'BB1.c10', data: 'BB1.c11', gnd: 'BB1.c12' },
        { celsius: 28, humidity: 70 },
      ),
    ],
    wires: [
      ['ESP1.3v3', 'BB1.a10'],
      ['ESP1.d4', 'BB1.a11'],
      ['ESP1.gnd1', 'BB1.a12'],
    ],
    actions: { 3: [{ set: 'DHT1', props: { celsius: 35 } }] },
  },
  'ldr-module': {
    components: [
      esp32,
      part(
        'LDM1',
        'ldrmodule',
        { vcc: 'BB1.c10', gnd: 'BB1.c11', do: 'BB1.c12', ao: 'BB1.c13' },
        { light: 0.5, threshold: 0.5 },
      ),
      ...lamp,
    ],
    wires: [
      ['ESP1.3v3', 'BB1.a10'],
      ['ESP1.gnd1', 'BB1.a11'],
      ['ESP1.d27', 'BB1.a12'],
      ['ESP1.d34', 'BB1.a13'],
      ...lampWires,
    ],
    actions: { 4: [{ set: 'LDM1', props: { light: 0.95 } }] },
  },
  'rain-sensor': {
    components: [
      esp32,
      part(
        'RAIN1',
        'rain',
        { vcc: 'BB1.c10', gnd: 'BB1.c11', do: 'BB1.c12', ao: 'BB1.c13' },
        { wetness: 0, threshold: 0.5 },
      ),
      ...lamp,
    ],
    wires: [
      ['ESP1.3v3', 'BB1.a10'],
      ['ESP1.gnd1', 'BB1.a11'],
      ['ESP1.d27', 'BB1.a12'],
      ['ESP1.d34', 'BB1.a13'],
      ...lampWires,
    ],
    actions: { 4: [{ set: 'RAIN1', props: { wetness: 0.85 } }] },
  },
  'soil-moisture': {
    components: [
      esp32,
      part('SOIL1', 'soil', { vcc: 'BB1.c10', out: 'BB1.c11', gnd: 'BB1.c12' }, { moisture: 0.3 }),
      ...lamp,
    ],
    wires: [
      ['ESP1.3v3', 'BB1.a10'],
      ['ESP1.d34', 'BB1.a11'],
      ['ESP1.gnd1', 'BB1.a12'],
      ...lampWires,
    ],
    actions: { 4: [{ set: 'SOIL1', props: { moisture: 0.05 } }] },
  },
  'mq135-gas': {
    components: [
      esp32,
      part(
        'MQ1',
        'mq135',
        { vcc: 'BB1.c10', gnd: 'BB1.c11', do: 'BB1.c12', ao: 'BB1.c13' },
        { gas: 0.1, threshold: 0.5 },
      ),
      part('R2', 'resistor', { a: 'BB1.d13', b: 'BB1.d17' }, { resistance: 10_000 }),
      part('R3', 'resistor', { a: 'BB1.b17', b: 'BB1.b21' }, { resistance: 10_000 }),
      ...lamp,
    ],
    wires: [
      ['ESP1.vin', 'BB1.a10'],
      ['ESP1.gnd1', 'BB1.a11'],
      ['ESP1.d34', 'BB1.a17'],
      ['ESP1.gnd1', 'BB1.a21'],
      ...lampWires,
    ],
    actions: { 5: [{ set: 'MQ1', props: { gas: 0.85 } }] },
  },
  ultrasonic: {
    components: [
      esp32,
      part(
        'US1',
        'ultrasonic',
        { vcc: 'BB1.c10', trig: 'BB1.c11', echo: 'BB1.c12', gnd: 'BB1.c13' },
        { distance: 50 },
      ),
      part('R2', 'resistor', { a: 'BB1.d12', b: 'BB1.d16' }, { resistance: 1000 }),
      part('R3', 'resistor', { a: 'BB1.b16', b: 'BB1.b20' }, { resistance: 2000 }),
    ],
    wires: [
      ['ESP1.vin', 'BB1.a10'],
      ['ESP1.d5', 'BB1.a11'],
      ['ESP1.gnd1', 'BB1.a13'],
      ['ESP1.d18', 'BB1.a16'],
      ['ESP1.gnd2', 'BB1.a20'],
    ],
    actions: { 4: [{ set: 'US1', props: { distance: 100 } }] },
  },
  'pir-motion': {
    components: [
      esp32,
      part(
        'PIR1',
        'pir',
        { vcc: 'BB1.c10', out: 'BB1.c11', gnd: 'BB1.c12' },
        { motion: false, hold: 3 },
      ),
      ...lamp,
    ],
    wires: [
      ['ESP1.vin', 'BB1.a10'],
      ['ESP1.d27', 'BB1.a11'],
      ['ESP1.gnd1', 'BB1.a12'],
      ...lampWires,
    ],
    actions: {
      3: [{ set: 'PIR1', props: { motion: true }, afterMs: 200 }],
      4: [{ set: 'PIR1', props: { motion: false } }],
    },
  },
  'ir-obstacle': {
    components: [
      esp32,
      part('IR1', 'ir', { vcc: 'BB1.c10', out: 'BB1.c11', gnd: 'BB1.c12' }, { detected: false }),
      ...lamp,
    ],
    wires: [
      ['ESP1.3v3', 'BB1.a10'],
      ['ESP1.d27', 'BB1.a11'],
      ['ESP1.gnd1', 'BB1.a12'],
      ...lampWires,
    ],
    actions: {
      3: [
        { set: 'IR1', props: { detected: true }, afterMs: 200 },
        { set: 'IR1', props: { detected: false }, afterMs: 300 },
      ],
    },
  },
  buzzer: {
    components: [
      esp32,
      part(
        'BZ1',
        'buzzermodule',
        { s: 'BB1.c10', vcc: 'BB1.c11', gnd: 'BB1.c12' },
        { trigger: 'high' },
      ),
    ],
    wires: [
      ['ESP1.d25', 'BB1.a10'],
      ['ESP1.gnd1', 'BB1.a12'],
    ],
  },
  'oled-display': {
    components: [
      esp32,
      part('OLED1', 'oled', { gnd: 'BB1.c10', vcc: 'BB1.c11', scl: 'BB1.c12', sda: 'BB1.c13' }),
    ],
    wires: [
      ['ESP1.gnd1', 'BB1.a10'],
      ['ESP1.3v3', 'BB1.a11'],
      ['ESP1.d22', 'BB1.a12'],
      ['ESP1.d21', 'BB1.a13'],
    ],
  },
  servo: {
    components: [
      esp32,
      part('SRV1', 'servo', { gnd: 'BB1.c10', vcc: 'BB1.c11', signal: 'BB1.c12' }),
    ],
    wires: [
      ['ESP1.gnd1', 'BB1.a10'],
      ['ESP1.vin', 'BB1.a11'],
      ['ESP1.d13', 'BB1.a12'],
    ],
  },
  'motor-driver': {
    components: [
      esp32,
      { id: 'BAT1', type: 'battery', props: { voltage: 7.2 } },
      { id: 'DRV1', type: 'l298n', props: { enaJumper: false, enbJumper: true } },
      part('M1', 'motor', { a: 'BB1.c10', b: 'BB1.c13' }),
    ],
    wires: [
      ['BAT1.pos', 'DRV1.vs'],
      ['BAT1.neg', 'DRV1.gnd'],
      ['ESP1.gnd1', 'DRV1.gnd'],
      ['DRV1.out1', 'BB1.a10'],
      ['DRV1.out2', 'BB1.a13'],
      ['ESP1.d25', 'DRV1.ena'],
      ['ESP1.d26', 'DRV1.in1'],
      ['ESP1.d27', 'DRV1.in2'],
    ],
  },
  'saved-settings': {
    components: [esp32, part('SW1', 'button', { a: 'BB1.e10', b: 'BB1.f10' })],
    wires: [
      ['ESP1.d4', 'BB1.a10'],
      ['ESP1.gnd1', 'BB1.j10'],
    ],
    actions: {
      4: [{ restart: true, afterMs: 300 }],
      5: [
        { press: 'SW1', afterMs: 200 },
        { release: 'SW1', afterMs: 200 },
        { restart: true, afterMs: 300 },
      ],
    },
  },
  'relay-module': {
    components: [
      esp32,
      { id: 'BAT1', type: 'battery', props: { voltage: 6 } },
      part(
        'RLY1',
        'relaymodule',
        {
          vcc: 'BB1.c10',
          gnd: 'BB1.c11',
          in: 'BB1.c12',
          com: 'BB1.c14',
          no: 'BB1.c15',
          nc: 'BB1.c16',
        },
        { trigger: 'high' },
      ),
      part('R1', 'resistor', { a: 'BB1.b15', b: 'BB1.b19' }, { resistance: 220 }),
      part('LED1', 'led', { anode: 'BB1.d19', cathode: 'BB1.d20' }, { color: 'red' }),
    ],
    wires: [
      ['ESP1.vin', 'BB1.a10'],
      ['ESP1.gnd1', 'BB1.a11'],
      ['ESP1.d26', 'BB1.a12'],
      ['BAT1.pos', 'BB1.a14'],
      ['BAT1.neg', 'BB1.a20'],
    ],
  },
  'auto-watering': {
    components: [
      esp32,
      { id: 'BAT1', type: 'battery', props: { voltage: 6 } },
      part('SOIL1', 'soil', { vcc: 'BB1.c1', out: 'BB1.c2', gnd: 'BB1.c3' }, { moisture: 0.3 }),
      part(
        'RLY1',
        'relaymodule',
        {
          vcc: 'BB1.c10',
          gnd: 'BB1.c11',
          in: 'BB1.c12',
          com: 'BB1.c14',
          no: 'BB1.c15',
          nc: 'BB1.c16',
        },
        { trigger: 'high' },
      ),
      part('M1', 'motor', { a: 'BB1.c20', b: 'BB1.c23' }),
    ],
    wires: [
      ['ESP1.3v3', 'BB1.a1'],
      ['ESP1.d34', 'BB1.a2'],
      ['ESP1.gnd1', 'BB1.a3'],
      ['ESP1.vin', 'BB1.a10'],
      ['ESP1.gnd1', 'BB1.a11'],
      ['ESP1.d26', 'BB1.a12'],
      ['BAT1.pos', 'BB1.a14'],
      ['BB1.a15', 'BB1.a20'],
      ['BAT1.neg', 'BB1.a23'],
    ],
    actions: {
      5: [{ set: 'SOIL1', props: { moisture: 0.05 } }],
      6: [{ set: 'SOIL1', props: { moisture: 0.6 } }],
    },
  },
  // ---- projects ----
  'street-light': {
    components: [
      esp32,
      part(
        'LDM1',
        'ldrmodule',
        { vcc: 'BB1.c1', gnd: 'BB1.c2', do: 'BB1.c3', ao: 'BB1.c4' },
        { light: 0.5, threshold: 0.5 },
      ),
      part(
        'PIR1',
        'pir',
        { vcc: 'BB1.c7', out: 'BB1.c8', gnd: 'BB1.c9' },
        { motion: false, hold: 3 },
      ),
      ...lamp,
    ],
    wires: [
      ['ESP1.3v3', 'BB1.a1'],
      ['ESP1.gnd1', 'BB1.a2'],
      ['ESP1.d27', 'BB1.a3'],
      ['ESP1.d34', 'BB1.a4'],
      ['ESP1.vin', 'BB1.a7'],
      ['ESP1.d26', 'BB1.a8'],
      ['ESP1.gnd1', 'BB1.a9'],
      ['ESP1.d25', 'BB1.j20'],
      ['ESP1.gnd2', 'BB1.j25'],
    ],
    actions: {
      5: [{ set: 'PIR1', props: { motion: true } }],
      6: [
        { set: 'PIR1', props: { motion: false } },
        { set: 'LDM1', props: { light: 0.95 } },
      ],
    },
  },
  'rain-alert': {
    components: [
      esp32,
      part(
        'RAIN1',
        'rain',
        { vcc: 'BB1.c1', gnd: 'BB1.c2', do: 'BB1.c3', ao: 'BB1.c4' },
        { wetness: 0, threshold: 0.5 },
      ),
      part('SRV1', 'servo', { gnd: 'BB1.c10', vcc: 'BB1.c11', signal: 'BB1.c12' }),
      part(
        'BZ1',
        'buzzermodule',
        { s: 'BB1.c15', vcc: 'BB1.c16', gnd: 'BB1.c17' },
        { trigger: 'high' },
      ),
    ],
    wires: [
      ['ESP1.3v3', 'BB1.a1'],
      ['ESP1.gnd1', 'BB1.a2'],
      ['ESP1.d27', 'BB1.a3'],
      ['ESP1.gnd1', 'BB1.a10'],
      ['ESP1.vin', 'BB1.a11'],
      ['ESP1.d13', 'BB1.a12'],
      ['ESP1.d25', 'BB1.a15'],
      ['ESP1.gnd2', 'BB1.a17'],
    ],
    actions: {
      5: [{ set: 'RAIN1', props: { wetness: 0.85 } }],
      6: [{ set: 'RAIN1', props: { wetness: 0 } }],
    },
  },
  'smart-dustbin': {
    components: [
      esp32,
      part(
        'US1',
        'ultrasonic',
        { vcc: 'BB1.c1', trig: 'BB1.c2', echo: 'BB1.c3', gnd: 'BB1.c4' },
        { distance: 50 },
      ),
      part('R2', 'resistor', { a: 'BB1.d3', b: 'BB1.d7' }, { resistance: 1000 }),
      part('R3', 'resistor', { a: 'BB1.b7', b: 'BB1.b11' }, { resistance: 2000 }),
      part('SRV1', 'servo', { gnd: 'BB1.c14', vcc: 'BB1.c15', signal: 'BB1.c16' }),
      part(
        'BZ1',
        'buzzermodule',
        { s: 'BB1.c20', vcc: 'BB1.c21', gnd: 'BB1.c22' },
        { trigger: 'high' },
      ),
    ],
    wires: [
      ['ESP1.vin', 'BB1.a1'],
      ['ESP1.d5', 'BB1.a2'],
      ['ESP1.gnd1', 'BB1.a4'],
      ['ESP1.d18', 'BB1.a7'],
      ['ESP1.gnd2', 'BB1.a11'],
      ['ESP1.gnd1', 'BB1.a14'],
      ['ESP1.vin', 'BB1.a15'],
      ['ESP1.d13', 'BB1.a16'],
      ['ESP1.d25', 'BB1.a20'],
      ['ESP1.gnd2', 'BB1.a22'],
    ],
    actions: { 5: [{ set: 'US1', props: { distance: 10 } }] },
  },
  'security-alarm': {
    components: [
      esp32,
      part(
        'PIR1',
        'pir',
        { vcc: 'BB1.c1', out: 'BB1.c2', gnd: 'BB1.c3' },
        { motion: false, hold: 3 },
      ),
      part('SW1', 'button', { a: 'BB1.e6', b: 'BB1.f6' }),
      part(
        'BZ1',
        'buzzermodule',
        { s: 'BB1.c10', vcc: 'BB1.c11', gnd: 'BB1.c12' },
        { trigger: 'high' },
      ),
      part('OLED1', 'oled', { gnd: 'BB1.c15', vcc: 'BB1.c16', scl: 'BB1.c17', sda: 'BB1.c18' }),
      ...lamp,
    ],
    wires: [
      ['ESP1.vin', 'BB1.a1'],
      ['ESP1.d27', 'BB1.a2'],
      ['ESP1.gnd1', 'BB1.a3'],
      ['ESP1.d4', 'BB1.a6'],
      ['ESP1.gnd1', 'BB1.j6'],
      ['ESP1.d25', 'BB1.a10'],
      ['ESP1.gnd1', 'BB1.a12'],
      ['ESP1.gnd2', 'BB1.a15'],
      ['ESP1.3v3', 'BB1.a16'],
      ['ESP1.d22', 'BB1.a17'],
      ['ESP1.d21', 'BB1.a18'],
      ...lampWires,
    ],
    actions: {
      5: [
        { press: 'SW1', afterMs: 500 },
        { release: 'SW1', afterMs: 300 },
      ],
      6: [{ set: 'PIR1', props: { motion: true } }],
      7: [
        { press: 'SW1', afterMs: 200 },
        { release: 'SW1', afterMs: 300 },
      ],
    },
  },
  'plant-monitor': {
    components: [
      esp32,
      part('SOIL1', 'soil', { vcc: 'BB1.c1', out: 'BB1.c2', gnd: 'BB1.c3' }, { moisture: 0.3 }),
      part(
        'DHT1',
        'dht11',
        { vcc: 'BB1.c6', data: 'BB1.c7', gnd: 'BB1.c8' },
        { celsius: 28, humidity: 70 },
      ),
      part('OLED1', 'oled', { gnd: 'BB1.c11', vcc: 'BB1.c12', scl: 'BB1.c13', sda: 'BB1.c14' }),
      part('R1', 'resistor', { a: 'BB1.c16', b: 'BB1.c20' }, { resistance: 220 }),
      part('R2', 'resistor', { a: 'BB1.d17', b: 'BB1.d21' }, { resistance: 220 }),
      part('R3', 'resistor', { a: 'BB1.b18', b: 'BB1.b22' }, { resistance: 220 }),
      part('RGB1', 'rgbled', { r: 'BB1.e20', g: 'BB1.e21', b: 'BB1.e22', gnd: 'BB1.e23' }),
    ],
    wires: [
      ['ESP1.3v3', 'BB1.a1'],
      ['ESP1.d34', 'BB1.a2'],
      ['ESP1.gnd1', 'BB1.a3'],
      ['ESP1.3v3', 'BB1.a6'],
      ['ESP1.d4', 'BB1.a7'],
      ['ESP1.gnd1', 'BB1.a8'],
      ['ESP1.gnd2', 'BB1.a11'],
      ['ESP1.3v3', 'BB1.a12'],
      ['ESP1.d22', 'BB1.a13'],
      ['ESP1.d21', 'BB1.a14'],
      ['ESP1.d25', 'BB1.a16'],
      ['ESP1.d26', 'BB1.a17'],
      ['ESP1.d27', 'BB1.a18'],
      ['ESP1.gnd2', 'BB1.a23'],
    ],
    actions: { 5: [{ set: 'SOIL1', props: { moisture: 0.05 } }] },
  },
  'air-quality': {
    components: [
      esp32,
      part(
        'MQ1',
        'mq135',
        { vcc: 'BB1.c1', gnd: 'BB1.c2', do: 'BB1.c3', ao: 'BB1.c4' },
        { gas: 0.1, threshold: 0.5 },
      ),
      part('R2', 'resistor', { a: 'BB1.d4', b: 'BB1.d8' }, { resistance: 10_000 }),
      part('R3', 'resistor', { a: 'BB1.b8', b: 'BB1.b12' }, { resistance: 10_000 }),
      part('OLED1', 'oled', { gnd: 'BB1.c14', vcc: 'BB1.c15', scl: 'BB1.c16', sda: 'BB1.c17' }),
      part(
        'BZ1',
        'buzzermodule',
        { s: 'BB1.c25', vcc: 'BB1.c26', gnd: 'BB1.c27' },
        { trigger: 'high' },
      ),
      part('R4', 'resistor', { a: 'BB1.f16', b: 'BB1.f20' }, { resistance: 220 }),
      part('R5', 'resistor', { a: 'BB1.h17', b: 'BB1.h21' }, { resistance: 220 }),
      part('R6', 'resistor', { a: 'BB1.i18', b: 'BB1.i22' }, { resistance: 220 }),
      part('RGB1', 'rgbled', { r: 'BB1.g20', g: 'BB1.g21', b: 'BB1.g22', gnd: 'BB1.g23' }),
    ],
    wires: [
      ['ESP1.vin', 'BB1.a1'],
      ['ESP1.gnd1', 'BB1.a2'],
      ['ESP1.d34', 'BB1.a8'],
      ['ESP1.gnd1', 'BB1.a12'],
      ['ESP1.gnd2', 'BB1.a14'],
      ['ESP1.3v3', 'BB1.a15'],
      ['ESP1.d22', 'BB1.a16'],
      ['ESP1.d21', 'BB1.a17'],
      ['ESP1.d32', 'BB1.a25'],
      ['ESP1.gnd2', 'BB1.a27'],
      ['ESP1.d25', 'BB1.j16'],
      ['ESP1.d26', 'BB1.j17'],
      ['ESP1.d27', 'BB1.j18'],
      ['ESP1.gnd2', 'BB1.j23'],
    ],
    actions: {
      5: [{ set: 'MQ1', props: { gas: 0.5 } }],
      6: [{ set: 'MQ1', props: { gas: 0.9 } }],
    },
  },
  'smart-parking': {
    components: [
      esp32,
      part('IR1', 'ir', { vcc: 'BB1.c1', out: 'BB1.c2', gnd: 'BB1.c3' }, { detected: false }),
      part(
        'US1',
        'ultrasonic',
        { vcc: 'BB1.c6', trig: 'BB1.c7', echo: 'BB1.c8', gnd: 'BB1.c9' },
        { distance: 50 },
      ),
      part('R2', 'resistor', { a: 'BB1.d8', b: 'BB1.d12' }, { resistance: 1000 }),
      part('R3', 'resistor', { a: 'BB1.b12', b: 'BB1.b16' }, { resistance: 2000 }),
      part('SRV1', 'servo', { gnd: 'BB1.c19', vcc: 'BB1.c20', signal: 'BB1.c21' }),
      part('OLED1', 'oled', { gnd: 'BB1.c24', vcc: 'BB1.c25', scl: 'BB1.c26', sda: 'BB1.c27' }),
    ],
    wires: [
      ['ESP1.3v3', 'BB1.a1'],
      ['ESP1.d27', 'BB1.a2'],
      ['ESP1.gnd1', 'BB1.a3'],
      ['ESP1.vin', 'BB1.a6'],
      ['ESP1.d5', 'BB1.a7'],
      ['ESP1.gnd1', 'BB1.a9'],
      ['ESP1.d18', 'BB1.a12'],
      ['ESP1.gnd2', 'BB1.a16'],
      ['ESP1.gnd1', 'BB1.a19'],
      ['ESP1.vin', 'BB1.a20'],
      ['ESP1.d13', 'BB1.a21'],
      ['ESP1.gnd2', 'BB1.a24'],
      ['ESP1.3v3', 'BB1.a25'],
      ['ESP1.d22', 'BB1.a26'],
      ['ESP1.d21', 'BB1.a27'],
    ],
    actions: {
      4: [
        { set: 'IR1', props: { detected: true }, afterMs: 300 },
        { set: 'IR1', props: { detected: false }, afterMs: 400 },
      ],
      // The gate is still open from the first car for three seconds: the next one waits.
      5: [
        { set: 'US1', props: { distance: 10 } },
        { set: 'IR1', props: { detected: true }, afterMs: 3500 },
        { set: 'IR1', props: { detected: false }, afterMs: 500 },
      ],
    },
  },
  'obstacle-robot': {
    components: [
      esp32,
      { id: 'BAT1', type: 'battery', props: { voltage: 7.2 } },
      { id: 'DRV1', type: 'l298n', props: { enaJumper: true, enbJumper: true } },
      part('M1', 'motor', { a: 'BB1.c1', b: 'BB1.c4' }),
      part('M2', 'motor', { a: 'BB1.c7', b: 'BB1.c10' }),
      part(
        'US1',
        'ultrasonic',
        { vcc: 'BB1.c14', trig: 'BB1.c15', echo: 'BB1.c16', gnd: 'BB1.c17' },
        { distance: 50 },
      ),
      part('R2', 'resistor', { a: 'BB1.d16', b: 'BB1.d20' }, { resistance: 1000 }),
      part('R3', 'resistor', { a: 'BB1.b20', b: 'BB1.b24' }, { resistance: 2000 }),
    ],
    wires: [
      ['BAT1.pos', 'DRV1.vs'],
      ['BAT1.neg', 'DRV1.gnd'],
      ['ESP1.gnd1', 'DRV1.gnd'],
      ['DRV1.out1', 'BB1.a1'],
      ['DRV1.out2', 'BB1.a4'],
      ['DRV1.out3', 'BB1.a7'],
      ['DRV1.out4', 'BB1.a10'],
      ['ESP1.d26', 'DRV1.in1'],
      ['ESP1.d27', 'DRV1.in2'],
      ['ESP1.d32', 'DRV1.in3'],
      ['ESP1.d33', 'DRV1.in4'],
      ['ESP1.vin', 'BB1.a14'],
      ['ESP1.d5', 'BB1.a15'],
      ['ESP1.gnd1', 'BB1.a17'],
      ['ESP1.d18', 'BB1.a20'],
      ['ESP1.gnd2', 'BB1.a24'],
    ],
    actions: { 6: [{ set: 'US1', props: { distance: 10 } }] },
  },
  'water-quality': {
    components: [
      esp32,
      part('TDS1', 'tds', { out: 'BB1.c1', vcc: 'BB1.c2', gnd: 'BB1.c3' }, { ppm: 150 }),
      part('TU1', 'turbidity', { out: 'BB1.c6', vcc: 'BB1.c7', gnd: 'BB1.c8' }, { ntu: 10 }),
      part('R2', 'resistor', { a: 'BB1.d6', b: 'BB1.d10' }, { resistance: 10_000 }),
      part('R3', 'resistor', { a: 'BB1.b10', b: 'BB1.b14' }, { resistance: 10_000 }),
      ...lamp,
    ],
    wires: [
      ['ESP1.d35', 'BB1.a1'],
      ['ESP1.3v3', 'BB1.a2'],
      ['ESP1.gnd1', 'BB1.a3'],
      ['ESP1.vin', 'BB1.a7'],
      ['ESP1.gnd1', 'BB1.a8'],
      ['ESP1.d34', 'BB1.a10'],
      ['ESP1.gnd1', 'BB1.a14'],
      ...lampWires,
    ],
    actions: {
      5: [{ set: 'TDS1', props: { ppm: 600 } }],
      6: [
        { set: 'TDS1', props: { ppm: 150 } },
        { set: 'TU1', props: { ntu: 2500 } },
      ],
    },
  },
  'measuring-power': {
    components: [
      esp32,
      { id: 'BAT1', type: 'battery', props: { voltage: 7.2 } },
      part('VS1', 'voltagesensor', { vin: 'BB1.c1', gnd: 'BB1.c2', s: 'BB1.c3' }),
      part(
        'CS1',
        'acs712',
        { ip1: 'BB1.c5', ip2: 'BB1.c6', vcc: 'BB1.c8', out: 'BB1.c9', gnd: 'BB1.c10' },
        { range: '5A' },
      ),
      part('S1', 'switch', { a: 'BB1.c13', b: 'BB1.c15' }, { closed: false }),
      part('M1', 'motor', { a: 'BB1.c18', b: 'BB1.c21' }),
    ],
    wires: [
      ['BAT1.pos', 'BB1.a1'],
      ['BAT1.neg', 'BB1.a2'],
      ['ESP1.gnd1', 'BB1.b2'],
      ['ESP1.d35', 'BB1.a3'],
      ['BAT1.pos', 'BB1.a5'],
      ['BB1.a6', 'BB1.a13'],
      ['BB1.a15', 'BB1.a18'],
      ['BB1.a21', 'BAT1.neg'],
      ['ESP1.vin', 'BB1.a8'],
      ['ESP1.d34', 'BB1.a9'],
      ['ESP1.gnd2', 'BB1.a10'],
    ],
    actions: { 5: [{ set: 'S1', props: { closed: true } }] },
  },
  'step-down': {
    components: [
      esp32,
      { id: 'BAT1', type: 'battery', props: { voltage: 9 } },
      part(
        'REG1',
        'lm2596',
        { inp: 'BB1.c1', inn: 'BB1.c2', outn: 'BB1.c6', outp: 'BB1.c7' },
        { volts: 5 },
      ),
      part('M1', 'motor', { a: 'BB1.c10', b: 'BB1.c13' }),
    ],
    wires: [
      ['BAT1.pos', 'BB1.a1'],
      ['BAT1.neg', 'BB1.a2'],
      ['BB1.a7', 'BB1.a10'],
      ['BB1.a13', 'BB1.b6'],
    ],
    actions: { 4: [{ set: 'REG1', props: { volts: 8.5 } }] },
  },
  'solar-charging': {
    components: [
      esp32,
      part('PV1', 'solar', { pos: 'BB1.a1', neg: 'BB1.a3' }, { light: 1 }),
      part('CHG1', 'tp4056', {
        inp: 'BB1.c5',
        inn: 'BB1.c6',
        bp: 'BB1.c8',
        bn: 'BB1.c9',
        outp: 'BB1.c11',
        outn: 'BB1.c12',
      }),
      part('CELL1', 'cell', { pos: 'BB1.c20', neg: 'BB1.c26' }, { charge: 0.5, capacity: 2600 }),
      ...lamp,
    ],
    wires: [
      ['BB1.b1', 'BB1.a5'],
      ['BB1.b3', 'BB1.a6'],
      ['BB1.a20', 'BB1.a8'],
      ['BB1.a26', 'BB1.a9'],
      ['BB1.a11', 'BB1.j20'],
      ['BB1.a12', 'BB1.j25'],
    ],
    actions: {
      3: [{ set: 'PV1', props: { light: 0.3 } }],
      4: [{ set: 'PV1', props: { light: 0 } }],
      5: [
        { set: 'PV1', props: { light: 1 } },
        { set: 'CELL1', props: { charge: 1 } },
      ],
    },
  },
  'weather-station': {
    components: [
      esp32,
      part(
        'BME1',
        'bme280',
        { vcc: 'BB1.c10', gnd: 'BB1.c11', scl: 'BB1.c12', sda: 'BB1.c13' },
        { celsius: 28, humidity: 70, hpa: 1010, address: 0x76 },
      ),
      ...lamp,
    ],
    wires: [
      ['ESP1.3v3', 'BB1.a10'],
      ['ESP1.gnd1', 'BB1.a11'],
      ['ESP1.d22', 'BB1.a12'],
      ['ESP1.d21', 'BB1.a13'],
      ...lampWires,
    ],
    actions: { 5: [{ set: 'BME1', props: { humidity: 88 } }] },
  },
  'current-monitor': {
    components: [
      esp32,
      { id: 'BAT1', type: 'battery', props: { voltage: 9 } },
      part('INA1', 'ina219', {
        vcc: 'BB1.c10',
        gnd: 'BB1.c11',
        scl: 'BB1.c12',
        sda: 'BB1.c13',
        vinm: 'BB1.c14',
        vinp: 'BB1.c15',
      }),
      part('M1', 'motor', { a: 'BB1.c20', b: 'BB1.c23' }),
    ],
    wires: [
      ['ESP1.3v3', 'BB1.a10'],
      ['ESP1.gnd1', 'BB1.a11'],
      ['ESP1.d22', 'BB1.a12'],
      ['ESP1.d21', 'BB1.a13'],
      ['BAT1.pos', 'BB1.a15'],
      ['BB1.a14', 'BB1.a20'],
      ['BB1.a23', 'BAT1.neg'],
      ['ESP1.gnd2', 'BB1.b23'],
    ],
    actions: { 5: [{ set: 'BAT1', props: { voltage: 6 } }] },
  },
  'temperature-probe': {
    components: [
      esp32,
      part('TP1', 'ds18b20', { gnd: 'BB1.c10', dq: 'BB1.c11', vdd: 'BB1.c12' }, { celsius: 25 }),
      part('R2', 'resistor', { a: 'BB1.d11', b: 'BB1.d15' }, { resistance: 4700 }),
      ...lamp,
    ],
    wires: [
      ['ESP1.gnd1', 'BB1.a10'],
      ['ESP1.d4', 'BB1.a11'],
      ['ESP1.3v3', 'BB1.a12'],
      ['BB1.b12', 'BB1.b15'],
      ...lampWires,
    ],
    actions: { 5: [{ set: 'TP1', props: { celsius: 45 } }] },
  },
  'tank-level': {
    components: [
      esp32,
      part(
        'US1',
        'jsnsr04t',
        { vcc: 'BB1.c10', trig: 'BB1.c11', echo: 'BB1.c12', gnd: 'BB1.c13' },
        { distance: 100 },
      ),
      part('R2', 'resistor', { a: 'BB1.d12', b: 'BB1.d16' }, { resistance: 1000 }),
      part('R3', 'resistor', { a: 'BB1.b16', b: 'BB1.b20' }, { resistance: 2000 }),
    ],
    wires: [
      ['ESP1.vin', 'BB1.a10'],
      ['ESP1.d5', 'BB1.a11'],
      ['ESP1.gnd1', 'BB1.a13'],
      ['ESP1.d18', 'BB1.a16'],
      ['ESP1.gnd2', 'BB1.a20'],
    ],
    actions: { 4: [{ set: 'US1', props: { distance: 15 } }] },
  },
  'gps-location': {
    components: [
      esp32,
      part(
        'GPS1',
        'gps',
        { vcc: 'BB1.c10', rx: 'BB1.c11', tx: 'BB1.c12', gnd: 'BB1.c13' },
        { fix: true, lat: 23.7465, lng: 90.3763, satellites: 8 },
      ),
    ],
    wires: [
      ['ESP1.3v3', 'BB1.a10'],
      ['ESP1.tx2', 'BB1.a11'],
      ['ESP1.rx2', 'BB1.a12'],
      ['ESP1.gnd1', 'BB1.a13'],
    ],
    actions: { 4: [{ set: 'GPS1', props: { fix: false } }] },
  },
  'dust-sensor': {
    components: [
      esp32,
      part(
        'PM1',
        'pms5003',
        { vcc: 'BB1.c10', gnd: 'BB1.c11', rx: 'BB1.c12', tx: 'BB1.c13' },
        { pm25: 35 },
      ),
      ...lamp,
    ],
    wires: [
      ['ESP1.vin', 'BB1.a10'],
      ['ESP1.gnd1', 'BB1.a11'],
      ['ESP1.tx2', 'BB1.a12'],
      ['ESP1.rx2', 'BB1.a13'],
      ...lampWires,
    ],
    actions: { 5: [{ set: 'PM1', props: { pm25: 90 } }] },
  },
  'bluetooth-light': {
    components: [
      esp32,
      part(
        'BT1',
        'bluetooth',
        { vcc: 'BB1.c10', gnd: 'BB1.c11', tx: 'BB1.c12', rx: 'BB1.c13' },
        { paired: true },
      ),
      ...lamp,
    ],
    wires: [
      ['ESP1.vin', 'BB1.a10'],
      ['ESP1.gnd1', 'BB1.a11'],
      ['ESP1.rx2', 'BB1.a12'],
      ['ESP1.tx2', 'BB1.a13'],
      ...lampWires,
    ],
    actions: {
      4: [{ phone: 'BT1', text: '1', afterMs: 500 }],
      5: [
        { phone: 'BT1', text: '0' },
        { set: 'BT1', props: { paired: false }, afterMs: 1000 },
      ],
    },
  },
  'mp3-player': {
    components: [
      esp32,
      part(
        'MP1',
        'mp3',
        { vcc: 'BB1.c10', rx: 'BB1.c11', tx: 'BB1.c12', gnd: 'BB1.c13' },
        { tracks: 5 },
      ),
      part('SW1', 'button', { a: 'BB1.e20', b: 'BB1.e22' }),
    ],
    wires: [
      ['ESP1.vin', 'BB1.a10'],
      ['ESP1.tx2', 'BB1.a11'],
      ['ESP1.rx2', 'BB1.a12'],
      ['ESP1.gnd1', 'BB1.a13'],
      ['ESP1.d4', 'BB1.a20'],
      ['ESP1.gnd2', 'BB1.a22'],
    ],
    actions: { 5: [{ press: 'SW1' }, { release: 'SW1', afterMs: 300 }] },
  },
  'sms-light': {
    components: [
      esp32,
      part(
        'GSM1',
        'gsm',
        { vcc: 'BB1.c10', rx: 'BB1.c11', tx: 'BB1.c12', gnd: 'BB1.c13' },
        { signal: 20 },
      ),
      part('CELL1', 'cell', { pos: 'BB1.c3', neg: 'BB1.c5' }, { charge: 0.5, capacity: 2600 }),
      ...lamp,
    ],
    wires: [
      ['BB1.a3', 'BB1.a10'],
      ['BB1.a5', 'BB1.a13'],
      ['ESP1.gnd1', 'BB1.b13'],
      ['ESP1.tx2', 'BB1.a11'],
      ['ESP1.rx2', 'BB1.a12'],
      ...lampWires,
    ],
    actions: { 5: [{ phone: 'GSM1', text: 'ON' }] },
  },
  'led-ring': {
    components: [
      esp32,
      part(
        'RING1',
        'ledring',
        { vcc: 'BB1.c10', gnd: 'BB1.c11', din: 'BB1.c12', dout: 'BB1.c13' },
        { leds: 12 },
      ),
      part(
        'POT1',
        'potentiometer',
        { a: 'BB1.c20', wiper: 'BB1.c21', b: 'BB1.c22' },
        { resistance: 10_000, position: 0 },
      ),
    ],
    wires: [
      ['ESP1.vin', 'BB1.a10'],
      ['ESP1.gnd1', 'BB1.a11'],
      ['ESP1.d4', 'BB1.a12'],
      ['ESP1.gnd2', 'BB1.a20'],
      ['ESP1.d34', 'BB1.a21'],
      ['ESP1.3v3', 'BB1.a22'],
    ],
    actions: {
      4: [{ set: 'POT1', props: { position: 1 }, afterMs: 300 }],
      5: [{ set: 'POT1', props: { position: 0.5 } }],
    },
  },
  'lora-radio': {
    components: [
      esp32,
      { id: 'ESP2', type: 'esp32', props: {} },
      part('LORA1', 'lora', Object.fromEntries(LORA_LEGS.map((leg, i) => [leg, `BB1.c${1 + i}`])), {
        km: 0,
      }),
      part(
        'LORA2',
        'lora',
        Object.fromEntries(LORA_LEGS.map((leg, i) => [leg, `BB1.c${11 + i}`])),
        { km: 0.5 },
      ),
    ],
    wires: [
      ...LORA_PINS.map((pin, i): [string, string] => [`ESP1.${pin}`, `BB1.a${1 + i}`]),
      ...LORA_PINS.map((pin, i): [string, string] => [`ESP2.${pin}`, `BB1.a${11 + i}`]),
    ],
    // The second radio moved 3 km along the road.
    actions: { 6: [{ set: 'LORA2', props: { km: 3 } }] },
  },
  'colour-display': {
    components: [
      esp32,
      part(
        'TFT1',
        'tft',
        {
          gnd: 'BB1.c10',
          vcc: 'BB1.c11',
          scl: 'BB1.c12',
          sda: 'BB1.c13',
          res: 'BB1.c14',
          dc: 'BB1.c15',
          cs: 'BB1.c16',
          blk: 'BB1.c17',
        },
        {},
      ),
    ],
    wires: [
      ['ESP1.gnd1', 'BB1.a10'],
      ['ESP1.3v3', 'BB1.a11'],
      ['ESP1.d18', 'BB1.a12'],
      ['ESP1.d23', 'BB1.a13'],
      ['ESP1.d4', 'BB1.a14'],
      ['ESP1.d2', 'BB1.a15'],
      ['ESP1.d5', 'BB1.a16'],
    ],
    actions: {
      // BLK joined to GND.
      5: [
        {
          edit: (circuit) => ({
            ...circuit,
            wires: [
              ...circuit.wires,
              { id: 'W9', from: 'ESP1.gnd2', to: 'BB1.a17', color: '#000000' },
            ],
          }),
        },
      ],
    },
  },
};

/** The longest a student would have to watch for a step to complete, in simulated time. */
const STEP_LIMIT_MS = 9000;
const FRAME_MS = 50;

function walk(lesson: Lesson, walkthrough: Walkthrough) {
  let circuit: CircuitDocument = {
    schemaVersion: CIRCUIT_SCHEMA_VERSION,
    components: walkthrough.components,
    wires: walkthrough.wires.map(([from, to], i): Wire => ({
      id: `W${i + 1}`,
      from,
      to,
      color: '#000000',
    })),
  };
  let pressed: string[] = [];
  let session: SimulationSession | null = null;
  let uploadedStarter: string | null = null;
  /** The second board's program and what it printed, in a lesson with two boards. */
  let uploadedStarter2: string | null = null;
  let serial = '';
  let serial2 = '';
  let result: LessonWorld['result'] = null;
  // The logic sheet, worked out over time as the sheet view does.
  let sheet: LogicSheet = emptySheet();
  let sheetState: SheetState | undefined;
  let sheetTime = 0;
  const running = () => session !== null;
  const load = (target: SimulationSession) => {
    if (uploadedStarter) target.loadFirmware('ESP1', starter(uploadedStarter));
    if (uploadedStarter2) target.loadFirmware('ESP2', starter(uploadedStarter2));
  };
  const start = () => {
    session = new SimulationSession(circuit, pressed);
    load(session);
  };
  const world = (): LessonWorld => ({
    circuit,
    result,
    running: running(),
    serial,
    uploadedStarter,
    boards: [
      { serial, uploadedStarter },
      { serial: serial2, uploadedStarter: uploadedStarter2 },
    ],
    sheet,
    sheetValues: sheetState ? sheetValues(sheet, sheetState) : [],
  });
  const timeline: string[] = [];

  lesson.steps.forEach((step, index) => {
    if (step.program === 2) {
      uploadedStarter2 = lesson.program2!;
      if (session) session.loadFirmware('ESP2', starter(uploadedStarter2));
    } else if (step.program) {
      uploadedStarter = lesson.program!;
      if (session) session.loadFirmware('ESP1', starter(uploadedStarter));
    }
    // The student switches the circuit on when a step asks for it. Built as the lesson
    // asks, nothing it has asked for so far is missing then: the lab's check on Run
    // (D-110) never warns about a circuit that is right.
    if (step.checks.some((check: Check) => check.kind === 'running') && !session) {
      const unmet = unmetWiring(lesson, index, circuit);
      if (unmet.length > 0) {
        throw new Error(
          `${lesson.id}, step ${index + 1}: Run would warn about ${JSON.stringify(unmet)}`,
        );
      }
      start();
    }
    const pending = [...(walkthrough.actions?.[index] ?? [])];
    let waited = 0;
    let since = 0;
    let seen: number[] = [];
    for (;;) {
      // Changes the student makes on this step, each after its wait.
      while (pending.length > 0 && since >= (pending[0]!.afterMs ?? 0)) {
        const action = pending.shift()!;
        if ('set' in action) {
          const changed = updateProps(circuit, action.set, action.props);
          if (!changed.ok) throw new Error(`${lesson.id}: ${changed.error}`);
          circuit = changed.circuit;
        } else if ('edit' in action) {
          circuit = action.edit(circuit);
        } else if ('sheet' in action) {
          sheet = action.sheet(sheet);
          since = 0;
          continue;
        } else if ('restart' in action) {
          const saved = (session as SimulationSession | null)?.savedSettings('ESP1') ?? '';
          session = new SimulationSession(circuit, pressed);
          (session as SimulationSession).setSettings('ESP1', saved);
          if (uploadedStarter)
            (session as SimulationSession).loadFirmware('ESP1', starter(uploadedStarter));
          serial = '';
          continue;
        } else if ('phone' in action) {
          (session as SimulationSession | null)?.phone(action.phone, action.text);
          since = 0;
          continue;
        } else if ('press' in action) {
          pressed = [...pressed, action.press];
        } else {
          pressed = pressed.filter((id) => id !== action.release);
        }
        (session as SimulationSession | null)?.update(circuit, pressed);
        since = 0;
      }
      if (lesson.sheet) {
        // Every clock change in this frame, so no edge is missed, then the frame's end.
        const end = sheetTime + FRAME_MS;
        for (let at = nextSheetClockChange(sheet, sheetTime); at <= end;) {
          sheetState = evaluateSheet(sheet, at, sheetState);
          at = nextSheetClockChange(sheet, at);
        }
        sheetTime = end;
        sheetState = evaluateSheet(sheet, sheetTime, sheetState);
      }
      if (session) {
        (session as SimulationSession).advance(FRAME_MS);
        const frame = (session as SimulationSession).frame();
        result = frame.result;
        serial += frame.boards.ESP1?.serial ?? '';
        serial2 += frame.boards.ESP2?.serial ?? '';
      }
      const status = checkStep(step, world(), seen);
      seen = status.seen;
      if (status.done && pending.length === 0) break;
      waited += FRAME_MS;
      since += FRAME_MS;
      if (waited > STEP_LIMIT_MS || (!session && !lesson.sheet && pending.length === 0)) {
        throw new Error(
          `${lesson.id}, step ${index + 1}: not done (checks ${JSON.stringify(status.checks)}); ` +
            `serial so far: ${JSON.stringify(serial.slice(-200))}; ` +
            `diagnostics: ${JSON.stringify(result?.diagnostics.map((d) => d.code))}`,
        );
      }
    }
    timeline.push(`${index + 1}@${waited}`);
  });
  return timeline;
}

describe('every lesson can be completed in the lab', () => {
  it('has a walkthrough for every lesson', () => {
    expect(Object.keys(WALKTHROUGHS).sort()).toEqual(LESSONS.map((lesson) => lesson.id).sort());
  });
  for (const lesson of LESSONS) {
    it(`${lesson.order}. ${lesson.id}`, () => {
      const walkthrough = WALKTHROUGHS[lesson.id];
      if (!walkthrough) throw new Error(`no walkthrough for ${lesson.id}`);
      expect(walk(lesson, walkthrough)).toHaveLength(lesson.steps.length);
    });
  }
});
