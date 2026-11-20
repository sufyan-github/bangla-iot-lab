import { solveDc } from '@banglalab/circuit-engine';
import type { CircuitDocument } from '@banglalab/shared';
import {
  LED_FORWARD_VOLTAGE,
  LED_BURN_CURRENT,
  LED_MAX_CURRENT,
  LED_RATED_CURRENT,
  LED_VISIBLE_CURRENT,
} from './library';
import { buildNetlist } from './netlist';

export type LedState = 'off' | 'on' | 'overcurrent' | 'burned' | 'reversed';

export interface Reading {
  /** Volts across the part. For an LED: anode minus cathode. For a battery: at its terminals. */
  voltage: number;
  /** Amperes through the part. For a battery: current it delivers. */
  current: number;
  /** Watts dissipated (or, for a battery, delivered). */
  power: number;
  /** Only for LEDs. */
  led?: { state: LedState; brightness: number };
}

export type DiagnosticCode =
  | 'no-battery'
  | 'open-circuit'
  | 'short-circuit'
  | 'led-reversed'
  | 'led-overcurrent'
  | 'led-burned'
  | 'led-bypassed'
  | 'led-low-voltage'
  | 'legs-in-same-strip'
  | 'solver-failed';

export interface Diagnostic {
  code: DiagnosticCode;
  severity: 'info' | 'warning' | 'error';
  /** The part the message is about, when there is one. */
  componentId?: string;
}

export interface SimulationResult {
  /** False only when the solver could not find an answer. */
  ok: boolean;
  readings: Record<string, Reading>;
  /** Amperes in each wire; positive means flowing from `from` to `to`. */
  wireCurrents: Record<string, number>;
  diagnostics: Diagnostic[];
  iterations: number;
}

/** A battery pushed below half its voltage is feeding less resistance than its own. */
const SHORT_CIRCUIT_SAG = 0.5;
const NEGLIGIBLE_CURRENT = 1e-6;
const REVERSED_VOLTAGE = -0.5;

function ledState(voltage: number, current: number): LedState {
  if (voltage < REVERSED_VOLTAGE) return 'reversed';
  if (current > LED_BURN_CURRENT) return 'burned';
  if (current > LED_MAX_CURRENT) return 'overcurrent';
  return current >= LED_VISIBLE_CURRENT ? 'on' : 'off';
}

/** Perceived brightness 0..1. The eye responds roughly to the square root of current. */
function ledBrightness(state: LedState, current: number): number {
  if (state === 'off' || state === 'reversed' || state === 'burned') return 0;
  return Math.min(1, Math.sqrt(current / LED_RATED_CURRENT));
}

/**
 * Solves the DC behaviour of a circuit document and explains what it found.
 * Pure and synchronous: the web app calls it from a Web Worker.
 */
export function simulate(document: CircuitDocument): SimulationResult {
  const result: SimulationResult = {
    ok: true,
    readings: {},
    wireCurrents: {},
    diagnostics: [],
    iterations: 0,
  };
  if (document.components.length === 0) return result;

  const netlist = buildNetlist(document);
  for (const componentId of netlist.bridgedParts) {
    result.diagnostics.push({ code: 'legs-in-same-strip', severity: 'warning', componentId });
  }

  const batteries = document.components.filter((c) => c.type === 'battery');
  if (batteries.length === 0) {
    result.diagnostics.push({ code: 'no-battery', severity: 'info' });
  }

  const dc = solveDc(netlist.circuit);
  result.iterations = dc.iterations;
  if (!dc.ok) {
    result.ok = false;
    result.diagnostics.push({ code: 'solver-failed', severity: 'error' });
    return result;
  }
  const { solution } = dc;

  let shorted = false;
  let delivering = false;
  let reversedLed = false;

  for (const component of document.components) {
    const device = netlist.deviceOf.get(component.id);
    if (!device) continue;

    if (component.type === 'battery') {
      // The series-resistance device runs from the internal node to the + terminal,
      // so its current is the current the battery delivers.
      const current = device.current(solution);
      const voltage =
        solution.voltage(netlist.nodeOf(`${component.id}.pos`)) -
        solution.voltage(netlist.nodeOf(`${component.id}.neg`));
      result.readings[component.id] = { voltage, current, power: voltage * current };
      if (Math.abs(current) > NEGLIGIBLE_CURRENT) delivering = true;
      if (current > 0 && voltage < component.props.voltage * SHORT_CIRCUIT_SAG) {
        shorted = true;
        result.diagnostics.push({
          code: 'short-circuit',
          severity: 'error',
          componentId: component.id,
        });
      }
      continue;
    }

    const voltage = device.voltage(solution);
    const current = device.current(solution);
    const reading: Reading = { voltage, current, power: voltage * current };
    if (component.type === 'led') {
      const state = ledState(voltage, current);
      reading.led = { state, brightness: ledBrightness(state, current) };
      if (state === 'reversed') {
        reversedLed = true;
        result.diagnostics.push({
          code: 'led-reversed',
          severity: 'warning',
          componentId: component.id,
        });
      } else if (state === 'burned') {
        result.diagnostics.push({
          code: 'led-burned',
          severity: 'error',
          componentId: component.id,
        });
      } else if (state === 'overcurrent') {
        result.diagnostics.push({
          code: 'led-overcurrent',
          severity: 'warning',
          componentId: component.id,
        });
      }
    }
    result.readings[component.id] = reading;
  }

  for (const wire of document.wires) {
    result.wireCurrents[wire.id] = netlist.deviceOf.get(wire.id)?.current(solution) ?? 0;
  }

  // An LED that stays dark in a powered circuit gets its own explanation: either it is
  // forward-biased but below the voltage its colour needs, or the current is going round it.
  let underpowered = false;
  if (!shorted) {
    for (const component of document.components) {
      if (component.type !== 'led' || netlist.bridgedParts.includes(component.id)) continue;
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

  const hasLoad = document.components.length > batteries.length || document.wires.length > 0;
  if (batteries.length > 0 && hasLoad && !delivering && !shorted && !reversedLed && !underpowered) {
    result.diagnostics.push({ code: 'open-circuit', severity: 'info' });
  }
  return result;
}
