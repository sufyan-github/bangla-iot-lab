import { holeAt, holeCoordinates, holeDistance, isHole, type HoleId } from './breadboard';
import {
  BATTERY_TERMINALS,
  ComponentSchema,
  componentHoles,
  parseTerminal,
  type CircuitComponent,
  type CircuitDocument,
  type Wire,
} from './circuit';
import { Value } from 'typebox/value';

/**
 * Editing operations on a circuit document. Each one returns a new document or
 * a reason it was refused, so the editor never holds an invalid circuit and the
 * rules can be tested without a browser.
 */
export type EditError =
  | 'hole-occupied'
  | 'no-room'
  | 'lead-too-long'
  | 'same-point'
  | 'unknown-endpoint'
  | 'unknown-item'
  | 'battery-limit'
  | 'invalid-value';

export type EditResult =
  { ok: true; circuit: CircuitDocument; id: string } | { ok: false; error: EditError };

/** Longest distance a part's leads can stretch, in hole pitches. */
export const MAX_LEAD_SPAN = { resistor: 12, led: 4 } as const;
const DEFAULT_SPAN = { resistor: 4, led: 1 } as const;
export const MAX_BATTERIES = 2;

export const WIRE_COLORS = {
  red: '#d8342a',
  black: '#23282b',
  yellow: '#e8a21a',
  blue: '#2f6fd0',
  green: '#2e9d57',
  white: '#e9ecea',
} as const;

const fail = (error: EditError): EditResult => ({ ok: false, error });

function nextId(circuit: CircuitDocument, prefix: string): string {
  const used = new Set([...circuit.components, ...circuit.wires].map((item) => item.id));
  for (let n = 1; ; n++) if (!used.has(`${prefix}${n}`)) return `${prefix}${n}`;
}

/** Holes that already hold a lead or a wire end. A hole takes exactly one. */
function occupiedHoles(circuit: CircuitDocument, ignoreId?: string): Set<HoleId> {
  const holes = new Set<HoleId>();
  for (const component of circuit.components) {
    if (component.id !== ignoreId) componentHoles(component).forEach((h) => holes.add(h));
  }
  for (const wire of circuit.wires) {
    if (wire.id === ignoreId) continue;
    if (isHole(wire.from)) holes.add(wire.from);
    if (isHole(wire.to)) holes.add(wire.to);
  }
  return holes;
}

function endpointExists(circuit: CircuitDocument, endpoint: string): boolean {
  if (isHole(endpoint)) return true;
  const terminal = parseTerminal(endpoint);
  if (!terminal) return false;
  const owner = circuit.components.find((c) => c.id === terminal.componentId);
  return owner?.type === 'battery' && BATTERY_TERMINALS.some((pin) => pin === terminal.pin);
}

/** Why a new wire end cannot go on `endpoint`, or null when it can. */
export function attachError(circuit: CircuitDocument, endpoint: string): EditError | null {
  if (!endpointExists(circuit, endpoint)) return 'unknown-endpoint';
  return occupiedHoles(circuit).has(endpoint) ? 'hole-occupied' : null;
}

export function addBattery(circuit: CircuitDocument, voltage = 9): EditResult {
  if (circuit.components.filter((c) => c.type === 'battery').length >= MAX_BATTERIES) {
    return fail('battery-limit');
  }
  const id = nextId(circuit, 'BAT');
  const battery: CircuitComponent = { id, type: 'battery', props: { voltage } };
  return { ok: true, id, circuit: { ...circuit, components: [...circuit.components, battery] } };
}

/**
 * Puts a new resistor or LED on the board with its first lead in `hole`.
 * The second lead goes to the right if there is room, otherwise to the left.
 */
export function placePart(
  circuit: CircuitDocument,
  type: 'resistor' | 'led',
  hole: HoleId,
): EditResult {
  if (!isHole(hole)) return fail('unknown-endpoint');
  const occupied = occupiedHoles(circuit);
  if (occupied.has(hole)) return fail('hole-occupied');

  const { x, y } = holeCoordinates(hole);
  const span = DEFAULT_SPAN[type];
  const second = [span, -span, span + 1, -(span + 1)]
    .map((dx) => holeAt(x + dx, y))
    .find((candidate) => candidate !== undefined && !occupied.has(candidate));
  if (!second) return fail('no-room');

  const component: CircuitComponent =
    type === 'resistor'
      ? { id: nextId(circuit, 'R'), type, pins: { a: hole, b: second }, props: { resistance: 330 } }
      : {
          id: nextId(circuit, 'LED'),
          type,
          pins: { anode: hole, cathode: second },
          props: { color: 'red' },
        };
  return {
    ok: true,
    id: component.id,
    circuit: { ...circuit, components: [...circuit.components, component] },
  };
}

function replaceComponent(circuit: CircuitDocument, next: CircuitComponent): CircuitDocument {
  return {
    ...circuit,
    components: circuit.components.map((c) => (c.id === next.id ? next : c)),
  };
}

function withPins(
  circuit: CircuitDocument,
  component: CircuitComponent,
  pins: Record<string, HoleId>,
): EditResult {
  if (component.type === 'battery') return fail('unknown-item');
  const holes = Object.values(pins);
  if (holes.some((h) => !isHole(h))) return fail('no-room');
  const [first, second] = holes as [HoleId, HoleId];
  if (first === second) return fail('same-point');
  const occupied = occupiedHoles(circuit, component.id);
  if (holes.some((h) => occupied.has(h))) return fail('hole-occupied');
  if (holeDistance(first, second) > MAX_LEAD_SPAN[component.type]) return fail('lead-too-long');
  const next = { ...component, pins } as CircuitComponent;
  return { ok: true, id: component.id, circuit: replaceComponent(circuit, next) };
}

