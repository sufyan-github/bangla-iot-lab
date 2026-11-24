import { Type, type Static } from 'typebox';

/**
 * The format of a part definition: one JSON file per real part, in
 * `definitions/`. It says what the part is, how honestly it is modelled, which
 * real variants exist, and how to recognise it in a parts list.
 *
 * A definition never claims more than is true. `status` says whether a model
 * exists at all, `model.simplified` lists what the model leaves out, and
 * `validation.state` stays "not-checked" until a bench record exists.
 */
const Text = Type.Object({ bn: Type.String(), en: Type.String({ minLength: 1 }) });

export const PinSchema = Type.Object({
  /** The leg's name in the saved-circuit format, e.g. "anode". */
  id: Type.String({ pattern: '^[a-z0-9]+$' }),
  /** What is printed on the part. */
  label: Type.String({ minLength: 1 }),
  role: Type.Union([
    Type.Literal('power'),
    Type.Literal('ground'),
    Type.Literal('input'),
    Type.Literal('output'),
    Type.Literal('bidirectional'),
    Type.Literal('passive'),
  ]),
  /** Lowest and highest voltage the leg tolerates. */
  volts: Type.Optional(Type.Tuple([Type.Number(), Type.Number()])),
});

export const PartDefinitionSchema = Type.Object({
  formatVersion: Type.Literal(1),
  id: Type.String({ pattern: '^[a-z0-9]+(-[a-z0-9]+)*$' }),
  /** The component type in the saved-circuit format that models this part, or null if none does. */
  simulates: Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
  /**
   * simulated: a model of this part exists. generic: a general model stands in
   * for it. planned: wanted, not built. not-simulated: will not be modelled.
   */
  status: Type.Union([
    Type.Literal('simulated'),
    Type.Literal('generic'),
    Type.Literal('planned'),
    Type.Literal('not-simulated'),
  ]),
  /** Required unless the part is fully simulated: what is missing or why. */
  statusNote: Type.Optional(Type.String({ minLength: 1 })),
  family: Type.Union([
    Type.Literal('board'),
    Type.Literal('basic'),
    Type.Literal('sensor'),
    Type.Literal('output'),
    Type.Literal('actuator'),
    Type.Literal('display'),
    Type.Literal('communication'),
    Type.Literal('power'),
    Type.Literal('accessory'),
    Type.Literal('logic'),
  ]),
  /** 1: the school kit and first lessons. 2: another shortlisted project. 3: everything else. */
  tier: Type.Union([Type.Literal(1), Type.Literal(2), Type.Literal(3)]),
  name: Text,
  summary: Text,
  model: Type.Object({
    /** How deep the model goes; "none" when there is no model. */
    level: Type.Union([
      Type.Literal('electrical'),
      Type.Literal('timing'),
      Type.Literal('behaviour'),
      Type.Literal('none'),
    ]),
    /** What the model leaves out, in plain words, shown to the student. */
    simplified: Type.Array(Type.String({ minLength: 1 })),
  }),
  validation: Type.Object({
    /** "validated" only when `record` points at a bench record in docs/validation/records. */
    state: Type.Union([Type.Literal('not-checked'), Type.Literal('validated')]),
    /** Ids of the hardware tests in docs/validation that cover this part. */
    tests: Type.Array(Type.String({ pattern: '^[A-E][0-9]+$' })),
    record: Type.Optional(Type.String({ minLength: 1 })),
  }),
  pins: Type.Array(PinSchema),
  /** For parts that plug into the breadboard: how they are placed. */
  placement: Type.Optional(
    Type.Object({
      idPrefix: Type.String({ pattern: '^[A-Z]+$' }),
      /** Column of each leg, counted from the hole that was tapped. */
      offsets: Type.Array(Type.Integer({ minimum: 0 })),
      /** How far flexible legs can be bent apart, in hole pitches. Absent for rigid parts. */
      maxSpan: Type.Optional(Type.Integer({ minimum: 1 })),
      /**
       * For a chip that sits across the centre gap: the row each leg must be in,
       * whichever hole was tapped. Such a part can only be slid along the gap.
       */
      rows: Type.Optional(Type.Array(Type.String({ pattern: '^[a-j]$' }))),
    }),
  ),
  /** Property values a newly placed part starts with. */
  defaults: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  /** The real versions of this part a student may hold. */
  variants: Type.Array(
    Type.Object({
      id: Type.String({ pattern: '^[a-z0-9]+(-[a-z0-9]+)*$' }),
      name: Type.String({ minLength: 1 }),
      note: Type.Optional(Type.String()),
      /** True only when its dimensions were measured from a real part. */
      measured: Type.Boolean(),
    }),
  ),
  catalog: Type.Object({
    /** Lower-case words that identify this part in a product name or a parts-list line. */
    keywords: Type.Array(Type.String({ pattern: '^[^A-Z]+$' })),
  }),
});

export type PartDefinition = Static<typeof PartDefinitionSchema>;
export type PartStatus = PartDefinition['status'];
