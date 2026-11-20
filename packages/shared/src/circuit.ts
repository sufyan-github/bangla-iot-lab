import { Type, type Static } from 'typebox';
import { Value } from 'typebox/value';

/**
 * The saved form of a circuit. This is the contract between the editor, the
 * simulator, local storage and (later) the sync API, so every change needs a
 * new `schemaVersion` and a migration.
 */
export const CIRCUIT_SCHEMA_VERSION = 1;

const Id = Type.String({ minLength: 1, maxLength: 40, pattern: '^[A-Za-z0-9_-]+$' });
const Hole = Type.String({ pattern: '^([a-j]|tp|tn|bp|bn)[1-9][0-9]?$' });
/** A hole, or a terminal of an off-board part written "<componentId>.<pin>". */
const Endpoint = Type.String({ maxLength: 60, pattern: '^[A-Za-z0-9_-]+(\\.[a-z]+)?$' });

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
  props: Type.Object({ color: Type.Union(LED_COLORS.map((c) => Type.Literal(c))) }),
});

export const ComponentSchema = Type.Union([BatterySchema, ResistorSchema, LedSchema]);

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
export type CircuitComponent = Static<typeof ComponentSchema>;
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

/** Pins of an off-board part that wires can attach to. */
export const BATTERY_TERMINALS = ['pos', 'neg'] as const;

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
