import { Type, type Static } from 'typebox';

/**
 * The format of a lesson. A lesson is data: text in both languages, and the
 * checks that tell when each step is done. The checks look at the student's
 * circuit, its program and what the simulation shows, never at how the
 * student got there, so any correct circuit passes.
 */
export const Text = Type.Object({
  bn: Type.String({ minLength: 1 }),
  en: Type.String({ minLength: 1 }),
});
export type Text = Static<typeof Text>;

/**
 * A place a wire can go, named the way a lesson talks about it:
 * - `{ board: 'd2' }`: a pin of the circuit's programmable board, by its id;
 *   `gnd` stands for any of the board's ground pins;
 * - `{ part: 'led', pin: 'anode' }`: that leg or terminal of any part of that type
 *   (`pin: '*'` is any of its legs, for parts that may be turned either way round);
 * - `{ battery: 'pos' }`: a battery's terminal.
 */
export const Place = Type.Union([
  Type.Object({ board: Type.String() }),
  Type.Object({ part: Type.String(), pin: Type.String() }),
  Type.Object({ battery: Type.Union([Type.Literal('pos'), Type.Literal('neg')]) }),
]);
export type Place = Static<typeof Place>;

/** What the student is shown for a check, when the lab's own wording would not say it well. */
const Labelled = { label: Type.Optional(Text) };

const Comparison = {
  equals: Type.Optional(Type.Union([Type.String(), Type.Number(), Type.Boolean()])),
  above: Type.Optional(Type.Number()),
  below: Type.Optional(Type.Number()),
};

/**
 * What a check asks. The first kinds are about the circuit as it is now; the
 * last kinds (`reading`, `serial`, `diagnostic`) are about something that
 * happened while it ran, and count once they have been seen.
 */
export const Check = Type.Union([
  /** A part of this type is in the circuit. */
  Type.Object({ kind: Type.Literal('part'), type: Type.String(), ...Labelled }),
  /**
   * Two places are joined: by wires and breadboard strips alone, or through
   * one resistor (`through: 'resistor'`), whose value may be limited.
   */
  Type.Object({
    kind: Type.Literal('connected'),
    from: Place,
    to: Place,
    through: Type.Optional(Type.Literal('resistor')),
    ohms: Type.Optional(Type.Tuple([Type.Number(), Type.Number()])),
    ...Labelled,
  }),
  /** A setting of a part of this type: a resistor's value, a sensor's slider. */
  Type.Object({
    kind: Type.Literal('prop'),
    part: Type.String(),
    prop: Type.String(),
    ...Comparison,
    ...Labelled,
  }),
  /** The board's uploaded program is this ready-made one, unchanged. */
  Type.Object({ kind: Type.Literal('program'), starter: Type.String(), ...Labelled }),
  /** The circuit is switched on. */
  Type.Object({ kind: Type.Literal('running'), ...Labelled }),
  /** Nothing in the circuit is being damaged or shorted right now. */
  Type.Object({ kind: Type.Literal('no-errors'), ...Labelled }),
  /**
   * Something a part showed while running: `path` is a field of its reading,
   * such as `led.state`, `activity`, `angle`, `current`, `voltage`, `oled.lit`.
   */
  Type.Object({
    kind: Type.Literal('reading'),
    part: Type.String(),
    path: Type.String(),
    ...Comparison,
    ...Labelled,
  }),
  /** The program printed text matching this pattern to the serial monitor. */
  Type.Object({
    kind: Type.Literal('serial'),
    matches: Type.String({ minLength: 1 }),
    ...Labelled,
  }),
  /** The lab gave this explanation (a lesson may lead a student into a mistake on purpose). */
  Type.Object({ kind: Type.Literal('diagnostic'), code: Type.String(), ...Labelled }),
]);
export type Check = Static<typeof Check>;

export const Step = Type.Object({
  text: Text,
  /** What must be true for the step to be done. A step with none is read and moved past. */
  checks: Type.Array(Check),
  /** True on the step where the student puts the lesson's program on the board. */
  program: Type.Optional(Type.Boolean()),
});
export type Step = Static<typeof Step>;

export const LessonSchema = Type.Object({
  id: Type.String({ pattern: '^[a-z0-9-]+$' }),
  /** Position in the list of lessons, from 1. */
  order: Type.Integer({ minimum: 1 }),
  /** The kit parts the lesson is about, by part definition id. */
  parts: Type.Array(Type.String(), { minItems: 1 }),
  title: Text,
  summary: Text,
  /** What the new project starts with: the board, and a battery of this voltage. */
  setup: Type.Object({
    board: Type.Literal('esp32'),
    battery: Type.Optional(Type.Number()),
  }),
  /** The ready-made ESP32 program the lesson uses, if any. */
  program: Type.Optional(Type.String()),
  steps: Type.Array(Step, { minItems: 2 }),
  /** What the student learned, said at the end. */
  learned: Type.Object({ bn: Type.Array(Type.String()), en: Type.Array(Type.String()) }),
  /** Something to try on one's own afterwards. */
  tryNext: Text,
});
export type Lesson = Static<typeof LessonSchema>;
