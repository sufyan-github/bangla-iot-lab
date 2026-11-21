import { solveDc, type Device, type NpnTransistor, type Solution } from '@banglalab/circuit-engine';
import { boardTerminals, isProgrammable, type CircuitDocument } from '@banglalab/shared';
import { BOARD_MODELS } from './boards';
import {
  BUZZER_ON_VOLTAGE,
  LED_BURN_CURRENT,
  LED_FORWARD_VOLTAGE,
  LED_MAX_CURRENT,
  LED_RATED_CURRENT,
  LED_VISIBLE_CURRENT,
  MOTOR_RATED_VOLTAGE,
  MOTOR_START_VOLTAGE,
  RELAY_DROP_OUT_CURRENT,
  RELAY_PULL_IN_CURRENT,
} from './library';
import { IDLE_STATE, buildNetlist, type CircuitState, type Netlist } from './netlist';

export type LedState = 'off' | 'on' | 'overcurrent' | 'burned' | 'reversed';

export interface Reading {
  /**
   * Volts across the part, averaged over the observed time. LED: anode minus
   * cathode. Battery or board: at its supply terminals. Potentiometer: end to end.
   */
  voltage: number;
  /** Average amperes through the part. For a battery or board: the current it delivers. */
  current: number;
  /** Average watts dissipated (or delivered, for a battery or board). */
  power: number;
  /** Only for LEDs. */
  led?: { state: LedState; brightness: number };
  /**
   * For parts that do something you can see or hear: 1 while a buzzer sounds or
   * a relay's contact is closed, and a motor's speed from −1 (full speed backwards) to 1.
   */
  activity?: number;
  /** Servo horn position in degrees (0-180), once a program has set it. */
  angle?: number;
  /** What a character LCD is showing: its two lines of sixteen characters. */
  lcd?: { lines: [string, string] };
}

export type DiagnosticCode =
  | 'no-battery'
  | 'open-circuit'
  | 'short-circuit'
  | 'supply-short'
  | 'led-reversed'
  | 'led-overcurrent'
  | 'led-burned'
  | 'led-bypassed'
  | 'led-low-voltage'
  | 'legs-in-same-strip'
  | 'pin-overcurrent'
  | 'solver-failed';

export interface Diagnostic {
  code: DiagnosticCode;
  severity: 'info' | 'warning' | 'error';
  /** The part the message is about, when there is one. */
  componentId?: string;
  /** For `pin-overcurrent`: the board socket, e.g. "d13". */
  socket?: string;
}

export interface SimulationResult {
  /** False only when the solver could not find an answer. */
  ok: boolean;
  readings: Record<string, Reading>;
  /** Average amperes in each wire; positive means flowing from `from` to `to`. */
  wireCurrents: Record<string, number>;
  /** Board sockets in use, keyed "UNO1.d13": volts above GND and amperes flowing out of the socket. */
  sockets: Record<string, { voltage: number; current: number }>;
  /**
   * Average volts above ground at every net that something is connected to,
   * keyed by `netName`. A hole that is missing here is joined to nothing.
   */
  nodeVoltages: Record<string, number>;
  /**
   * Average amperes flowing into each part through each of its legs, keyed
   * "R1.a" or "UNO1.d13". A part's legs add up to zero: what goes in comes out.
   */
  legCurrents: Record<string, number>;
  diagnostics: Diagnostic[];
  iterations: number;
}

interface Sample {
  voltage: number;
  current: number;
}

/** The circuit solved for one instant: one combination of pin levels and button presses. */
export interface StateSolution {
  parts: Record<string, Sample>;
  wires: Record<string, number>;
  sockets: Record<string, Sample>;
  /** Volts at every net, by net name. */
  nodes: Record<string, number>;
  /** Amperes into each part through each leg, keyed "R1.a". */
  legs: Record<string, number>;
  /** Batteries pushed below half their voltage, or a board supply past its limit. */
  shorted: string[];
  /** True when any source is delivering or absorbing a noticeable current. */
  delivering: boolean;
  bridged: string[];
  /** Which relay contacts are closed in this state. */
  relays: Record<string, boolean>;
  iterations: number;
}

/** A battery pushed below half its voltage is feeding less resistance than its own. */
const SHORT_CIRCUIT_SAG = 0.5;
const NEGLIGIBLE_CURRENT = 1e-6;
const REVERSED_VOLTAGE = -0.5;

/**
 * Works out which relay contacts should be closed for the coil currents just
 * solved. A closed contact holds on until its coil current drops well below
 * the level needed to close it.
 */
export function relayStates(
  document: CircuitDocument,
  solution: StateSolution,
  current: Readonly<Record<string, boolean>>,
): Record<string, boolean> {
  const next: Record<string, boolean> = {};
  for (const component of document.components) {
    if (component.type !== 'relay') continue;
    const coil = Math.abs(solution.parts[component.id]?.current ?? 0);
    next[component.id] = current[component.id]
      ? coil > RELAY_DROP_OUT_CURRENT
      : coil >= RELAY_PULL_IN_CURRENT;
  }
  return next;
}

