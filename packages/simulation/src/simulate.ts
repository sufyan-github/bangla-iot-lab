import { solveDc, type Solution } from '@banglalab/circuit-engine';
import { UNO_TERMINALS, type CircuitDocument } from '@banglalab/shared';
import {
  LED_BURN_CURRENT,
  LED_FORWARD_VOLTAGE,
  LED_MAX_CURRENT,
  LED_RATED_CURRENT,
  LED_VISIBLE_CURRENT,
  PIN_MAX_CURRENT,
  SUPPLY_MAX_CURRENT,
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
  /** Batteries pushed below half their voltage, or a board supply past its limit. */
  shorted: string[];
  /** True when any source is delivering or absorbing a noticeable current. */
  delivering: boolean;
  bridged: string[];
  iterations: number;
}

/** A battery pushed below half its voltage is feeding less resistance than its own. */
const SHORT_CIRCUIT_SAG = 0.5;
const NEGLIGIBLE_CURRENT = 1e-6;
const REVERSED_VOLTAGE = -0.5;

/** Solves the settled (DC) circuit for one state. Returns null when no solution exists. */
export function solveState(document: CircuitDocument, state: CircuitState): StateSolution | null {
  const netlist = buildNetlist(document, state);
  const dc = solveDc(netlist.circuit);
  return dc.ok ? readSolution(document, netlist, dc.solution, dc.iterations) : null;
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
    shorted: [],
    delivering: false,
    bridged: netlist.bridgedParts,
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
      case 'uno': {
        let current = 0;
        for (const terminal of UNO_TERMINALS) {
          current += Math.max(0, result.sockets[`${id}.${terminal}`]?.current ?? 0);
        }
        const supply = result.sockets[`${id}.5v`];
        result.parts[id] = { voltage: supply?.voltage ?? 5, current };
        if ((supply?.current ?? 0) > SUPPLY_MAX_CURRENT) result.shorted.push(id);
        break;
      }
      case 'potentiometer':
        result.parts[id] = {
          voltage: volts(component.pins.a) - volts(component.pins.b),
          current: device?.current(solution) ?? 0,
        };
        break;
      case 'button':
        result.parts[id] = {
          voltage: volts(component.pins.a) - volts(component.pins.b),
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

    const sources = document.components.filter((c) => c.type === 'battery' || c.type === 'uno');
    if (sources.length === 0) result.diagnostics.push({ code: 'no-battery', severity: 'info' });

    const shorted = new Set(states.flatMap(([s]) => s.shorted));
    for (const componentId of shorted) {
      const isBoard = document.components.some((c) => c.id === componentId && c.type === 'uno');
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
      if (name !== '5v' && peak > PIN_MAX_CURRENT) {
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
      result.readings[id] = reading;
    }

    for (const wire of document.wires) {
      result.wireCurrents[wire.id] = average((s) => s.wires[wire.id] ?? 0);
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
