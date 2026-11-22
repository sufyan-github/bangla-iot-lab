import { partDefinition } from '@banglalab/parts';
import { holeAt, holeCoordinates, holeDistance, isHole, type HoleId } from './breadboard';
import {
  ComponentSchema,
  LCD_PINS,
  isProgrammable,
  WireSchema,
  componentHoles,
  parseTerminal,
  terminalsOf,
  type BoardPart,
  type CircuitComponent,
  type CircuitDocument,
  type Position,
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
  | 'board-limit'
  | 'driver-limit'
  | 'invalid-value';

export type EditResult =
  { ok: true; circuit: CircuitDocument; id: string } | { ok: false; error: EditError };

export type BoardPartType = BoardPart['type'];

/**
 * Physical shape of each part that plugs into the board: its leads in order,
 * where they land when first placed (columns to the right of the tapped hole),
 * and how far flexible leads can be bent apart, in hole pitches. Parts with no
 * `maxSpan` are rigid: their leads keep their spacing and move only together.
 */
/**
 * A part's shape, read from its definition in `@banglalab/parts`. Parts are
 * being moved from this table to their definitions one at a time; a test keeps
 * the two in agreement for every part that has both.
 */
function shapeOf(definitionId: string): PartShape {
  const definition = partDefinition(definitionId);
  if (!definition.placement) throw new Error(`Part ${definitionId} has no placement.`);
  const { idPrefix, offsets, maxSpan } = definition.placement;
  return {
    idPrefix,
    pins: definition.pins.map((pin) => pin.id),
    offsets,
    ...(maxSpan === undefined ? {} : { maxSpan }),
  };
}

export interface PartShape {
  idPrefix: string;
  pins: readonly string[];
  offsets: readonly number[];
  maxSpan?: number;
}

export const PART_SHAPES: Record<BoardPartType, PartShape> = {
  resistor: shapeOf('resistor'),
  led: shapeOf('led-5mm'),
  button: { idPrefix: 'SW', pins: ['a', 'b'], offsets: [0, 2], maxSpan: 4 },
  potentiometer: { idPrefix: 'POT', pins: ['a', 'wiper', 'b'], offsets: [0, 1, 2] },
  capacitor: { idPrefix: 'C', pins: ['a', 'b'], offsets: [0, 2], maxSpan: 6 },
  switch: { idPrefix: 'S', pins: ['a', 'b'], offsets: [0, 2], maxSpan: 4 },
  diode: { idPrefix: 'D', pins: ['anode', 'cathode'], offsets: [0, 3], maxSpan: 8 },
  ldr: { idPrefix: 'LDR', pins: ['a', 'b'], offsets: [0, 2], maxSpan: 4 },
  buzzer: { idPrefix: 'BZ', pins: ['pos', 'neg'], offsets: [0, 2], maxSpan: 3 },
  motor: { idPrefix: 'M', pins: ['a', 'b'], offsets: [0, 3], maxSpan: 6 },
  transistor: { idPrefix: 'Q', pins: ['collector', 'base', 'emitter'], offsets: [0, 1, 2] },
  temperature: { idPrefix: 'TMP', pins: ['vcc', 'out', 'gnd'], offsets: [0, 1, 2] },
  soil: { idPrefix: 'SOIL', pins: ['vcc', 'out', 'gnd'], offsets: [0, 1, 2] },
  ir: { idPrefix: 'IR', pins: ['vcc', 'out', 'gnd'], offsets: [0, 1, 2] },
  relay: { idPrefix: 'K', pins: ['coil1', 'coil2', 'com', 'no'], offsets: [0, 1, 3, 4] },
  servo: { idPrefix: 'SRV', pins: ['gnd', 'vcc', 'signal'], offsets: [0, 1, 2] },
  ultrasonic: shapeOf('hc-sr04'),
  dht11: shapeOf('dht11'),
  ldrmodule: shapeOf('ldr-module'),
  rain: shapeOf('rain-sensor'),
  mq135: shapeOf('mq-135'),
  pir: shapeOf('pir-hc-sr501'),
  rgbled: shapeOf('rgb-led-module'),
  oled: shapeOf('oled-ssd1306-096'),
  lcd: { idPrefix: 'LCD', pins: LCD_PINS, offsets: LCD_PINS.map((_, i) => i) },
};

const DEFAULT_PROPS: { [T in BoardPartType]: Extract<BoardPart, { type: T }>['props'] } = {
  resistor: { resistance: 330 },
  led: { color: 'red' },
  button: {},
  potentiometer: { resistance: 10_000, position: 0.5 },
  capacitor: { capacitance: 100e-6 },
  switch: { closed: false },
  diode: {},
  ldr: { light: 0.5 },
  buzzer: {},
  motor: {},
  transistor: {},
  temperature: { celsius: 25 },
  soil: { moisture: 0.3 },
  ir: { detected: false },
  relay: {},
  servo: {},
  dht11: { celsius: 28, humidity: 70 },
  ldrmodule: { light: 0.5, threshold: 0.5 },
  rain: { wetness: 0, threshold: 0.5 },
  mq135: { gas: 0.1, threshold: 0.5 },
  pir: { motion: false, hold: 3 },
  rgbled: {},
  oled: {},
  ultrasonic: { distance: 50 },
  lcd: {},
};

export const MAX_BATTERIES = 2;
export const MAX_BOARDS = 1;
export const MAX_MOTOR_DRIVERS = 1;

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

function findBoardPart(circuit: CircuitDocument, id: string): BoardPart | undefined {
  const component = circuit.components.find((c) => c.id === id);
  return component && 'pins' in component ? component : undefined;
}

function endpointExists(circuit: CircuitDocument, endpoint: string): boolean {
  if (isHole(endpoint)) return true;
  const terminal = parseTerminal(endpoint);
  if (!terminal) return false;
  const owner = circuit.components.find((c) => c.id === terminal.componentId);
  return owner !== undefined && terminalsOf(owner).includes(terminal.pin);
}

/** A hole or board socket holds exactly one lead; a battery clip can hold several wires. */
function holdsOneLead(circuit: CircuitDocument, endpoint: string): boolean {
  if (isHole(endpoint)) return true;
  const owner = circuit.components.find((c) => c.id === parseTerminal(endpoint)?.componentId);
  return owner !== undefined && isProgrammable(owner);
}

/** Holes and sockets that already hold a lead or a wire end. */
function occupied(circuit: CircuitDocument, ignoreId?: string): Set<string> {
  const taken = new Set<string>();
  for (const component of circuit.components) {
    if (component.id !== ignoreId) componentHoles(component).forEach((h) => taken.add(h));
  }
  for (const wire of circuit.wires) {
    if (wire.id === ignoreId) continue;
    for (const end of [wire.from, wire.to]) if (holdsOneLead(circuit, end)) taken.add(end);
  }
  return taken;
}

/** Why a new wire end cannot go on `endpoint`, or null when it can. */
export function attachError(circuit: CircuitDocument, endpoint: string): EditError | null {
  if (!endpointExists(circuit, endpoint)) return 'unknown-endpoint';
  return occupied(circuit).has(endpoint) ? 'hole-occupied' : null;
}

function addBeside(
  circuit: CircuitDocument,
  component: CircuitComponent,
  limit: number,
  limitError: EditError,
): EditResult {
  // The two kinds of board share one limit: a circuit has one board to program.
  const sameKind = (other: CircuitComponent) =>
    isProgrammable(component) ? isProgrammable(other) : other.type === component.type;
  if (circuit.components.filter(sameKind).length >= limit) return fail(limitError);
  return {
    ok: true,
    id: component.id,
    circuit: { ...circuit, components: [...circuit.components, component] },
  };
}

export function addBattery(circuit: CircuitDocument, voltage = 9): EditResult {
  const battery = { id: nextId(circuit, 'BAT'), type: 'battery', props: { voltage } } as const;
  return addBeside(circuit, battery, MAX_BATTERIES, 'battery-limit');
}

export function addUno(circuit: CircuitDocument): EditResult {
  const board = { id: nextId(circuit, 'UNO'), type: 'uno', props: {} } as const;
  return addBeside(circuit, board, MAX_BOARDS, 'board-limit');
}

export function addEsp32(circuit: CircuitDocument): EditResult {
  const board = { id: nextId(circuit, 'ESP'), type: 'esp32', props: {} } as const;
  return addBeside(circuit, board, MAX_BOARDS, 'board-limit');
}

/** Adds a motor driver module beside the board, with both of its jumpers in place, as sold. */
export function addMotorDriver(circuit: CircuitDocument): EditResult {
  const driver = {
    id: nextId(circuit, 'DRV'),
    type: 'l298n',
    props: { enaJumper: true, enbJumper: true },
  } as const;
  return addBeside(circuit, driver, MAX_MOTOR_DRIVERS, 'driver-limit');
}

/**
 * Puts a new part on the board with its first lead in `hole`. The other leads
 * go to the right if there is room, otherwise to the left.
 */
export function placePart(circuit: CircuitDocument, type: BoardPartType, hole: HoleId): EditResult {
  if (!isHole(hole)) return fail('unknown-endpoint');
  const taken = occupied(circuit);
  if (taken.has(hole)) return fail('hole-occupied');

  const shape = PART_SHAPES[type];
  const { x, y } = holeCoordinates(hole);
  for (const direction of [1, -1]) {
    const holes = shape.offsets.map((offset) => holeAt(x + direction * offset, y));
    if (holes.some((h) => h === undefined || taken.has(h))) continue;
    const pins = Object.fromEntries(shape.pins.map((pin, i) => [pin, holes[i]]));
    const component = {
      id: nextId(circuit, shape.idPrefix),
      type,
      pins,
      props: DEFAULT_PROPS[type],
    } as BoardPart;
    return {
      ok: true,
      id: component.id,
      circuit: { ...circuit, components: [...circuit.components, component] },
    };
  }
  return fail('no-room');
}

function replaceComponent(circuit: CircuitDocument, next: CircuitComponent): CircuitDocument {
  return {
    ...circuit,
    components: circuit.components.map((c) => (c.id === next.id ? next : c)),
  };
}

function withPins(
  circuit: CircuitDocument,
  part: BoardPart,
  pins: Record<string, HoleId>,
): EditResult {
  const shape = PART_SHAPES[part.type];
  const holes = shape.pins.map((pin) => pins[pin]!);
  if (holes.some((h) => !isHole(h))) return fail('no-room');
  if (new Set(holes).size !== holes.length) return fail('same-point');
  const taken = occupied(circuit, part.id);
  if (holes.some((h) => taken.has(h))) return fail('hole-occupied');
  if (shape.maxSpan !== undefined && holeDistance(holes[0]!, holes.at(-1)!) > shape.maxSpan) {
    return fail('lead-too-long');
  }
  const next = { ...part, pins } as BoardPart;
  return { ok: true, id: part.id, circuit: replaceComponent(circuit, next) };
}

/** True when each lead of the part can be moved on its own. */
export function hasFlexibleLeads(type: BoardPartType): boolean {
  return PART_SHAPES[type].maxSpan !== undefined;
}

/** Moves one lead of a part to another hole. Rigid parts refuse. */
export function movePin(
  circuit: CircuitDocument,
  componentId: string,
  pin: string,
  hole: HoleId,
): EditResult {
  const part = findBoardPart(circuit, componentId);
  if (!part || !(pin in part.pins) || !hasFlexibleLeads(part.type)) return fail('unknown-item');
  return withPins(circuit, part, { ...part.pins, [pin]: hole });
}

/** Slides a whole part by a number of holes, keeping its shape. */
export function movePart(
  circuit: CircuitDocument,
  componentId: string,
  dx: number,
  dy: number,
): EditResult {
  const part = findBoardPart(circuit, componentId);
  if (!part) return fail('unknown-item');
  const pins: Record<string, HoleId> = {};
  for (const [pin, hole] of Object.entries(part.pins)) {
    const { x, y } = holeCoordinates(hole);
    const target = holeAt(x + dx, y + dy);
    if (!target) return fail('no-room');
    pins[pin] = target;
  }
  return withPins(circuit, part, pins);
}

/** Puts a battery or board somewhere else on the work surface. The editor checks for overlap. */
export function moveOffBoardPart(
  circuit: CircuitDocument,
  componentId: string,
  at: Position,
): EditResult {
  const component = circuit.components.find((c) => c.id === componentId);
  if (!component || 'pins' in component) return fail('unknown-item');
  const next = { ...component, at };
  if (!Value.Check(ComponentSchema, next)) return fail('no-room');
  return { ok: true, id: componentId, circuit: replaceComponent(circuit, next) };
}

/** Turns a part end for end. For an LED this reverses its polarity. */
export function flipPart(circuit: CircuitDocument, componentId: string): EditResult {
  const part = findBoardPart(circuit, componentId);
  if (!part) return fail('unknown-item');
  const names = PART_SHAPES[part.type].pins;
  const holes = names.map((pin) => (part.pins as Record<string, HoleId>)[pin]!).reverse();
  return withPins(circuit, part, Object.fromEntries(names.map((pin, i) => [pin, holes[i]!])));
}

function checkWire(circuit: CircuitDocument, wire: Wire): EditError | null {
  if (!endpointExists(circuit, wire.from) || !endpointExists(circuit, wire.to)) {
    return 'unknown-endpoint';
  }
  if (wire.from === wire.to) return 'same-point';
  const taken = occupied(circuit, wire.id);
  if (taken.has(wire.from) || taken.has(wire.to)) return 'hole-occupied';
  return null;
}

/** Picks the conventional colour for power wires and cycles the rest. */
export function suggestWireColor(circuit: CircuitDocument, from: string, to: string): string {
  const pins = [from, to].map((e) => parseTerminal(e)?.pin);
  if (pins.some((pin) => pin === 'pos' || pin === '5v')) return WIRE_COLORS.red;
  if (pins.some((pin) => pin === 'neg' || pin === 'gnd' || pin === 'gnd2'))
    return WIRE_COLORS.black;
  if ([from, to].some((e) => /^(tp|bp)\d/.test(e))) return WIRE_COLORS.red;
  if ([from, to].some((e) => /^(tn|bn)\d/.test(e))) return WIRE_COLORS.black;
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

/** Routes a wire through the given points, or straightens it when there are none. */
export function setWireBends(
  circuit: CircuitDocument,
  wireId: string,
  bends: readonly Position[],
): EditResult {
  const wire = circuit.wires.find((w) => w.id === wireId);
  if (!wire) return fail('unknown-item');
  const straight: Wire = { id: wire.id, from: wire.from, to: wire.to, color: wire.color };
  const next: Wire = bends.length > 0 ? { ...straight, bends: [...bends] } : straight;
  if (!Value.Check(WireSchema, next)) return fail('invalid-value');
  return {
    ok: true,
    id: wireId,
    circuit: { ...circuit, wires: circuit.wires.map((w) => (w.id === wireId ? next : w)) },
  };
}

/** Changes a part's properties (resistance, colour, voltage…) after validating them. */
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

/** Removes a part or a wire. Removing a battery or board also removes the wires plugged into it. */
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
