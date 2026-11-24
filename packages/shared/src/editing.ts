import { partDefinition } from '@banglalab/parts';
import {
  BREADBOARD_SPECS,
  boardOfHole,
  isHole,
  isRailHole,
  rowOfHole,
  type BreadboardSize,
  type HoleId,
} from './breadboard';
import { layoutOf } from './layout';
import {
  ComponentSchema,
  LCD_PINS,
  breadboardSizes,
  holeInCircuit,
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
  | 'breadboard-limit'
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
  const { idPrefix, offsets, maxSpan, rows } = definition.placement;
  return {
    idPrefix,
    pins: definition.pins.map((pin) => pin.id),
    offsets,
    ...(maxSpan === undefined ? {} : { maxSpan }),
    ...(rows === undefined ? {} : { rows }),
  };
}

export interface PartShape {
  idPrefix: string;
  pins: readonly string[];
  offsets: readonly number[];
  maxSpan?: number;
  /** For a chip across the centre gap: the row each pin must be in. */
  rows?: readonly string[];
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
  mq7: shapeOf('mq-7'),
  ph: shapeOf('ph-sensor'),
  voltagesensor: shapeOf('voltage-module-25v'),
  acs712: shapeOf('acs712'),
  tds: shapeOf('tds-meter'),
  turbidity: shapeOf('turbidity-sensor'),
  cell: shapeOf('li-ion-18650'),
  tp4056: shapeOf('tp4056'),
  lm2596: shapeOf('lm2596'),
  solar: shapeOf('solar-panel-5v'),
  bme280: shapeOf('bme280'),
  ina219: shapeOf('ina219'),
  ds18b20: shapeOf('ds18b20'),
  jsnsr04t: shapeOf('jsn-sr04t'),
  linesensor: shapeOf('line-sensor-5ch'),
  siren: shapeOf('siren'),
  gps: shapeOf('neo-6m'),
  pms5003: shapeOf('pms5003'),
  bluetooth: shapeOf('hc-05'),
  mp3: shapeOf('mp3-module'),
  gsm: shapeOf('sim800l'),
  pir: shapeOf('pir-hc-sr501'),
  clock: shapeOf('clock-555'),
  rgbled: shapeOf('rgb-led-module'),
  oled: shapeOf('oled-ssd1306-096'),
  ledring: shapeOf('ws2812b-ring'),
  tft: shapeOf('lcd-st7789-154'),
  lora: shapeOf('lora-ra-02'),
  relaymodule: shapeOf('relay-module-1ch'),
  logic: shapeOf('74hc08'),
  logic16: shapeOf('74hc161'),
  sevenseg: shapeOf('seven-segment-056'),
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
  mq7: { co: 0.1, threshold: 0.5 },
  ph: { ph: 7, threshold: 0.6 },
  voltagesensor: {},
  acs712: { range: '5A' },
  tds: { ppm: 150 },
  turbidity: { ntu: 10 },
  cell: { charge: 0.5, capacity: 2600 },
  tp4056: {},
  lm2596: { volts: 5 },
  solar: { light: 1 },
  bme280: { celsius: 28, humidity: 70, hpa: 1010, address: 0x76 },
  ina219: {},
  ds18b20: { celsius: 25 },
  jsnsr04t: { distance: 100 },
  linesensor: { black: [false, false, true, false, false] },
  siren: {},
  gps: { fix: true, lat: 23.7465, lng: 90.3763, satellites: 8 },
  pms5003: { pm25: 35 },
  bluetooth: { paired: true },
  mp3: { tracks: 5 },
  gsm: { signal: 20 },
  pir: { motion: false, hold: 3 },
  clock: { hz: 1 },
  rgbled: {},
  oled: {},
  ledring: { leds: 12 },
  tft: {},
  lora: { km: 0 },
  relaymodule: { trigger: 'high' },
  logic: { chip: '74HC08' },
  logic16: { chip: '74HC161' },
  sevenseg: { kind: 'cathode' },
  ultrasonic: { distance: 50 },
  lcd: {},
};

export const MAX_BATTERIES = 2;
/** Programmable boards in one circuit, of either kind: two, for a sender and a receiver. */
export const MAX_BOARDS = 2;
export const MAX_MOTOR_DRIVERS = 1;
export const MAX_BREADBOARDS = 4;

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
  if (isHole(endpoint)) return layoutOf(circuit).has(endpoint);
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
  // The two kinds of board share one limit: a circuit holds that many boards to program.
  const sameKind = (other: CircuitComponent) =>
    isProgrammable(component) ? isProgrammable(other) : other.type === component.type;
  if (circuit.components.filter(sameKind).length >= limit) return fail(limitError);
  return {
    ok: true,
    id: component.id,
    circuit: { ...circuit, components: [...circuit.components, component] },
  };
}

/**
 * Adds a breadboard with its top-left corner at `at`, in whole hole pitches.
 * The editor chooses a place clear of everything else.
 */
export function addBreadboard(
  circuit: CircuitDocument,
  size: BreadboardSize,
  at: Position,
): EditResult {
  const board = {
    id: nextId(circuit, 'BB'),
    type: 'breadboard',
    props: { size },
    at: { x: Math.round(at.x), y: Math.round(at.y) },
  } as const;
  if (!Value.Check(ComponentSchema, board)) return fail('no-room');
  return addBeside(circuit, board, MAX_BREADBOARDS, 'breadboard-limit');
}

