import type { Device } from './devices';
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
 * Finds the parts of the circuit that have no connection to ground at all and
 * returns one node from each. Such an island (a common beginner mistake: parts
 * placed but not wired to the battery) has no defined voltage relative to
 * ground, which would make the equations unsolvable. Tying one of its nodes to
 * ground fixes the reference without changing any current, because no current
 * can flow between unconnected islands.
 */
function islandAnchors(circuit: Circuit): number[] {
  const parent = Int32Array.from({ length: circuit.nodeCount }, (_, i) => i);
  const find = (node: number): number => {
    while (parent[node] !== node) {
      parent[node] = parent[parent[node]];
      node = parent[node];
    }
    return node;
  };
  for (const device of circuit.devices) {
    const first = find(device.nodes[0]);
    for (const node of device.nodes) parent[find(node)] = first;
  }
  const ground = find(0);
  const anchors = new Map<number, number>();
  for (let node = 1; node < circuit.nodeCount; node++) {
    const root = find(node);
    if (root !== ground && !anchors.has(root)) anchors.set(root, node);
  }
  return [...anchors.values()];
}

/**
 * DC operating point by Newton-Raphson iteration over the MNA equations.
 * Parts that are not connected to anything solve to "no current" instead of failing.
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
  const anchors = islandAnchors(circuit);
  let x: Float64Array = new Float64Array(system.size);

  for (let iteration = 1; iteration <= opts.maxIterations; iteration++) {
    system.clear();
    const previous = new Solution(x, nodeCount);
    let limited = false;
    for (const device of devices) {
      if (device.stamp(system, previous)) limited = true;
    }
    for (const node of anchors) system.stampConductance(node, 0, 1);

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
