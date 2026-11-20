import type { MnaSystem, Solution } from './mna';

/** Thermal voltage kT/q at 27 °C (300.15 K), the SPICE nominal temperature. */
export const THERMAL_VOLTAGE = (1.380649e-23 * 300.15) / 1.602176634e-19;

/**
 * Tiny conductance placed across every junction, as SPICE does. It keeps a node
 * that hangs off a non-conducting diode solvable, and makes that node follow
 * the diode's other side (0 V across the diode), which is the physical answer.
 */
export const GMIN = 1e-12;

/**
 * A circuit element the solver can stamp. Terminal order defines the positive
 * direction: `current()` is the current flowing from the first terminal,
 * through the device, to the second.
 */
export interface Device {
  readonly id: string;
  readonly kind: 'resistor' | 'voltage-source' | 'thevenin-source' | 'diode' | 'capacitor';
  /** Nodes this device connects, first terminal first. */
  readonly nodes: readonly number[];
  /** Extra MNA unknowns this device needs (voltage sources need one). */
  readonly branchCount: number;
  /** Assigned by the solver before the first stamp. */
  branch: number;
  /** Clears iteration state before a new solve. */
  reset(): void;
  /**
   * Writes the device into the system, linearised around `previous`.
   * Returns true when the device limited its own step, meaning the iteration
   * has not converged yet even if the voltages stopped moving.
   */
  stamp(system: MnaSystem, previous: Solution): boolean;
  current(solution: Solution): number;
  voltage(solution: Solution): number;
  /**
   * Only for devices with memory (capacitors). Called before each solve with
   * the time step in seconds, or null for a DC solve (where time stands still).
   */
  beginStep?(dt: number | null): void;
  /** Called after a time step has been solved, to remember the new state. */
  acceptStep?(solution: Solution): void;
  /** True when the device currently conducts nothing at all (a capacitor at DC). */
  isOpen?(): boolean;
}

export interface Resistor extends Device {
  readonly kind: 'resistor';
  readonly a: number;
  readonly b: number;
  readonly resistance: number;
}

export function resistor(id: string, a: number, b: number, resistance: number): Resistor {
  if (!(resistance > 0) || !Number.isFinite(resistance)) {
    throw new RangeError(`Resistor ${id}: resistance must be a positive number of ohms`);
  }
  const g = 1 / resistance;
  return {
    id,
    kind: 'resistor',
    nodes: [a, b],
    a,
    b,
    resistance,
    branchCount: 0,
    branch: -1,
    reset() {},
    stamp(system) {
      system.stampConductance(a, b, g);
      return false;
    },
    voltage: (s) => s.voltage(a) - s.voltage(b),
    current: (s) => (s.voltage(a) - s.voltage(b)) * g,
  };
}

export interface VoltageSource extends Device {
  readonly kind: 'voltage-source';
  readonly positive: number;
  readonly negative: number;
  readonly volts: number;
}

/**
 * Ideal DC voltage source. `current()` is the current flowing from the positive
 * terminal through the source to the negative terminal, so a source that is
 * delivering power reports a negative value (the SPICE convention).
 */
export function voltageSource(
  id: string,
  positive: number,
  negative: number,
  volts: number,
): VoltageSource {
  if (!Number.isFinite(volts)) throw new RangeError(`Voltage source ${id}: voltage must be finite`);
  const device: VoltageSource = {
    id,
    kind: 'voltage-source',
    nodes: [positive, negative],
    positive,
    negative,
    volts,
    branchCount: 1,
    branch: -1,
    reset() {},
    stamp(system) {
      system.stampVoltageSource(positive, negative, device.branch, volts);
      return false;
    },
    voltage: (s) => s.voltage(positive) - s.voltage(negative),
    current: (s) => s.branchCurrent(device.branch),
  };
  return device;
}

export interface TheveninSource extends Device {
  readonly kind: 'thevenin-source';
  readonly positive: number;
  readonly negative: number;
  readonly volts: number;
  readonly resistance: number;
}

/**
 * A voltage source with a resistance in series: a real battery, or a
 * microcontroller output pin. Stamped as its Norton equivalent, so it adds no
 * extra unknowns. `current()` follows the voltage-source convention: negative
 * while the source is delivering current out of its positive terminal.
 */
export function theveninSource(
  id: string,
  positive: number,
  negative: number,
  volts: number,
  resistance: number,
): TheveninSource {
  if (!Number.isFinite(volts)) throw new RangeError(`Source ${id}: voltage must be finite`);
  if (!(resistance > 0) || !Number.isFinite(resistance)) {
    throw new RangeError(`Source ${id}: series resistance must be a positive number of ohms`);
  }
  const g = 1 / resistance;
  return {
    id,
    kind: 'thevenin-source',
    nodes: [positive, negative],
    positive,
    negative,
    volts,
    resistance,
    branchCount: 0,
    branch: -1,
    reset() {},
    stamp(system) {
      system.stampConductance(positive, negative, g);
      system.stampCurrentSource(negative, positive, volts * g);
      return false;
    },
    voltage: (s) => s.voltage(positive) - s.voltage(negative),
    current: (s) => (s.voltage(positive) - s.voltage(negative) - volts) * g,
  };
}