const sameStates = (a: Readonly<Record<string, boolean>>, b: Readonly<Record<string, boolean>>) =>
  Object.keys(b).every((id) => Boolean(a[id]) === b[id]);

/**
 * Solves the settled (DC) circuit for one state. Returns null when no solution
 * exists. Relays are re-solved until their contacts agree with their coil
 * currents; a relay wired to interrupt its own coil never agrees, so the
 * search stops after a few rounds with the last answer.
 */
export function solveState(document: CircuitDocument, state: CircuitState): StateSolution | null {
  let relays = state.relays ?? {};
  let solution: StateSolution | null = null;
  for (let round = 0; round < 4; round++) {
    const netlist = buildNetlist(document, { ...state, relays });
    const dc = solveDc(netlist.circuit);
    if (!dc.ok) return null;
    solution = readSolution(document, netlist, dc.solution, dc.iterations);
    const next = relayStates(document, solution, relays);
    solution.relays = next;
    if (sameStates(relays, next)) break;
    relays = next;
  }
  return solution;
}

/** Turns solver output back into per-part, per-wire and per-socket values. */
export function readSolution(
  document: CircuitDocument,
  netlist: Netlist,
  solution: Solution,
  iterations: number,
): StateSolution {
  const volts = (endpoint: string) => {
    const node = netlist.nodeOf(endpoint);
    return node < 0 ? 0 : solution.voltage(node);
  };

  const result: StateSolution = {
    parts: {},
    wires: {},
    sockets: {},
    nodes: {},
    legs: {},
    shorted: [],
    delivering: false,
    bridged: netlist.bridgedParts,
    relays: {},
    iterations,
  };

  for (const [socket, device] of netlist.socketDevice) {
    // Both pin models report current flowing into the board as positive; flip it.
    const current = -device.current(solution);
    result.sockets[socket] = { voltage: device.voltage(solution), current };
    if (Math.abs(current) > NEGLIGIBLE_CURRENT) result.delivering = true;
  }

  for (const component of document.components) {
    const { id } = component;
    const device = netlist.partDevice.get(id);
    switch (component.type) {
      case 'battery': {
        const current = device ? -device.current(solution) : 0;
        const voltage = volts(`${id}.pos`) - volts(`${id}.neg`);
        result.parts[id] = { voltage, current };
        if (Math.abs(current) > NEGLIGIBLE_CURRENT) result.delivering = true;
        if (current > 0 && voltage < component.props.voltage * SHORT_CIRCUIT_SAG) {
          result.shorted.push(id);
        }
        break;
      }
      case 'uno':
      case 'esp32': {
        const model = BOARD_MODELS[component.type];
        let current = 0;
        for (const terminal of boardTerminals(component.type)) {
          current += Math.max(0, result.sockets[`${id}.${terminal}`]?.current ?? 0);
        }
        const main = model.supplies[0]!;
        const supply = result.sockets[`${id}.${main.terminal}`];
        result.parts[id] = { voltage: supply?.voltage ?? main.volts, current };
        const overloaded = model.supplies.some(
          (s) => (result.sockets[`${id}.${s.terminal}`]?.current ?? 0) > s.maxCurrent,
        );
        if (overloaded) result.shorted.push(id);
        break;
      }
      case 'potentiometer':
        result.parts[id] = {
          voltage: volts(component.pins.a) - volts(component.pins.b),
          current: device?.current(solution) ?? 0,
        };
        break;
      case 'button':
      case 'switch':
        // Open contacts have no device, but the voltage across them is still meaningful.
        result.parts[id] = {
          voltage: volts(component.pins.a) - volts(component.pins.b),
          current: device?.current(solution) ?? 0,
        };
        break;
      case 'temperature':
      case 'soil':
      case 'ir':
        // What matters for a sensor is its output signal; the current is what it draws.
        result.parts[id] = {
          voltage: volts(component.pins.out) - volts(component.pins.gnd),
          current: device?.current(solution) ?? 0,
        };
        break;
      default:
        result.parts[id] = {
          voltage: device?.voltage(solution) ?? 0,
          current: device?.current(solution) ?? 0,
        };
    }
  }

  for (const wire of document.wires) {
    result.wires[wire.id] = netlist.wireDevice.get(wire.id)?.current(solution) ?? 0;
  }

  for (const [name, node] of netlist.nodeNames) result.nodes[name] = solution.voltage(node);

  // Current into a device at one of its nodes. A device's current runs from its first
  // terminal to its second; a transistor has a collector and a base current, and the
  // emitter carries both back out.
  const entering = (device: Device, node: number): number => {
    const [first, second, third] = device.nodes;
    if (third !== undefined && 'baseCurrent' in device) {
      const collector = device.current(solution);
      const base = (device as NpnTransistor).baseCurrent(solution);
      return (
        (first === node ? collector : 0) +
        (second === node ? base : 0) -
        (third === node ? collector + base : 0)
      );
    }
    const current = device.current(solution);
    return (first === node ? current : 0) - (second === node ? current : 0);
  };
  for (const component of document.components) {
    const { id } = component;
    if (component.type === 'battery') {
      const current = netlist.partDevice.get(id)?.current(solution) ?? 0;
      result.legs[`${id}.pos`] = current;
      result.legs[`${id}.neg`] = -current;
    } else if (isProgrammable(component)) {
      let total = 0;
      for (const [socket, device] of netlist.socketDevice) {
        if (!socket.startsWith(`${id}.`)) continue;
        result.legs[socket] = device.current(solution);
        total += result.legs[socket];
      }
      // Whatever goes into the board through its pins comes back out through ground.
      result.legs[`${id}.gnd`] = -total;
    } else {
      // A part may be several devices (a potentiometer is two resistors): add up those at each leg.
      const own = netlist.circuit.devices.filter(
        (device) => device.id === id || device.id.startsWith(`${id}:`),
      );
      const counted = new Set<number>();
      for (const [pin, hole] of Object.entries(component.pins)) {
        const node = netlist.nodeOf(hole);
        // Legs sharing a strip share a node; its current is reported once, on the first of them.
        const fresh = node >= 0 && !counted.has(node);
        counted.add(node);
        result.legs[`${id}.${pin}`] = fresh
          ? own.reduce((sum, device) => sum + entering(device, node), 0)
          : 0;
      }
    }
  }
  return result;
}

