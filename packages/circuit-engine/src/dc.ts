import { GMIN, type Device } from './devices';
import { solveLinearSystem } from './linear-solver';
import { MnaSystem, Solution } from './mna';

export interface Circuit {
  /** Number of nodes including ground (node 0). */
  nodeCount: number;
  devices: Device[];
}

export interface DcOptions {
  maxIterations?: number;
  /** Relative tolerance on every unknown. */
  relativeTolerance?: number;
  /** Absolute tolerance on node voltages, volts. */
  voltageTolerance?: number;
  /** Absolute tolerance on branch currents, amperes. */
  currentTolerance?: number;
}

export type DcResult =
  | { ok: true; solution: Solution; iterations: number }
  | { ok: false; reason: 'singular' | 'no-convergence' | 'empty'; iterations: number };

const DEFAULTS: Required<DcOptions> = {
  maxIterations: 200,
  relativeTolerance: 1e-9,
  voltageTolerance: 1e-9,
  currentTolerance: 1e-12,
};

/**
 * DC operating point by Newton-Raphson iteration over the MNA equations.
 *
 * Every node gets GMIN to ground so that a floating part (a common beginner
 * mistake) yields "0 V, no current" instead of an unsolvable system.
 */
export function solveDc(circuit: Circuit, options: DcOptions = {}): DcResult {
  const opts = { ...DEFAULTS, ...options };
  const { nodeCount, devices } = circuit;
  if (nodeCount < 2) return { ok: false, reason: 'empty', iterations: 0 };

  let branchCount = 0;
  for (const device of devices) {
    device.branch = device.branchCount > 0 ? branchCount : -1;
    branchCount += device.branchCount;
    device.reset();
  }

  const system = new MnaSystem(nodeCount, branchCount);
  const voltageUnknowns = nodeCount - 1;
  let x: Float64Array = new Float64Array(system.size);

  for (let iteration = 1; iteration <= opts.maxIterations; iteration++) {
    system.clear();
    const previous = new Solution(x, nodeCount);
    let limited = false;
    for (const device of devices) {
      if (device.stamp(system, previous)) limited = true;
    }
    for (let i = 0; i < voltageUnknowns; i++) system.add(i, i, GMIN);

    const next = Float64Array.from(system.z);
    if (!solveLinearSystem(system.a, next, system.size)) {
      return { ok: false, reason: 'singular', iterations: iteration };
    }

    let converged = !limited;
    if (converged) {
      for (let i = 0; i < system.size; i++) {
        const absolute = i < voltageUnknowns ? opts.voltageTolerance : opts.currentTolerance;
        const tolerance =
          opts.relativeTolerance * Math.max(Math.abs(next[i]), Math.abs(x[i])) + absolute;
        if (Math.abs(next[i] - x[i]) > tolerance) {
          converged = false;
          break;
        }
      }
    }
    x = next;
    if (converged) {
      return { ok: true, solution: new Solution(x, nodeCount), iterations: iteration };
    }
  }
  return { ok: false, reason: 'no-convergence', iterations: opts.maxIterations };
}
