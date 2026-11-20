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

/** An iteration that changes by less than this (volts) and no longer shrinks has hit round-off. */
const STALL_SIZE = 1e-3;
const STALL_ROUNDS = 6;

const DEFAULTS: Required<DcOptions> = {
  maxIterations: 200,
  relativeTolerance: 1e-9,
  voltageTolerance: 1e-9,
  currentTolerance: 1e-12,
};

interface Pruning {
  /** Devices left out of the equations because one of their ends is connected to nothing. */
  skipped: Set<Device>;
  /** For each removed node, the node whose voltage it simply follows. */
  followers: { node: number; follows: number }[];
}

/**
 * Removes dangling parts from the equations: a resistor or diode with one end
 * connected to nothing else carries no current, so that end sits at the same
 * voltage as the connected end. This is the most common beginner situation (a
 * part with one leg not yet wired), and solving it literally is numerically
 * hopeless: the loose node would be held only by picoampere leakage beside
 * ordinary resistances, and round-off noise swamps the answer. Peeling repeats,
 * so a whole dangling chain (wire, resistor, LED...) is removed end to end.
 */
function pruneDangling(circuit: Circuit): Pruning {
  const attached: Device[][] = Array.from({ length: circuit.nodeCount }, () => []);
  for (const device of circuit.devices) {
    if (device.isOpen?.()) continue;
    for (const node of device.nodes) attached[node].push(device);
  }
  const skipped = new Set<Device>();
  const followers: Pruning['followers'] = [];
  const live = (node: number) => attached[node].filter((d) => !skipped.has(d));

  const queue: number[] = [];
  for (let node = 1; node < circuit.nodeCount; node++)
    if (attached[node].length === 1) queue.push(node);
  while (queue.length > 0) {
    const node = queue.pop()!;
    const devices = live(node);
    if (devices.length !== 1) continue;
    const device = devices[0];
    if (device.kind !== 'resistor' && device.kind !== 'diode') continue;
    const [first, second] = device.nodes;
    if (first === second) continue;
    const follows = first === node ? second : first;
    skipped.add(device);
    followers.push({ node, follows });
    if (follows !== 0 && live(follows).length === 1) queue.push(follows);
  }
  return { skipped, followers };
}

/**
 * Finds the parts of the circuit that have no connection to ground at all and
 * returns one node from each. Such an island (parts placed but not wired to the
 * battery) has no defined voltage relative to ground, which would make the
 * equations unsolvable. Tying one of its nodes to ground fixes the reference
 * without changing any current, because no current can flow between
 * unconnected islands.
 */
function islandAnchors(circuit: Circuit, pruning: Pruning): number[] {
  const parent = Int32Array.from({ length: circuit.nodeCount }, (_, i) => i);
  const find = (node: number): number => {
    while (parent[node] !== node) {
      parent[node] = parent[parent[node]];
      node = parent[node];
    }
    return node;
  };
  for (const device of circuit.devices) {
    if (device.isOpen?.() || pruning.skipped.has(device)) continue; // joins nothing
    const first = find(device.nodes[0]);
    for (const node of device.nodes) parent[find(node)] = first;
  }
  const following = new Set<number>();
  for (const { node, follows } of pruning.followers) {
    parent[find(node)] = find(follows);
    following.add(node);
  }
  const ground = find(0);
  const anchors = new Map<number, number>();
  for (let node = 1; node < circuit.nodeCount; node++) {
    const root = find(node);
    // A follower's equation is already "equal to my neighbour"; anchor a real node instead.
    if (root !== ground && !anchors.has(root) && !following.has(node)) anchors.set(root, node);
  }
  return [...anchors.values()];
}

/**
 * DC operating point: the state the circuit settles into when nothing changes.
 * Capacitors are open circuits. Parts that are not connected to anything solve
 * to "no current" instead of failing.
 */
export function solveDc(circuit: Circuit, options: DcOptions = {}): DcResult {
  for (const device of circuit.devices) device.beginStep?.(null);
  return newtonSolve(circuit, options);
}

/**
 * Advances the circuit by one time step of `dt` seconds (backward Euler) from
 * the state its capacitors hold, and stores the new state in them. Call
 * repeatedly to follow the circuit through time.
 */
export function solveTimeStep(circuit: Circuit, dt: number, options: DcOptions = {}): DcResult {
  if (!(dt > 0)) throw new RangeError('Time step must be positive');
  for (const device of circuit.devices) device.beginStep?.(dt);
  const result = newtonSolve(circuit, options);
  if (result.ok) for (const device of circuit.devices) device.acceptStep?.(result.solution);
  return result;
}

/** Newton-Raphson iteration over the MNA equations, shared by DC and time-step solves. */
function newtonSolve(circuit: Circuit, options: DcOptions): DcResult {
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
  const pruning = pruneDangling(circuit);
  const anchors = islandAnchors(circuit, pruning);
  let x: Float64Array = new Float64Array(system.size);
  let previousChange = Infinity;
  let stalled = 0;

  for (let iteration = 1; iteration <= opts.maxIterations; iteration++) {
    system.clear();
    const previous = new Solution(x, nodeCount);
    let limited = false;
    for (const device of devices) {
      if (!pruning.skipped.has(device) && device.stamp(system, previous)) limited = true;
    }
    for (const { node, follows } of pruning.followers) {
      system.add(system.nodeIndex(node), system.nodeIndex(node), 1);
      system.add(system.nodeIndex(node), system.nodeIndex(follows), -1);
    }
    for (const node of anchors) system.stampConductance(node, 0, 1);

    const next = Float64Array.from(system.z);
    if (!solveLinearSystem(system.a, next, system.size)) {
      return { ok: false, reason: 'singular', iterations: iteration };
    }

    let largestChange = 0;
    for (let i = 0; i < system.size; i++)
      largestChange = Math.max(largestChange, Math.abs(next[i] - x[i]));
    // Some nodes are legitimately held only by leakage (for example the junction of two
    // LEDs wired back to back). Their voltage is then known only to round-off accuracy and
    // never meets the tolerance; once the iteration has stopped improving at a negligible
    // size, that is the answer.
    stalled =
      !limited && largestChange < STALL_SIZE && largestChange > 0.5 * previousChange
        ? stalled + 1
        : 0;
    previousChange = largestChange;

    let converged = !limited;
    if (converged && stalled < STALL_ROUNDS) {
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
