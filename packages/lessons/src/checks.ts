import {
  ESP32_TERMINALS,
  UNO_TERMINALS,
  isProgrammable,
  terminalsOf,
  type CircuitComponent,
  type CircuitDocument,
  type LogicSheet,
} from '@banglalab/shared';
import { netName, sheetTruthTable, type SimulationResult } from '@banglalab/simulation';
import type { Check, Lesson, Place, Step } from './schema';

/** What a lesson can see of the student's work at one moment. */
export interface LessonWorld {
  circuit: CircuitDocument;
  /** What the simulation last showed; null while the circuit is switched off. */
  result: SimulationResult | null;
  running: boolean;
  /** Everything the board printed since the circuit was switched on. */
  serial: string;
  /** The ready-made program the board's uploaded program is, unchanged; null if none. */
  uploadedStarter: string | null;
  /** The same two for each board, in order, when there is more than one. */
  boards?: { serial: string; uploadedStarter: string | null }[];
  /** The project's logic sheet, and the numbers its displays and lamps show now. */
  sheet?: LogicSheet;
  sheetValues?: { type: string; value: number }[];
}

/** What a board printed and had put on it: the first, or the second in a lesson with two. */
function boardWorld(world: LessonWorld, unit: 2 | undefined) {
  if (unit === 2) return world.boards?.[1] ?? { serial: '', uploadedStarter: null };
  return { serial: world.serial, uploadedStarter: world.uploadedStarter };
}

/** Checks about something that happened while the circuit ran. They count once seen. */
export function isEvent(check: Check): boolean {
  return (
    check.kind === 'reading' ||
    check.kind === 'serial' ||
    check.kind === 'diagnostic' ||
    check.kind === 'sheet-value'
  );
}

/** Joins wire ends and breadboard strips into nets, and answers which net a place is on. */
function nets(circuit: CircuitDocument) {
  const parent = new Map<string, string>();
  const find = (net: string): string => {
    let root = net;
    while (parent.has(root)) root = parent.get(root)!;
    return root;
  };
  for (const wire of circuit.wires) {
    const a = find(netName(wire.from));
    const b = find(netName(wire.to));
    if (a !== b) parent.set(a, b);
  }
  return (endpoint: string) => find(netName(endpoint));
}

const ofType = (circuit: CircuitDocument, type: string) =>
  circuit.components.filter((component) => component.type === type);

/** Every endpoint that a place could mean in this circuit. */
export function endpoints(circuit: CircuitDocument, place: Place): string[] {
  if ('board' in place) {
    const board = circuit.components.filter(isProgrammable)[(place.unit ?? 1) - 1];
    return board ? [`${board.id}.${place.board}`] : [];
  }
  if ('battery' in place) return ofType(circuit, 'battery').map((b) => `${b.id}.${place.battery}`);
  // `*` is any leg: for parts that may be turned either way round, such as a button or a motor.
  return ofType(circuit, place.part).flatMap((component) => {
    if (!('pins' in component)) {
      const terminals = place.pin === '*' ? terminalsOf(component) : [place.pin];
      return terminals.map((terminal) => `${component.id}.${terminal}`);
    }
    const pins = component.pins as Record<string, string>;
    if (place.pin === '*') return Object.values(pins);
    const hole = pins[place.pin];
    return hole ? [hole] : [];
  });
}

function compare(
  value: unknown,
  check: { equals?: string | number | boolean; above?: number; below?: number },
): boolean {
  if (value === undefined || value === null) return false;
  if (check.equals !== undefined && value !== check.equals) return false;
  if (check.above !== undefined && !(typeof value === 'number' && value > check.above))
    return false;
  if (check.below !== undefined && !(typeof value === 'number' && value < check.below))
    return false;
  return true;
}

function field(object: unknown, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (value, key) =>
        typeof value === 'object' && value !== null
          ? (value as Record<string, unknown>)[key]
          : undefined,
      object,
    );
}