/** Moves one lead of a part to another hole. */
export function movePin(
  circuit: CircuitDocument,
  componentId: string,
  pin: string,
  hole: HoleId,
): EditResult {
  const component = circuit.components.find((c) => c.id === componentId);
  if (!component || !('pins' in component) || !(pin in component.pins)) return fail('unknown-item');
  return withPins(circuit, component, { ...component.pins, [pin]: hole });
}

/** Slides a whole part by a number of holes, keeping its shape. */
export function movePart(
  circuit: CircuitDocument,
  componentId: string,
  dx: number,
  dy: number,
): EditResult {
  const component = circuit.components.find((c) => c.id === componentId);
  if (!component || !('pins' in component)) return fail('unknown-item');
  const pins: Record<string, HoleId> = {};
  for (const [pin, hole] of Object.entries(component.pins)) {
    const { x, y } = holeCoordinates(hole);
    const target = holeAt(x + dx, y + dy);
    if (!target) return fail('no-room');
    pins[pin] = target;
  }
  return withPins(circuit, component, pins);
}

/** Swaps the two leads of a part. For an LED this reverses its polarity. */
export function flipPart(circuit: CircuitDocument, componentId: string): EditResult {
  const component = circuit.components.find((c) => c.id === componentId);
  if (!component || !('pins' in component)) return fail('unknown-item');
  const [[pinA, holeA], [pinB, holeB]] = Object.entries(component.pins) as [
    [string, HoleId],
    [string, HoleId],
  ];
  return withPins(circuit, component, { [pinA]: holeB, [pinB]: holeA });
}

function checkWire(circuit: CircuitDocument, wire: Wire): EditError | null {
  if (!endpointExists(circuit, wire.from) || !endpointExists(circuit, wire.to)) {
    return 'unknown-endpoint';
  }
  if (wire.from === wire.to) return 'same-point';
  const occupied = occupiedHoles(circuit, wire.id);
  if (occupied.has(wire.from) || occupied.has(wire.to)) return 'hole-occupied';
  return null;
}

/** Picks the conventional colour for power wires and cycles the rest. */
export function suggestWireColor(circuit: CircuitDocument, from: string, to: string): string {
  const pins = [from, to].map((e) => parseTerminal(e)?.pin);
  if (pins.includes('pos')) return WIRE_COLORS.red;
  if (pins.includes('neg')) return WIRE_COLORS.black;
  if ([from, to].some((e) => /^(tp|bp)/.test(e))) return WIRE_COLORS.red;
  if ([from, to].some((e) => /^(tn|bn)/.test(e))) return WIRE_COLORS.black;
  const cycle = [WIRE_COLORS.yellow, WIRE_COLORS.blue, WIRE_COLORS.green];
  return cycle[circuit.wires.length % cycle.length] ?? WIRE_COLORS.yellow;
}

export function addWire(
  circuit: CircuitDocument,
  from: string,
  to: string,
  color: string = suggestWireColor(circuit, from, to),
): EditResult {
  const wire: Wire = { id: nextId(circuit, 'W'), from, to, color };
  const error = checkWire(circuit, wire);
  if (error) return fail(error);
  return { ok: true, id: wire.id, circuit: { ...circuit, wires: [...circuit.wires, wire] } };
}

export function moveWireEnd(
  circuit: CircuitDocument,
  wireId: string,
  end: 'from' | 'to',
  endpoint: string,
): EditResult {
  const wire = circuit.wires.find((w) => w.id === wireId);
  if (!wire) return fail('unknown-item');
  const next = { ...wire, [end]: endpoint };
  const error = checkWire(circuit, next);
  if (error) return fail(error);
  return {
    ok: true,
    id: wireId,
    circuit: { ...circuit, wires: circuit.wires.map((w) => (w.id === wireId ? next : w)) },
  };
}

/** Changes a part's properties (resistance, colour, voltage) after validating them. */
export function updateProps(
  circuit: CircuitDocument,
  componentId: string,
  props: Record<string, unknown>,
): EditResult {
  const component = circuit.components.find((c) => c.id === componentId);
  if (!component) return fail('unknown-item');
  const next = { ...component, props: { ...component.props, ...props } };
  if (!Value.Check(ComponentSchema, next)) return fail('invalid-value');
  return { ok: true, id: componentId, circuit: replaceComponent(circuit, next) };
}

/** Removes a part or a wire. Removing a battery also removes the wires clipped to it. */
export function removeItem(circuit: CircuitDocument, id: string): EditResult {
  const isWire = circuit.wires.some((w) => w.id === id);
  const isComponent = circuit.components.some((c) => c.id === id);
  if (!isWire && !isComponent) return fail('unknown-item');
  const attached = (endpoint: string) => parseTerminal(endpoint)?.componentId === id;
  return {
    ok: true,
    id,
    circuit: {
      ...circuit,
      components: circuit.components.filter((c) => c.id !== id),
      wires: circuit.wires.filter((w) => w.id !== id && !attached(w.from) && !attached(w.to)),
    },
  };
}
