import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { PART_SHAPES } from '@banglalab/shared';
import {
  CIRCUIT_SCHEMA_VERSION,
  updateProps,
  type CircuitComponent,
  type CircuitDocument,
  type Wire,
} from '@banglalab/shared';
import { SimulationSession } from '@banglalab/simulation';
import { describe, expect, it } from 'vitest';
import { LESSONS, lessonProblems } from './index';
import { checkStep, type LessonWorld } from './checks';
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
  | { restart: true; afterMs?: number };

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

const WALKTHROUGHS: Record<string, Walkthrough> = {
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
    components: [esp32, part('BZ1', 'buzzer', { pos: 'BB1.c10', neg: 'BB1.c12' })],
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
      part('BZ1', 'buzzer', { pos: 'BB1.c15', neg: 'BB1.c17' }),
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
      part('BZ1', 'buzzer', { pos: 'BB1.c20', neg: 'BB1.c22' }),
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
      part('BZ1', 'buzzer', { pos: 'BB1.c10', neg: 'BB1.c12' }),
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
      part('BZ1', 'buzzer', { pos: 'BB1.c25', neg: 'BB1.c27' }),
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
    // The student switches the circuit on when a step asks for it.
    if (step.checks.some((check: Check) => check.kind === 'running') && !session) start();
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
      if (waited > STEP_LIMIT_MS || (!session && pending.length === 0)) {
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
