import {
  isProgrammable,
  terminalsOf,
  type CircuitComponent,
  type CircuitDocument,
} from '@banglalab/shared';
import { netName, type SimulationResult } from '@banglalab/simulation';
import type { Check, Place, Step } from './schema';

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
}

/** Checks about something that happened while the circuit ran. They count once seen. */
export function isEvent(check: Check): boolean {
  return check.kind === 'reading' || check.kind === 'serial' || check.kind === 'diagnostic';
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
function endpoints(circuit: CircuitDocument, place: Place): string[] {
  if ('board' in place) {
    const board = circuit.components.find(isProgrammable);
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
    case 'prop':
      return ofType(circuit, check.part).some((component) =>
        compare((component.props as Record<string, unknown>)[check.prop], check),
      );
    case 'program':
      return world.uploadedStarter === check.starter;
    case 'running':
      return world.running;
    case 'no-errors':
      return result !== null && !result.diagnostics.some((d) => d.severity === 'error');
    case 'reading':
      return ofType(circuit, check.part).some((component) =>
        compare(field(result?.readings[component.id], check.path), check),
      );
    case 'serial':
      return new RegExp(check.matches, 'u').test(world.serial);
    case 'diagnostic':
      return result?.diagnostics.some((d) => d.code === check.code) ?? false;
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
