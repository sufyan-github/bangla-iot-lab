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
 *   `gnd` stands for any of the board's ground pins. In a lesson with two
 *   boards, `unit: 2` is a pin of the second;
 * - `{ part: 'led', pin: 'anode' }`: that leg or terminal of any part of that type
 *   (`pin: '*'` is any of its legs, for parts that may be turned either way round);
 * - `{ battery: 'pos' }`: a battery's terminal.
 */
export const Place = Type.Union([
  Type.Object({ board: Type.String(), unit: Type.Optional(Type.Literal(2)) }),
  Type.Object({ part: Type.String(), pin: Type.String() }),
  Type.Object({ battery: Type.Union([Type.Literal('pos'), Type.Literal('neg')]) }),
]);
export type Place = Static<typeof Place>;

/** True when every part of the type must pass, not just one of them (both motors of a robot). */
const Every = { every: Type.Optional(Type.Boolean()) };

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
    ...Every,
    ...Labelled,
  }),
  /** The board's uploaded program is this ready-made one, unchanged. */
  Type.Object({
    kind: Type.Literal('program'),
    starter: Type.String(),
    /** The second board, in a lesson with two. */
    unit: Type.Optional(Type.Literal(2)),
    ...Labelled,
  }),
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
    ...Every,
    ...Labelled,
  }),
  /** The program printed text matching this pattern to the serial monitor. */
  Type.Object({
    kind: Type.Literal('serial'),
    matches: Type.String({ minLength: 1 }),
    /** The second board's serial monitor, in a lesson with two. */
    unit: Type.Optional(Type.Literal(2)),
    ...Labelled,
  }),
  /** The lab gave this explanation (a lesson may lead a student into a mistake on purpose). */
  Type.Object({ kind: Type.Literal('diagnostic'), code: Type.String(), ...Labelled }),
  /** On the logic sheet: at least `count` (1 if not said) elements of this kind ("XOR", "input"). */
  Type.Object({
    kind: Type.Literal('sheet-part'),
    type: Type.String(),
    count: Type.Optional(Type.Integer({ minimum: 1 })),
    ...Labelled,
  }),
  /**
   * On the logic sheet: a wire from a port of an element of one kind to a
   * port of an element of another ("XOR" "y" to "output" "a").
   */
  Type.Object({
    kind: Type.Literal('sheet-wired'),
    from: Type.Object({ type: Type.String(), port: Type.String() }),
    to: Type.Object({ type: Type.String(), port: Type.String() }),
    ...Labelled,
  }),
  /**
   * The logic sheet's truth table has a lamp whose column, from the first row
   * (all switches off) to the last, reads like this ("0110").
   */
  Type.Object({
    kind: Type.Literal('sheet-column'),
    column: Type.String({ pattern: '^[01]{2,16}$' }),
    ...Labelled,
  }),
  /** A block has been made on the logic sheet. */
  Type.Object({ kind: Type.Literal('sheet-block'), ...Labelled }),
  /** While the sheet ran, an element of this kind showed this number (a hex digit, a counter; a lamp 1 when lit). */
  Type.Object({
    kind: Type.Literal('sheet-value'),
    type: Type.String(),
    equals: Type.Integer(),
    ...Labelled,
  }),
]);
export type Check = Static<typeof Check>;

export const Step = Type.Object({
  text: Text,
  /** What must be true for the step to be done. A step with none is read and moved past. */
  checks: Type.Array(Check),
  /**
   * On the step where the student puts the lesson's program on the board: true
   * for the board (`program`), 2 for the second board (`program2`).
   */
  program: Type.Optional(Type.Union([Type.Boolean(), Type.Literal(2)])),
});
export type Step = Static<typeof Step>;

export const LessonSchema = Type.Object({
  id: Type.String({ pattern: '^[a-z0-9-]+$' }),
  /** Position in the list of lessons, from 1. */
  order: Type.Integer({ minimum: 1 }),
  /**
   * `part` (the default): a lesson about one part of the kit. `project`: a
   * build that puts several parts together, after their own lessons.
   */
  kind: Type.Optional(Type.Union([Type.Literal('part'), Type.Literal('project')])),
  /** Lessons worth taking first, by id. */
  after: Type.Optional(Type.Array(Type.String())),
  /** The kit parts the lesson is about, by part definition id; none for a lesson on the logic sheet. */
  parts: Type.Array(Type.String()),
  /** True for a lesson on the logic sheet, which opens there. */
  sheet: Type.Optional(Type.Literal(true)),
  title: Text,
  summary: Text,
  /** What the new project starts with: the board, and a battery of this voltage. */
  setup: Type.Object({
    board: Type.Literal('esp32'),
    /** Two ESP32 boards instead of one, for a lesson where boards talk to each other. */
    boards: Type.Optional(Type.Literal(2)),
    battery: Type.Optional(Type.Number()),
  }),
  /** The ready-made ESP32 program the lesson uses, if any. */
  program: Type.Optional(Type.String()),
  /** The program for the second board, in a lesson with two. */
  program2: Type.Optional(Type.String()),
  steps: Type.Array(Step, { minItems: 2 }),
  /** What the student learned, said at the end. */
  learned: Type.Object({ bn: Type.Array(Type.String()), en: Type.Array(Type.String()) }),
  /** Something to try on one's own afterwards. */
  tryNext: Text,
  /**
   * A few questions after the last step, to check what was understood. Each has
   * two to four choices, the index of the right one, and why it is right.
   */
  quiz: Type.Optional(
    Type.Array(
      Type.Object({
        question: Text,
        choices: Type.Array(Text, { minItems: 2, maxItems: 4 }),
        answer: Type.Integer({ minimum: 0, maximum: 3 }),
        why: Text,
      }),
      { minItems: 1, maxItems: 5 },
    ),
  ),
});
export type Lesson = Static<typeof LessonSchema>;