/** True when the check holds in this world. */
export function evaluate(check: Check, world: LessonWorld): boolean {
  const { circuit, result } = world;
  switch (check.kind) {
    case 'part':
      return ofType(circuit, check.type).length > 0;
    case 'connected': {
      const netOf = nets(circuit);
      const from = endpoints(circuit, check.from).map(netOf);
      const to = endpoints(circuit, check.to).map(netOf);
      if (check.through !== 'resistor') return from.some((net) => to.includes(net));
      return ofType(circuit, 'resistor').some((component) => {
        const resistor = component as Extract<CircuitComponent, { type: 'resistor' }>;
        const ohms = resistor.props.resistance;
        if (check.ohms && (ohms < check.ohms[0] || ohms > check.ohms[1])) return false;
        const a = netOf(resistor.pins.a);
        const b = netOf(resistor.pins.b);
        if (a === b) return false;
        return (from.includes(a) && to.includes(b)) || (from.includes(b) && to.includes(a));
      });
    }
    case 'prop': {
      const parts = ofType(circuit, check.part);
      const passes = (component: CircuitComponent) =>
        compare((component.props as Record<string, unknown>)[check.prop], check);
      return check.every ? parts.length > 0 && parts.every(passes) : parts.some(passes);
    }
    case 'program':
      return boardWorld(world, check.unit).uploadedStarter === check.starter;
    case 'running':
      return world.running;
    case 'no-errors':
      return result !== null && !result.diagnostics.some((d) => d.severity === 'error');
    case 'reading': {
      const parts = ofType(circuit, check.part);
      const passes = (component: CircuitComponent) =>
        compare(field(result?.readings[component.id], check.path), check);
      return check.every ? parts.length > 0 && parts.every(passes) : parts.some(passes);
    }
    case 'serial':
      return new RegExp(check.matches, 'u').test(boardWorld(world, check.unit).serial);
    case 'diagnostic':
      return result?.diagnostics.some((d) => d.code === check.code) ?? false;
    case 'sheet-part':
      return (
        (world.sheet?.elements.filter((e) => e.kind === check.type).length ?? 0) >=
        (check.count ?? 1)
      );
    case 'sheet-wired': {
      const sheet = world.sheet;
      if (!sheet) return false;
      const kindOf = (port: string) =>
        sheet.elements.find((e) => e.id === port.split('.')[0])?.kind;
      const matches = (port: string, end: { type: string; port: string }) =>
        kindOf(port) === end.type && (end.port === '*' || port.split('.')[1] === end.port);
      return sheet.wires.some((w) => matches(w.from, check.from) && matches(w.to, check.to));
    }
    case 'sheet-column': {
      const table = world.sheet ? sheetTruthTable(world.sheet) : null;
      if (!table) return false;
      return table.outputs.some(
        (_, o) => table.rows.map((row) => (row.outputs[o] ? '1' : '0')).join('') === check.column,
      );
    }
    case 'sheet-block':
      return (world.sheet?.blocks?.length ?? 0) > 0;
    case 'sheet-value':
      return (world.sheetValues ?? []).some(
        (shown) => shown.type === check.type && shown.value === check.equals,
      );
  }
}

/** How far a step has got: which of its checks hold, and whether all of them do. */
export interface StepStatus {
  checks: boolean[];
  done: boolean;
  /** Events seen so far on this step, by check index; pass back in next time. */
  seen: number[];
}

/**
 * Looks at a step in a new moment. A check about the circuit must hold now; a
 * check about an event holds once it has been seen while on this step.
 */
export function checkStep(
  step: Step,
  world: LessonWorld,
  seen: readonly number[] = [],
): StepStatus {
  const nowSeen = new Set(seen);
  const checks = step.checks.map((check, index) => {
    if (!isEvent(check)) return evaluate(check, world);
    if (nowSeen.has(index)) return true;
    const holds = evaluate(check, world);
    if (holds) nowSeen.add(index);
    return holds;
  });
  return { checks, done: checks.every(Boolean), seen: [...nowSeen].sort((a, b) => a - b) };
}

/** A check on how the circuit is built, from one of a lesson's steps. */
export interface WiringCheck {
  /** The step it comes from, counted from 0. */
  step: number;
  check: Extract<Check, { kind: 'part' | 'connected' }>;
}

/**
 * What a lesson has asked to be built by this step (D-110): the parts and
 * connections of this step and every one before it. Run pressed with any of
 * them unmet, the lab says so before the circuit has a chance to puzzle.
 */
export function wiringSoFar(lesson: Lesson, step: number): WiringCheck[] {
  return lesson.steps
    .slice(0, step + 1)
    .flatMap((each, index) =>
      each.checks.flatMap((check) =>
        check.kind === 'part' || check.kind === 'connected' ? [{ step: index, check }] : [],
      ),
    );
}

/** The parts and connections asked for so far that this circuit does not have. */
export function unmetWiring(lesson: Lesson, step: number, circuit: CircuitDocument): WiringCheck[] {
  const world = { circuit, result: null } as unknown as LessonWorld;
  return wiringSoFar(lesson, step).filter(({ check }) => !evaluate(check, world));
}

/**
 * The places on the board an unmet check is about, to point at: both ends of a
 * connection, as far as they are in the circuit. A missing part has none.
 */
export function placesOf(check: WiringCheck['check'], circuit: CircuitDocument): string[] {
  if (check.kind !== 'connected') return [];
  // A board's "gnd" stands for any of its ground sockets, which have names of their own.
  const sockets = (endpoint: string): string[] => {
    const [id, pin] = endpoint.split('.');
    if (pin !== 'gnd') return [endpoint];
    const board = circuit.components.find((component) => component.id === id);
    const all: readonly string[] =
      board?.type === 'esp32' ? ESP32_TERMINALS : board?.type === 'uno' ? UNO_TERMINALS : [];
    return all.filter((name) => name.startsWith('gnd')).map((name) => `${id}.${name}`);
  };
  return [
    ...new Set(
      [...endpoints(circuit, check.from), ...endpoints(circuit, check.to)].flatMap(sockets),
    ),
  ];
}
