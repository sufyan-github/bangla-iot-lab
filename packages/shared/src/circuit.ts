import { Type, type Static } from 'typebox';
import { Value } from 'typebox/value';

/**
 * The saved form of a circuit. This is the contract between the editor, the
 * simulator, local storage and (later) the sync API, so every change needs a
 * new `schemaVersion` and a migration.
 */
/**
 * Version history:
 * 1 — battery, resistor, LED, wires.
 * 2 — adds the UNO board, push button and potentiometer. Version 1 documents
 *     are valid version 2 documents apart from the number.
 */
export const CIRCUIT_SCHEMA_VERSION = 2;

const Id = Type.String({ minLength: 1, maxLength: 40, pattern: '^[A-Za-z0-9_-]+$' });
const Hole = Type.String({ pattern: '^([a-j]|tp|tn|bp|bn)[1-9][0-9]?$' });
/** A hole, or a terminal of an off-board part written "<componentId>.<pin>". */
const Endpoint = Type.String({ maxLength: 60, pattern: '^[A-Za-z0-9_-]+(\\.[a-z0-9]+)?$' });

export const LED_COLORS = ['red', 'yellow', 'green', 'blue', 'white'] as const;
export type LedColor = (typeof LED_COLORS)[number];

export const BatterySchema = Type.Object({
  id: Id,
  type: Type.Literal('battery'),
  props: Type.Object({ voltage: Type.Number({ minimum: 0.1, maximum: 24 }) }),
});

export const ResistorSchema = Type.Object({
  id: Id,
  type: Type.Literal('resistor'),
  pins: Type.Object({ a: Hole, b: Hole }),
  props: Type.Object({ resistance: Type.Number({ minimum: 1, maximum: 10_000_000 }) }),
});

export const LedSchema = Type.Object({
  id: Id,
  type: Type.Literal('led'),
  pins: Type.Object({ anode: Hole, cathode: Hole }),
  props: Type.Object({
    color: Type.Union([
      Type.Literal('red'),
      Type.Literal('yellow'),
      Type.Literal('green'),
      Type.Literal('blue'),
      Type.Literal('white'),
    ]),
  }),
});

/** Momentary push button: its two leads are joined only while it is held down. */
export const ButtonSchema = Type.Object({
  id: Id,
  type: Type.Literal('button'),
  pins: Type.Object({ a: Hole, b: Hole }),
  props: Type.Object({}),
});

/** Three-lead variable resistor. `position` is the knob: 0 at lead `a`, 1 at lead `b`. */
export const PotentiometerSchema = Type.Object({
  id: Id,
  type: Type.Literal('potentiometer'),
  pins: Type.Object({ a: Hole, wiper: Hole, b: Hole }),
  props: Type.Object({
    resistance: Type.Number({ minimum: 100, maximum: 1_000_000 }),
    position: Type.Number({ minimum: 0, maximum: 1 }),
  }),
});

/** Arduino UNO-compatible board. It sits beside the breadboard; wires plug into its sockets. */
export const UnoSchema = Type.Object({
  id: Id,
  type: Type.Literal('uno'),
  props: Type.Object({}),
});

export const ComponentSchema = Type.Union([
  BatterySchema,
  ResistorSchema,
  LedSchema,
  ButtonSchema,
  PotentiometerSchema,
  UnoSchema,
]);

export const WireSchema = Type.Object({
  id: Id,
  from: Endpoint,
  to: Endpoint,
  color: Type.String({ pattern: '^#[0-9a-fA-F]{6}$' }),
});

export const CircuitDocumentSchema = Type.Object({
  schemaVersion: Type.Literal(CIRCUIT_SCHEMA_VERSION),
  components: Type.Array(ComponentSchema, { maxItems: 200 }),
  wires: Type.Array(WireSchema, { maxItems: 400 }),
});

export type Battery = Static<typeof BatterySchema>;
export type Resistor = Static<typeof ResistorSchema>;
export type Led = Static<typeof LedSchema>;
export type Button = Static<typeof ButtonSchema>;
export type Potentiometer = Static<typeof PotentiometerSchema>;
export type Uno = Static<typeof UnoSchema>;
export type CircuitComponent = Static<typeof ComponentSchema>;
/** A part whose leads plug into breadboard holes. */
export type BoardPart = Extract<CircuitComponent, { pins: unknown }>;
export type ComponentType = CircuitComponent['type'];
export type Wire = Static<typeof WireSchema>;
export type CircuitDocument = Static<typeof CircuitDocumentSchema>;

export function emptyCircuit(): CircuitDocument {
  return { schemaVersion: CIRCUIT_SCHEMA_VERSION, components: [], wires: [] };
}

/** True when `value` is a structurally valid circuit document. */
export function isCircuitDocument(value: unknown): value is CircuitDocument {
  return Value.Check(CircuitDocumentSchema, value);
}

/**
 * Reads a stored document of any supported version and returns it in the
 * current version, or null when it is not a circuit this app can open.
 */
export function migrateCircuit(value: unknown): CircuitDocument | null {
  if (typeof value !== 'object' || value === null) return null;
  const version = (value as { schemaVersion?: unknown }).schemaVersion;
  const upgraded = version === 1 ? { ...value, schemaVersion: CIRCUIT_SCHEMA_VERSION } : value;
  return isCircuitDocument(upgraded) ? upgraded : null;
}

/** Terminals of the parts that sit beside the board and take wires directly. */
export const BATTERY_TERMINALS = ['pos', 'neg'] as const;

const range = (count: number) => Array.from({ length: count }, (_, i) => i);
/** UNO sockets: digital 0-13, analog A0-A5, the 5 V output and two ground sockets. */
export const UNO_TERMINALS = [
  ...range(14).map((n) => `d${n}`),
  ...range(6).map((n) => `a${n}`),
  '5v',
  'gnd',
  'gnd2',
] as const;

/** Arduino pin number of an UNO socket (A0 is 14), or null for power sockets. */
export function unoPinNumber(terminal: string): number | null {
  const match = /^([da])(\d+)$/.exec(terminal);
  if (!match) return null;
  return Number(match[2]) + (match[1] === 'a' ? 14 : 0);
}

export function terminalEndpoint(componentId: string, pin: string): string {
  return `${componentId}.${pin}`;
}

export function parseTerminal(endpoint: string): { componentId: string; pin: string } | null {
  const dot = endpoint.indexOf('.');
  if (dot < 0) return null;
  return { componentId: endpoint.slice(0, dot), pin: endpoint.slice(dot + 1) };
}

/** Holes occupied by a component's own leads. Off-board parts occupy none. */
export function componentHoles(component: CircuitComponent): string[] {
  return 'pins' in component ? Object.values(component.pins) : [];
}
