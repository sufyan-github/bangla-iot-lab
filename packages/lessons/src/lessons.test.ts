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
  | { edit: (circuit: CircuitDocument) => CircuitDocument; afterMs?: number };

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