/** The parts with a leg in a breadboard, and the wires with an end in it. */
export function onBreadboard(
  circuit: CircuitDocument,
  boardId: string,
): { parts: string[]; wires: string[] } {
  const on = (hole: string) => boardOfHole(hole) === boardId;
  return {
    parts: circuit.components.filter((c) => componentHoles(c).some(on)).map((c) => c.id),
    wires: circuit.wires.filter((w) => on(w.from) || on(w.to)).map((w) => w.id),
  };
}

export function addBattery(
  circuit: CircuitDocument,
  voltage = 9,
  source?: 'supply' | 'generator',
): EditResult {
  const props =
    source === 'generator'
      ? { voltage: 2.5, source, wave: 'square' as const, hz: 1, offset: 2.5 }
      : source === 'supply'
        ? { voltage: 5, source, limit: 1 }
        : { voltage };
  const prefix = source === 'generator' ? 'FG' : source === 'supply' ? 'PSU' : 'BAT';
  const battery = { id: nextId(circuit, prefix), type: 'battery', props } as const;
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
  const layout = layoutOf(circuit);
  const at = layout.coordinates(hole);
  const board = layout.board(boardOfHole(hole) ?? '');
  if (!at || !board) return fail('unknown-endpoint');
  const taken = occupied(circuit);
  if (taken.has(hole)) return fail('hole-occupied');

  const shape = PART_SHAPES[type];
  const { x, y } = at;
  const rowY = BREADBOARD_SPECS[board.size].rowY;
  // A chip across the gap goes where it must, at the tapped column; others start in the tapped row.
  const holeFor = (offset: number, i: number, direction: number) =>
    shape.rows
      ? layout.holeAt(x + offset, board.y + (rowY[shape.rows[i] as keyof typeof rowY] ?? -1))
      : layout.holeAt(x + direction * offset, y);
  for (const direction of shape.rows ? [1] : [1, -1]) {
    const holes = shape.offsets.map((offset, i) => holeFor(offset, i, direction));
    // A new part goes all on the breadboard it was put on.
    if (holes.some((h) => h === undefined || taken.has(h) || boardOfHole(h) !== board.id)) {
      continue;
    }
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
  const layout = layoutOf(circuit);
  if (holes.some((h) => !layout.has(h))) return fail('no-room');
  if (new Set(holes).size !== holes.length) return fail('same-point');
  // A part sits on one breadboard: its legs do not reach across to another.
  if (new Set(holes.map(boardOfHole)).size !== 1) return fail('no-room');
  // A chip only fits across the gap: each pin in its own row.
  if (shape.rows && holes.some((h, i) => rowOfHole(h) !== shape.rows![i])) return fail('no-room');
  const taken = occupied(circuit, part.id);
  if (holes.some((h) => taken.has(h))) return fail('hole-occupied');
  if (shape.maxSpan !== undefined && layout.distance(holes[0]!, holes.at(-1)!) > shape.maxSpan) {
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
  const layout = layoutOf(circuit);
  const pins: Record<string, HoleId> = {};
  for (const [pin, hole] of Object.entries(part.pins)) {
    const at = layout.coordinates(hole);
    // On the shared grid a part can slide from one breadboard on to the next.
    const target = at && layout.holeAt(at.x + dx, at.y + dy);
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
  // A chip cannot be turned round on its own rows.
  if (PART_SHAPES[part.type].rows) return fail('no-room');
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
  if ([from, to].some((e) => isRailHole(e, 'plus'))) return WIRE_COLORS.red;
  if ([from, to].some((e) => isRailHole(e, 'minus'))) return WIRE_COLORS.black;
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
  const changed = replaceComponent(circuit, next);
  // A breadboard made smaller must still have every hole something is plugged into.
  if (next.type === 'breadboard' && !holesAllThere(changed)) return fail('no-room');
  return { ok: true, id: componentId, circuit: changed };
}

/** True when every leg and wire end is in a hole one of the breadboards has. */
function holesAllThere(circuit: CircuitDocument): boolean {
  const sizes = breadboardSizes(circuit);
  const there = (end: string) => !isHole(end) || holeInCircuit(sizes, end);
  return (
    circuit.components.every((c) => componentHoles(c).every(there)) &&
    circuit.wires.every((w) => there(w.from) && there(w.to))
  );
}

/**
 * Removes a part or a wire. Removing a battery or board also removes the wires
 * plugged into it; removing a breadboard removes the parts and wires in it too.
 */
export function removeItem(circuit: CircuitDocument, id: string): EditResult {
  const isWire = circuit.wires.some((w) => w.id === id);
  const isComponent = circuit.components.some((c) => c.id === id);
  if (!isWire && !isComponent) return fail('unknown-item');
  const attached = (endpoint: string) => parseTerminal(endpoint)?.componentId === id;
  const riding = new Set(isComponent ? onBreadboard(circuit, id).parts : []);
  return {
    ok: true,
    id,
    circuit: {
      ...circuit,
      components: circuit.components.filter((c) => c.id !== id && !riding.has(c.id)),
      wires: circuit.wires.filter((w) => w.id !== id && !attached(w.from) && !attached(w.to)),
    },
  };
}