/**
 * What was observed over a stretch of time: each state the circuit was in and
 * for how long. A circuit without a running program has a single state.
 */
export class Observation {
  private readonly durations = new Map<StateSolution, number>();
  private failed = false;

  get isEmpty(): boolean {
    return this.durations.size === 0 && !this.failed;
  }

  add(solution: StateSolution | null, duration: number): void {
    if (solution === null) this.failed = true;
    else if (duration > 0) {
      this.durations.set(solution, (this.durations.get(solution) ?? 0) + duration);
    }
  }

  /** Summarises the observation as readings and plain diagnostics. */
  interpret(document: CircuitDocument, options: { timeDependent: boolean }): SimulationResult {
    const result: SimulationResult = {
      ok: !this.failed,
      readings: {},
      wireCurrents: {},
      sockets: {},
      nodeVoltages: {},
      legCurrents: {},
      diagnostics: [],
      iterations: 0,
    };
    if (this.failed) {
      result.diagnostics.push({ code: 'solver-failed', severity: 'error' });
      return result;
    }
    const states = [...this.durations];
    const total = states.reduce((sum, [, duration]) => sum + duration, 0);
    if (total === 0) return result;

    /** Time-weighted average of a value across the observed states. */
    const average = (pick: (s: StateSolution) => number) =>
      states.length === 1
        ? pick(states[0]![0]) // steady circuit: exact, no rounding from the weighting
        : states.reduce((sum, [s, duration]) => sum + pick(s) * duration, 0) / total;
    const extreme = (pick: (s: StateSolution) => number, best: (...v: number[]) => number) =>
      best(...states.map(([s]) => pick(s)));
    const first = states[0]![0];
    result.iterations = first.iterations;

    for (const componentId of first.bridged) {
      result.diagnostics.push({ code: 'legs-in-same-strip', severity: 'warning', componentId });
    }

    const sources = document.components.filter((c) => c.type === 'battery' || isProgrammable(c));
    if (sources.length === 0) result.diagnostics.push({ code: 'no-battery', severity: 'info' });

    const shorted = new Set(states.flatMap(([s]) => s.shorted));
    for (const componentId of shorted) {
      const isBoard = document.components.some((c) => c.id === componentId && isProgrammable(c));
      result.diagnostics.push({
        code: isBoard ? 'supply-short' : 'short-circuit',
        severity: 'error',
        componentId,
      });
    }

    for (const socket of Object.keys(first.sockets)) {
      const voltage = average((s) => s.sockets[socket]!.voltage);
      const current = average((s) => s.sockets[socket]!.current);
      result.sockets[socket] = { voltage, current };
      const [componentId, name] = socket.split('.') as [string, string];
      const peak = extreme((s) => Math.abs(s.sockets[socket]!.current), Math.max);
      const owner = document.components.find((c) => c.id === componentId);
      const model = owner && isProgrammable(owner) ? BOARD_MODELS[owner.type] : null;
      const isSupply = model?.supplies.some((s) => s.terminal === name) ?? false;
      if (model && !isSupply && peak > model.maxPinCurrent) {
        result.diagnostics.push({
          code: 'pin-overcurrent',
          severity: 'error',
          componentId,
          socket: name,
        });
      }
    }

    let reversedLed = false;
    for (const component of document.components) {
      const { id } = component;
      if (!(id in first.parts)) continue;
      const reading: Reading = {
        voltage: average((s) => s.parts[id]!.voltage),
        current: average((s) => s.parts[id]!.current),
        power: average((s) => s.parts[id]!.voltage * s.parts[id]!.current),
      };
      if (component.type === 'led') {
        // Damage depends on the worst instant; brightness on the average (as the eye sees PWM).
        const peak = extreme((s) => s.parts[id]!.current, Math.max);
        const lowest = extreme((s) => s.parts[id]!.voltage, Math.min);
        let state: LedState = 'off';
        if (peak > LED_BURN_CURRENT) state = 'burned';
        else if (peak > LED_MAX_CURRENT) state = 'overcurrent';
        else if (reading.current >= LED_VISIBLE_CURRENT) state = 'on';
        else if (lowest < REVERSED_VOLTAGE) state = 'reversed';
        const lit = state === 'on' || state === 'overcurrent';
        reading.led = {
          state,
          brightness: lit ? Math.min(1, Math.sqrt(reading.current / LED_RATED_CURRENT)) : 0,
        };
        if (state === 'reversed') {
          reversedLed = true;
          result.diagnostics.push({ code: 'led-reversed', severity: 'warning', componentId: id });
        } else if (state === 'burned') {
          result.diagnostics.push({ code: 'led-burned', severity: 'error', componentId: id });
        } else if (state === 'overcurrent') {
          result.diagnostics.push({
            code: 'led-overcurrent',
            severity: 'warning',
            componentId: id,
          });
        }
      }
      if (component.type === 'relay') {
        reading.activity = average((s) => (s.relays[id] ? 1 : 0)) >= 0.5 ? 1 : 0;
      } else if (component.type === 'buzzer') {
        reading.activity = reading.voltage >= BUZZER_ON_VOLTAGE ? 1 : 0;
      } else if (component.type === 'motor') {
        const turning = Math.abs(reading.voltage) >= MOTOR_START_VOLTAGE;
        reading.activity = turning
          ? Math.max(-1, Math.min(1, reading.voltage / MOTOR_RATED_VOLTAGE))
          : 0;
      }
      result.readings[id] = reading;
    }

    for (const wire of document.wires) {
      result.wireCurrents[wire.id] = average((s) => s.wires[wire.id] ?? 0);
    }
    for (const name of Object.keys(first.nodes)) {
      result.nodeVoltages[name] = average((s) => s.nodes[name] ?? 0);
    }
    for (const leg of Object.keys(first.legs)) {
      result.legCurrents[leg] = average((s) => s.legs[leg] ?? 0);
    }

    // The "why is this LED dark?" explanations assume a steady circuit. While a program is
    // running an LED is often dark simply because its pin is LOW, and a charged capacitor
    // rightly stops the current, so in those cases they are held back.
    const delivering = states.some(([s]) => s.delivering);
    let underpowered = false;
    if (shorted.size === 0 && !options.timeDependent) {
      for (const component of document.components) {
        if (component.type !== 'led' || first.bridged.includes(component.id)) continue;
        const reading = result.readings[component.id];
        if (reading?.led?.state !== 'off') continue;
        const forwardBiased = reading.voltage > LED_FORWARD_VOLTAGE[component.props.color] * 0.3;
        if (forwardBiased) underpowered = true;
        else if (!delivering) continue; // nothing flows anywhere: reported once as an open circuit
        result.diagnostics.push({
          code: forwardBiased ? 'led-low-voltage' : 'led-bypassed',
          severity: 'warning',
          componentId: component.id,
        });
      }
    }

    const hasLoad = document.components.length > sources.length || document.wires.length > 0;
    if (
      sources.length > 0 &&
      hasLoad &&
      !delivering &&
      shorted.size === 0 &&
      !reversedLed &&
      !underpowered &&
      !options.timeDependent
    ) {
      result.diagnostics.push({ code: 'open-circuit', severity: 'info' });
    }
    return result;
  }
}

/**
 * Solves the settled behaviour of a circuit and explains what it found: what a
 * meter shows after everything has stopped changing (capacitors fully charged).
 * Pure and synchronous. To follow a program or a capacitor through time use `SimulationSession`.
 */
export function simulate(
  document: CircuitDocument,
  state: CircuitState = IDLE_STATE,
): SimulationResult {
  const observation = new Observation();
  if (document.components.length > 0) observation.add(solveState(document, state), 1);
  const timeDependent = document.components.some((c) => c.type === 'capacitor');
  return observation.interpret(document, { timeDependent });
}