export interface Capacitor extends Device {
  readonly kind: 'capacitor';
  readonly a: number;
  readonly b: number;
  readonly capacitance: number;
  /** Voltage across the capacitor (a minus b) at the end of the last accepted step. */
  storedVoltage: number;
}

/**
 * Ideal capacitor. In a time step it is replaced by its backward-Euler
 * companion: a conductance C/dt in parallel with a current source that
 * remembers the previous voltage. Backward Euler is first-order accurate and
 * never rings, which suits a teaching simulator. In a DC solve it is an open circuit.
 */
export function capacitor(
  id: string,
  a: number,
  b: number,
  capacitance: number,
  initialVoltage = 0,
): Capacitor {
  if (!(capacitance > 0) || !Number.isFinite(capacitance)) {
    throw new RangeError(`Capacitor ${id}: capacitance must be a positive number of farads`);
  }
  let dt: number | null = null;
  let lastCurrent = 0;
  const device: Capacitor = {
    id,
    kind: 'capacitor',
    nodes: [a, b],
    a,
    b,
    capacitance,
    storedVoltage: initialVoltage,
    branchCount: 0,
    branch: -1,
    reset() {},
    beginStep(step) {
      dt = step;
    },
    isOpen: () => dt === null,
    stamp(system) {
      if (dt === null) return false;
      const g = capacitance / dt;
      system.stampConductance(a, b, g);
      // i = g·(v − vPrevious): the source pushes g·vPrevious from b to a.
      system.stampCurrentSource(b, a, g * device.storedVoltage);
      return false;
    },
    acceptStep(solution) {
      const voltage = solution.voltage(a) - solution.voltage(b);
      lastCurrent = dt === null ? 0 : (capacitance / dt) * (voltage - device.storedVoltage);
      device.storedVoltage = voltage;
    },
    voltage: (s) => s.voltage(a) - s.voltage(b),
    current: () => lastCurrent,
  };
  return device;
}

export interface DiodeModel {
  /** Saturation current Is in amperes. */
  saturationCurrent: number;
  /** Emission coefficient n (ideality factor). */
  emissionCoefficient: number;
}

export interface Diode extends Device {
  readonly kind: 'diode';
  readonly anode: number;
  readonly cathode: number;
  readonly model: DiodeModel;
}

/**
 * Shockley diode: I = Is·(exp(V / (n·Vt)) − 1), with GMIN in parallel.
 *
 * The exponential is linearised each Newton-Raphson iteration. Without step
 * limiting a single bad guess overflows exp(), so the junction voltage is
 * limited with the same `pnjlim` rule SPICE uses.
 */
export function diode(id: string, anode: number, cathode: number, model: DiodeModel): Diode {
  const { saturationCurrent: is, emissionCoefficient: n } = model;
  if (!(is > 0) || !(n > 0)) {
    throw new RangeError(`Diode ${id}: saturation current and emission coefficient must be > 0`);
  }
  const nVt = n * THERMAL_VOLTAGE;
  const vCritical = nVt * Math.log(nVt / (Math.SQRT2 * is));
  let vPrevious = 0;
  let firstIteration = true;

  const junctionCurrent = (v: number) => is * Math.expm1(v / nVt) + GMIN * v;

  return {
    id,
    kind: 'diode',
    nodes: [anode, cathode],
    anode,
    cathode,
    model,
    branchCount: 0,
    branch: -1,
    reset() {
      vPrevious = 0;
      firstIteration = true;
    },
    stamp(system, previous) {
      let v: number;
      let limited: boolean;
      if (firstIteration) {
        // Start at the knee of the curve, as SPICE does, so conducting diodes converge quickly.
        v = vCritical;
        firstIteration = false;
        limited = true;
      } else {
        const vNew = previous.voltage(anode) - previous.voltage(cathode);
        v = limitJunctionVoltage(vNew, vPrevious, nVt, vCritical);
        limited = v !== vNew;
      }
      vPrevious = v;

      const expTerm = Math.exp(v / nVt);
      const g = (is / nVt) * expTerm + GMIN;
      const i = is * (expTerm - 1) + GMIN * v;
      // Linear companion model: i(v) ≈ g·v + iEq
      system.stampConductance(anode, cathode, g);
      system.stampCurrentSource(anode, cathode, i - g * v);
      return limited;
    },
    voltage: (s) => s.voltage(anode) - s.voltage(cathode),
    current: (s) => junctionCurrent(s.voltage(anode) - s.voltage(cathode)),
  };
}

/** SPICE `pnjlim`: keeps a junction voltage from jumping too far up the exponential. */
export function limitJunctionVoltage(
  vNew: number,
  vOld: number,
  nVt: number,
  vCritical: number,
): number {
  if (vNew > vCritical && Math.abs(vNew - vOld) > 2 * nVt) {
    if (vOld > 0) {
      const arg = 1 + (vNew - vOld) / nVt;
      return arg > 0 ? vOld + nVt * Math.log(arg) : vCritical;
    }
    return nVt * Math.log(vNew / nVt);
  }
  return vNew;
}
