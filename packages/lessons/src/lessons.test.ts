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
  | { release: string; afterMs?: number }
  | { edit: (circuit: CircuitDocument) => CircuitDocument; afterMs?: number }
  /** The circuit is stopped and started again: the board keeps only what it saved. */
  | { restart: true; afterMs?: number };

const esp32: CircuitComponent = { id: 'ESP1', type: 'esp32', props: {} };
const part = (
  id: string,
  type: string,
  pins: Record<string, string>,
  props: Record<string, unknown> = {},
) => ({ id, type, pins, props }) as unknown as CircuitComponent;
/** The LED with its 220 Ω resistor on the lower half of the breadboard, from D2. */
const lamp = [
  part('R1', 'resistor', { a: 'f20', b: 'f24' }, { resistance: 220 }),
  part('LED1', 'led', { anode: 'g24', cathode: 'g25' }, { color: 'red' }),
];
const lampWires: [string, string][] = [
  ['ESP1.d2', 'j20'],
  ['ESP1.gnd2', 'j25'],
];

const WALKTHROUGHS: Record<string, Walkthrough> = {
  'esp32-blink': { components: [esp32, ...lamp], wires: lampWires },
  'led-resistor': {
    components: [esp32, ...lamp],
    wires: [
      ['ESP1.3v3', 'j20'],
      ['ESP1.gnd2', 'j25'],
    ],
    actions: {
      3: [{ set: 'R1', props: { resistance: 1000 } }],
      // The resistor taken out, and the LED's long leg wired straight to 3V3.
      4: [
        {
          edit: (circuit) => ({
            ...circuit,
            components: circuit.components.filter((c) => c.id !== 'R1'),
            wires: [...circuit.wires, { id: 'W9', from: 'ESP1.3v3', to: 'j24', color: '#000000' }],
          }),
        },
      ],
    },
  },
  'push-button': {
    components: [esp32, part('SW1', 'button', { a: 'e10', b: 'f10' }), ...lamp],
    wires: [['ESP1.d4', 'a10'], ['ESP1.gnd1', 'j10'], ...lampWires],
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
      part('RGB1', 'rgbled', { r: 'e10', g: 'e11', b: 'e12', gnd: 'e13' }),
      part('R1', 'resistor', { a: 'c6', b: 'c10' }, { resistance: 220 }),
      part('R2', 'resistor', { a: 'd7', b: 'd11' }, { resistance: 220 }),
      part('R3', 'resistor', { a: 'b8', b: 'b12' }, { resistance: 220 }),
    ],
    wires: [
      ['ESP1.d25', 'a6'],
      ['ESP1.d26', 'a7'],
      ['ESP1.d27', 'a8'],
      ['ESP1.gnd1', 'a13'],
    ],
  },
  dht11: {
    components: [
      esp32,
      part('DHT1', 'dht11', { vcc: 'c10', data: 'c11', gnd: 'c12' }, { celsius: 28, humidity: 70 }),
    ],
    wires: [
      ['ESP1.3v3', 'a10'],
      ['ESP1.d4', 'a11'],
      ['ESP1.gnd1', 'a12'],
    ],
    actions: { 3: [{ set: 'DHT1', props: { celsius: 35 } }] },
  },
  'ldr-module': {
    components: [
      esp32,
      part(
        'LDM1',
        'ldrmodule',
        { vcc: 'c10', gnd: 'c11', do: 'c12', ao: 'c13' },
        { light: 0.5, threshold: 0.5 },
      ),
      ...lamp,
    ],
    wires: [
      ['ESP1.3v3', 'a10'],
      ['ESP1.gnd1', 'a11'],
      ['ESP1.d27', 'a12'],
      ['ESP1.d34', 'a13'],
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
        { vcc: 'c10', gnd: 'c11', do: 'c12', ao: 'c13' },
        { wetness: 0, threshold: 0.5 },
      ),
      ...lamp,
    ],
    wires: [
      ['ESP1.3v3', 'a10'],
      ['ESP1.gnd1', 'a11'],
      ['ESP1.d27', 'a12'],
      ['ESP1.d34', 'a13'],
      ...lampWires,
    ],
    actions: { 4: [{ set: 'RAIN1', props: { wetness: 0.85 } }] },
  },
  'soil-moisture': {
    components: [
      esp32,
      part('SOIL1', 'soil', { vcc: 'c10', out: 'c11', gnd: 'c12' }, { moisture: 0.3 }),
      ...lamp,
    ],
    wires: [['ESP1.3v3', 'a10'], ['ESP1.d34', 'a11'], ['ESP1.gnd1', 'a12'], ...lampWires],
    actions: { 4: [{ set: 'SOIL1', props: { moisture: 0.05 } }] },
  },
  'mq135-gas': {
    components: [
      esp32,
      part(
        'MQ1',
        'mq135',
        { vcc: 'c10', gnd: 'c11', do: 'c12', ao: 'c13' },
        { gas: 0.1, threshold: 0.5 },
      ),
      part('R2', 'resistor', { a: 'd13', b: 'd17' }, { resistance: 10_000 }),
      part('R3', 'resistor', { a: 'b17', b: 'b21' }, { resistance: 10_000 }),
      ...lamp,
    ],
    wires: [
      ['ESP1.vin', 'a10'],
      ['ESP1.gnd1', 'a11'],
      ['ESP1.d34', 'a17'],
      ['ESP1.gnd1', 'a21'],
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
        { vcc: 'c10', trig: 'c11', echo: 'c12', gnd: 'c13' },
        { distance: 50 },
      ),
      part('R2', 'resistor', { a: 'd12', b: 'd16' }, { resistance: 1000 }),
      part('R3', 'resistor', { a: 'b16', b: 'b20' }, { resistance: 2000 }),
    ],
    wires: [
      ['ESP1.vin', 'a10'],
      ['ESP1.d5', 'a11'],
      ['ESP1.gnd1', 'a13'],
      ['ESP1.d18', 'a16'],
      ['ESP1.gnd2', 'a20'],
    ],
    actions: { 4: [{ set: 'US1', props: { distance: 100 } }] },
  },
  'pir-motion': {
    components: [
      esp32,
      part('PIR1', 'pir', { vcc: 'c10', out: 'c11', gnd: 'c12' }, { motion: false, hold: 3 }),
      ...lamp,
    ],
    wires: [['ESP1.vin', 'a10'], ['ESP1.d27', 'a11'], ['ESP1.gnd1', 'a12'], ...lampWires],
    actions: {
      3: [{ set: 'PIR1', props: { motion: true }, afterMs: 200 }],
      4: [{ set: 'PIR1', props: { motion: false } }],
    },
  },
  'ir-obstacle': {
    components: [
      esp32,
      part('IR1', 'ir', { vcc: 'c10', out: 'c11', gnd: 'c12' }, { detected: false }),
      ...lamp,
    ],
    wires: [['ESP1.3v3', 'a10'], ['ESP1.d27', 'a11'], ['ESP1.gnd1', 'a12'], ...lampWires],
    actions: {
      3: [
        { set: 'IR1', props: { detected: true }, afterMs: 200 },
        { set: 'IR1', props: { detected: false }, afterMs: 300 },
      ],
    },
  },
  buzzer: {
    components: [esp32, part('BZ1', 'buzzer', { pos: 'c10', neg: 'c12' })],
    wires: [
      ['ESP1.d25', 'a10'],
      ['ESP1.gnd1', 'a12'],
    ],
  },
  'oled-display': {
    components: [esp32, part('OLED1', 'oled', { gnd: 'c10', vcc: 'c11', scl: 'c12', sda: 'c13' })],
    wires: [
      ['ESP1.gnd1', 'a10'],
      ['ESP1.3v3', 'a11'],
      ['ESP1.d22', 'a12'],
      ['ESP1.d21', 'a13'],
    ],
  },
  servo: {
    components: [esp32, part('SRV1', 'servo', { gnd: 'c10', vcc: 'c11', signal: 'c12' })],
    wires: [
      ['ESP1.gnd1', 'a10'],
      ['ESP1.vin', 'a11'],
      ['ESP1.d13', 'a12'],
    ],
  },
  'motor-driver': {
    components: [
      esp32,
      { id: 'BAT1', type: 'battery', props: { voltage: 7.2 } },
      { id: 'DRV1', type: 'l298n', props: { enaJumper: false, enbJumper: true } },
      part('M1', 'motor', { a: 'c10', b: 'c13' }),
    ],
    wires: [
      ['BAT1.pos', 'DRV1.vs'],
      ['BAT1.neg', 'DRV1.gnd'],
      ['ESP1.gnd1', 'DRV1.gnd'],
      ['DRV1.out1', 'a10'],
      ['DRV1.out2', 'a13'],
      ['ESP1.d25', 'DRV1.ena'],
      ['ESP1.d26', 'DRV1.in1'],
      ['ESP1.d27', 'DRV1.in2'],
    ],
  },
  'saved-settings': {
    components: [esp32, part('SW1', 'button', { a: 'e10', b: 'f10' })],
    wires: [
      ['ESP1.d4', 'a10'],
      ['ESP1.gnd1', 'j10'],
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
        { vcc: 'c10', gnd: 'c11', in: 'c12', com: 'c14', no: 'c15', nc: 'c16' },
        { trigger: 'high' },
      ),
      part('R1', 'resistor', { a: 'b15', b: 'b19' }, { resistance: 220 }),
      part('LED1', 'led', { anode: 'd19', cathode: 'd20' }, { color: 'red' }),
    ],
    wires: [
      ['ESP1.vin', 'a10'],
      ['ESP1.gnd1', 'a11'],
      ['ESP1.d26', 'a12'],
      ['BAT1.pos', 'a14'],
      ['BAT1.neg', 'a20'],
    ],
  },
  'auto-watering': {
    components: [
      esp32,
      { id: 'BAT1', type: 'battery', props: { voltage: 6 } },
      part('SOIL1', 'soil', { vcc: 'c1', out: 'c2', gnd: 'c3' }, { moisture: 0.3 }),
      part(
        'RLY1',
        'relaymodule',
        { vcc: 'c10', gnd: 'c11', in: 'c12', com: 'c14', no: 'c15', nc: 'c16' },
        { trigger: 'high' },
      ),
      part('M1', 'motor', { a: 'c20', b: 'c23' }),
    ],
    wires: [
      ['ESP1.3v3', 'a1'],
      ['ESP1.d34', 'a2'],
      ['ESP1.gnd1', 'a3'],
      ['ESP1.vin', 'a10'],
      ['ESP1.gnd1', 'a11'],
      ['ESP1.d26', 'a12'],
      ['BAT1.pos', 'a14'],
      ['a15', 'a20'],
      ['BAT1.neg', 'a23'],
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
        { vcc: 'c1', gnd: 'c2', do: 'c3', ao: 'c4' },
        { light: 0.5, threshold: 0.5 },
      ),
      part('PIR1', 'pir', { vcc: 'c7', out: 'c8', gnd: 'c9' }, { motion: false, hold: 3 }),
      ...lamp,
    ],
    wires: [
      ['ESP1.3v3', 'a1'],
      ['ESP1.gnd1', 'a2'],
      ['ESP1.d27', 'a3'],
      ['ESP1.d34', 'a4'],
      ['ESP1.vin', 'a7'],
      ['ESP1.d26', 'a8'],
      ['ESP1.gnd1', 'a9'],
      ['ESP1.d25', 'j20'],
      ['ESP1.gnd2', 'j25'],
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
        { vcc: 'c1', gnd: 'c2', do: 'c3', ao: 'c4' },
        { wetness: 0, threshold: 0.5 },
      ),
      part('SRV1', 'servo', { gnd: 'c10', vcc: 'c11', signal: 'c12' }),
      part('BZ1', 'buzzer', { pos: 'c15', neg: 'c17' }),
    ],
    wires: [
      ['ESP1.3v3', 'a1'],
      ['ESP1.gnd1', 'a2'],
      ['ESP1.d27', 'a3'],
      ['ESP1.gnd1', 'a10'],
      ['ESP1.vin', 'a11'],
      ['ESP1.d13', 'a12'],
      ['ESP1.d25', 'a15'],
      ['ESP1.gnd2', 'a17'],
    ],
    actions: {
      5: [{ set: 'RAIN1', props: { wetness: 0.85 } }],
      6: [{ set: 'RAIN1', props: { wetness: 0 } }],
    },
  },
  'smart-dustbin': {
    components: [
      esp32,
      part('US1', 'ultrasonic', { vcc: 'c1', trig: 'c2', echo: 'c3', gnd: 'c4' }, { distance: 50 }),
      part('R2', 'resistor', { a: 'd3', b: 'd7' }, { resistance: 1000 }),
      part('R3', 'resistor', { a: 'b7', b: 'b11' }, { resistance: 2000 }),
      part('SRV1', 'servo', { gnd: 'c14', vcc: 'c15', signal: 'c16' }),
      part('BZ1', 'buzzer', { pos: 'c20', neg: 'c22' }),
    ],
    wires: [
      ['ESP1.vin', 'a1'],
      ['ESP1.d5', 'a2'],
      ['ESP1.gnd1', 'a4'],
      ['ESP1.d18', 'a7'],
      ['ESP1.gnd2', 'a11'],
      ['ESP1.gnd1', 'a14'],
      ['ESP1.vin', 'a15'],
      ['ESP1.d13', 'a16'],
      ['ESP1.d25', 'a20'],
      ['ESP1.gnd2', 'a22'],
    ],
    actions: { 5: [{ set: 'US1', props: { distance: 10 } }] },
  },
  'security-alarm': {
    components: [
      esp32,
      part('PIR1', 'pir', { vcc: 'c1', out: 'c2', gnd: 'c3' }, { motion: false, hold: 3 }),
      part('SW1', 'button', { a: 'e6', b: 'f6' }),
      part('BZ1', 'buzzer', { pos: 'c10', neg: 'c12' }),
      part('OLED1', 'oled', { gnd: 'c15', vcc: 'c16', scl: 'c17', sda: 'c18' }),
      ...lamp,
    ],
    wires: [
      ['ESP1.vin', 'a1'],
      ['ESP1.d27', 'a2'],
      ['ESP1.gnd1', 'a3'],
      ['ESP1.d4', 'a6'],
      ['ESP1.gnd1', 'j6'],
      ['ESP1.d25', 'a10'],
      ['ESP1.gnd1', 'a12'],
      ['ESP1.gnd2', 'a15'],
      ['ESP1.3v3', 'a16'],
      ['ESP1.d22', 'a17'],
      ['ESP1.d21', 'a18'],
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
      part('SOIL1', 'soil', { vcc: 'c1', out: 'c2', gnd: 'c3' }, { moisture: 0.3 }),
      part('DHT1', 'dht11', { vcc: 'c6', data: 'c7', gnd: 'c8' }, { celsius: 28, humidity: 70 }),
      part('OLED1', 'oled', { gnd: 'c11', vcc: 'c12', scl: 'c13', sda: 'c14' }),
      part('R1', 'resistor', { a: 'c16', b: 'c20' }, { resistance: 220 }),
      part('R2', 'resistor', { a: 'd17', b: 'd21' }, { resistance: 220 }),
      part('R3', 'resistor', { a: 'b18', b: 'b22' }, { resistance: 220 }),
      part('RGB1', 'rgbled', { r: 'e20', g: 'e21', b: 'e22', gnd: 'e23' }),
    ],
    wires: [
      ['ESP1.3v3', 'a1'],
      ['ESP1.d34', 'a2'],
      ['ESP1.gnd1', 'a3'],
      ['ESP1.3v3', 'a6'],
      ['ESP1.d4', 'a7'],
      ['ESP1.gnd1', 'a8'],
      ['ESP1.gnd2', 'a11'],
      ['ESP1.3v3', 'a12'],
      ['ESP1.d22', 'a13'],
      ['ESP1.d21', 'a14'],
      ['ESP1.d25', 'a16'],
      ['ESP1.d26', 'a17'],
      ['ESP1.d27', 'a18'],
      ['ESP1.gnd2', 'a23'],
    ],
    actions: { 5: [{ set: 'SOIL1', props: { moisture: 0.05 } }] },
  },
  'air-quality': {
    components: [
      esp32,
      part(
        'MQ1',
        'mq135',
        { vcc: 'c1', gnd: 'c2', do: 'c3', ao: 'c4' },
        { gas: 0.1, threshold: 0.5 },
      ),
      part('R2', 'resistor', { a: 'd4', b: 'd8' }, { resistance: 10_000 }),
      part('R3', 'resistor', { a: 'b8', b: 'b12' }, { resistance: 10_000 }),
      part('OLED1', 'oled', { gnd: 'c14', vcc: 'c15', scl: 'c16', sda: 'c17' }),
      part('BZ1', 'buzzer', { pos: 'c25', neg: 'c27' }),
      part('R4', 'resistor', { a: 'f16', b: 'f20' }, { resistance: 220 }),
      part('R5', 'resistor', { a: 'h17', b: 'h21' }, { resistance: 220 }),
      part('R6', 'resistor', { a: 'i18', b: 'i22' }, { resistance: 220 }),
      part('RGB1', 'rgbled', { r: 'g20', g: 'g21', b: 'g22', gnd: 'g23' }),
    ],
    wires: [
      ['ESP1.vin', 'a1'],
      ['ESP1.gnd1', 'a2'],
      ['ESP1.d34', 'a8'],
      ['ESP1.gnd1', 'a12'],
      ['ESP1.gnd2', 'a14'],
      ['ESP1.3v3', 'a15'],
      ['ESP1.d22', 'a16'],
      ['ESP1.d21', 'a17'],
      ['ESP1.d32', 'a25'],
      ['ESP1.gnd2', 'a27'],
      ['ESP1.d25', 'j16'],
      ['ESP1.d26', 'j17'],
      ['ESP1.d27', 'j18'],
      ['ESP1.gnd2', 'j23'],
    ],
    actions: {
      5: [{ set: 'MQ1', props: { gas: 0.5 } }],
      6: [{ set: 'MQ1', props: { gas: 0.9 } }],
    },
  },
  'smart-parking': {
    components: [
      esp32,
      part('IR1', 'ir', { vcc: 'c1', out: 'c2', gnd: 'c3' }, { detected: false }),
      part('US1', 'ultrasonic', { vcc: 'c6', trig: 'c7', echo: 'c8', gnd: 'c9' }, { distance: 50 }),
      part('R2', 'resistor', { a: 'd8', b: 'd12' }, { resistance: 1000 }),
      part('R3', 'resistor', { a: 'b12', b: 'b16' }, { resistance: 2000 }),
      part('SRV1', 'servo', { gnd: 'c19', vcc: 'c20', signal: 'c21' }),
      part('OLED1', 'oled', { gnd: 'c24', vcc: 'c25', scl: 'c26', sda: 'c27' }),
    ],
    wires: [
      ['ESP1.3v3', 'a1'],
      ['ESP1.d27', 'a2'],
      ['ESP1.gnd1', 'a3'],
      ['ESP1.vin', 'a6'],
      ['ESP1.d5', 'a7'],
      ['ESP1.gnd1', 'a9'],
      ['ESP1.d18', 'a12'],
      ['ESP1.gnd2', 'a16'],
      ['ESP1.gnd1', 'a19'],
      ['ESP1.vin', 'a20'],
      ['ESP1.d13', 'a21'],
      ['ESP1.gnd2', 'a24'],
      ['ESP1.3v3', 'a25'],
      ['ESP1.d22', 'a26'],
      ['ESP1.d21', 'a27'],
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
      part('M1', 'motor', { a: 'c1', b: 'c4' }),
      part('M2', 'motor', { a: 'c7', b: 'c10' }),
      part(
        'US1',
        'ultrasonic',
        { vcc: 'c14', trig: 'c15', echo: 'c16', gnd: 'c17' },
        { distance: 50 },
      ),
      part('R2', 'resistor', { a: 'd16', b: 'd20' }, { resistance: 1000 }),
      part('R3', 'resistor', { a: 'b20', b: 'b24' }, { resistance: 2000 }),
    ],
    wires: [
      ['BAT1.pos', 'DRV1.vs'],
      ['BAT1.neg', 'DRV1.gnd'],
      ['ESP1.gnd1', 'DRV1.gnd'],
      ['DRV1.out1', 'a1'],
      ['DRV1.out2', 'a4'],
      ['DRV1.out3', 'a7'],
      ['DRV1.out4', 'a10'],
      ['ESP1.d26', 'DRV1.in1'],
      ['ESP1.d27', 'DRV1.in2'],
      ['ESP1.d32', 'DRV1.in3'],
      ['ESP1.d33', 'DRV1.in4'],
      ['ESP1.vin', 'a14'],
      ['ESP1.d5', 'a15'],
      ['ESP1.gnd1', 'a17'],
      ['ESP1.d18', 'a20'],
      ['ESP1.gnd2', 'a24'],
    ],
    actions: { 6: [{ set: 'US1', props: { distance: 10 } }] },
  },
  'water-quality': {
    components: [
      esp32,
      part('TDS1', 'tds', { out: 'c1', vcc: 'c2', gnd: 'c3' }, { ppm: 150 }),
      part('TU1', 'turbidity', { out: 'c6', vcc: 'c7', gnd: 'c8' }, { ntu: 10 }),
      part('R2', 'resistor', { a: 'd6', b: 'd10' }, { resistance: 10_000 }),
      part('R3', 'resistor', { a: 'b10', b: 'b14' }, { resistance: 10_000 }),
      ...lamp,
    ],
    wires: [
      ['ESP1.d35', 'a1'],
      ['ESP1.3v3', 'a2'],
      ['ESP1.gnd1', 'a3'],
      ['ESP1.vin', 'a7'],
      ['ESP1.gnd1', 'a8'],
      ['ESP1.d34', 'a10'],
      ['ESP1.gnd1', 'a14'],
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
      part('VS1', 'voltagesensor', { vin: 'c1', gnd: 'c2', s: 'c3' }),
      part(
        'CS1',
        'acs712',
        { ip1: 'c5', ip2: 'c6', vcc: 'c8', out: 'c9', gnd: 'c10' },
        { range: '5A' },
      ),
      part('S1', 'switch', { a: 'c13', b: 'c15' }, { closed: false }),
      part('M1', 'motor', { a: 'c18', b: 'c21' }),
    ],
    wires: [
      ['BAT1.pos', 'a1'],
      ['BAT1.neg', 'a2'],
      ['ESP1.gnd1', 'b2'],
      ['ESP1.d35', 'a3'],
      ['BAT1.pos', 'a5'],
      ['a6', 'a13'],
      ['a15', 'a18'],
      ['a21', 'BAT1.neg'],
      ['ESP1.vin', 'a8'],
      ['ESP1.d34', 'a9'],
      ['ESP1.gnd2', 'a10'],
    ],
    actions: { 5: [{ set: 'S1', props: { closed: true } }] },
  },
  'step-down': {
    components: [
      esp32,
      { id: 'BAT1', type: 'battery', props: { voltage: 9 } },
      part('REG1', 'lm2596', { inp: 'c1', inn: 'c2', outn: 'c6', outp: 'c7' }, { volts: 5 }),
      part('M1', 'motor', { a: 'c10', b: 'c13' }),
    ],
    wires: [
      ['BAT1.pos', 'a1'],
      ['BAT1.neg', 'a2'],
      ['a7', 'a10'],
      ['a13', 'b6'],
    ],
    actions: { 4: [{ set: 'REG1', props: { volts: 8.5 } }] },
  },
  'solar-charging': {
    components: [
      esp32,
      part('PV1', 'solar', { pos: 'a1', neg: 'a3' }, { light: 1 }),
      part('CHG1', 'tp4056', {
        inp: 'c5',
        inn: 'c6',
        bp: 'c8',
        bn: 'c9',
        outp: 'c11',
        outn: 'c12',
      }),
      part('CELL1', 'cell', { pos: 'c20', neg: 'c26' }, { charge: 0.5, capacity: 2600 }),
      ...lamp,
    ],
    wires: [
      ['b1', 'a5'],
      ['b3', 'a6'],
      ['a20', 'a8'],
      ['a26', 'a9'],
      ['a11', 'j20'],
      ['a12', 'j25'],
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
        { vcc: 'c10', gnd: 'c11', scl: 'c12', sda: 'c13' },
        { celsius: 28, humidity: 70, hpa: 1010, address: 0x76 },
      ),
      ...lamp,
    ],
    wires: [
      ['ESP1.3v3', 'a10'],
      ['ESP1.gnd1', 'a11'],
      ['ESP1.d22', 'a12'],
      ['ESP1.d21', 'a13'],
      ...lampWires,
    ],
    actions: { 5: [{ set: 'BME1', props: { humidity: 88 } }] },
  },
  'current-monitor': {
    components: [
      esp32,
      { id: 'BAT1', type: 'battery', props: { voltage: 9 } },
      part('INA1', 'ina219', {
        vcc: 'c10',
        gnd: 'c11',
        scl: 'c12',
        sda: 'c13',
        vinm: 'c14',
        vinp: 'c15',
      }),
      part('M1', 'motor', { a: 'c20', b: 'c23' }),
    ],
    wires: [
      ['ESP1.3v3', 'a10'],
      ['ESP1.gnd1', 'a11'],
      ['ESP1.d22', 'a12'],
      ['ESP1.d21', 'a13'],
      ['BAT1.pos', 'a15'],
      ['a14', 'a20'],
      ['a23', 'BAT1.neg'],
      ['ESP1.gnd2', 'b23'],
    ],
    actions: { 5: [{ set: 'BAT1', props: { voltage: 6 } }] },
  },
  'temperature-probe': {
    components: [
      esp32,
      part('TP1', 'ds18b20', { gnd: 'c10', dq: 'c11', vdd: 'c12' }, { celsius: 25 }),
      part('R2', 'resistor', { a: 'd11', b: 'd15' }, { resistance: 4700 }),
      ...lamp,
    ],
    wires: [
      ['ESP1.gnd1', 'a10'],
      ['ESP1.d4', 'a11'],
      ['ESP1.3v3', 'a12'],
      ['b12', 'b15'],
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
        { vcc: 'c10', trig: 'c11', echo: 'c12', gnd: 'c13' },
        { distance: 100 },
      ),
      part('R2', 'resistor', { a: 'd12', b: 'd16' }, { resistance: 1000 }),
      part('R3', 'resistor', { a: 'b16', b: 'b20' }, { resistance: 2000 }),
    ],
    wires: [
      ['ESP1.vin', 'a10'],
      ['ESP1.d5', 'a11'],
      ['ESP1.gnd1', 'a13'],
      ['ESP1.d18', 'a16'],
      ['ESP1.gnd2', 'a20'],
    ],
    actions: { 4: [{ set: 'US1', props: { distance: 15 } }] },
  },
  'gps-location': {
    components: [
      esp32,
      part(
        'GPS1',
        'gps',
        { vcc: 'c10', rx: 'c11', tx: 'c12', gnd: 'c13' },
        { fix: true, lat: 23.7465, lng: 90.3763, satellites: 8 },
      ),
    ],
    wires: [
      ['ESP1.3v3', 'a10'],
      ['ESP1.tx2', 'a11'],
      ['ESP1.rx2', 'a12'],
      ['ESP1.gnd1', 'a13'],
    ],
    actions: { 4: [{ set: 'GPS1', props: { fix: false } }] },
  },
  'dust-sensor': {
    components: [
      esp32,
      part('PM1', 'pms5003', { vcc: 'c10', gnd: 'c11', rx: 'c12', tx: 'c13' }, { pm25: 35 }),
      ...lamp,
    ],
    wires: [
      ['ESP1.vin', 'a10'],
      ['ESP1.gnd1', 'a11'],
      ['ESP1.tx2', 'a12'],
      ['ESP1.rx2', 'a13'],
      ...lampWires,
    ],
    actions: { 5: [{ set: 'PM1', props: { pm25: 90 } }] },
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
  let serial = '';
  let result: LessonWorld['result'] = null;
  const running = () => session !== null;
  const start = () => {
    session = new SimulationSession(circuit, pressed);
    if (uploadedStarter) session.loadFirmware('ESP1', starter(uploadedStarter));
  };
  const world = (): LessonWorld => ({
    circuit,
    result,
    running: running(),
    serial,
    uploadedStarter,
  });
  const timeline: string[] = [];

  lesson.steps.forEach((step, index) => {
    if (step.program) {
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
