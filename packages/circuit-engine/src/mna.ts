/**
 * Modified Nodal Analysis system: A·x = z.
 *
 * Unknowns are the voltages of every node except ground (node 0), followed by
 * one branch current per voltage source. Devices write into the system through
 * the stamping helpers below and never touch the arrays directly.
 */
export class MnaSystem {
  readonly size: number;
  readonly a: Float64Array;
  readonly z: Float64Array;

  constructor(
    /** Number of nodes including ground. */
    readonly nodeCount: number,
    readonly branchCount: number,
  ) {
    this.size = nodeCount - 1 + branchCount;
    this.a = new Float64Array(this.size * this.size);
    this.z = new Float64Array(this.size);
  }

  clear(): void {
    this.a.fill(0);
    this.z.fill(0);
  }

  /** Row/column of a node voltage; -1 for ground, which has no unknown. */
  nodeIndex(node: number): number {
    return node - 1;
  }

  branchIndex(branch: number): number {
    return this.nodeCount - 1 + branch;
  }

  add(row: number, col: number, value: number): void {
    if (row < 0 || col < 0) return;
    this.a[row * this.size + col] += value;
  }

  addRhs(row: number, value: number): void {
    if (row < 0) return;
    this.z[row] += value;
  }

  /** Conductance `g` (siemens) between two nodes. */
  stampConductance(nodeA: number, nodeB: number, g: number): void {
    const i = this.nodeIndex(nodeA);
    const j = this.nodeIndex(nodeB);
    this.add(i, i, g);
    this.add(j, j, g);
    this.add(i, j, -g);
    this.add(j, i, -g);
  }

  /** Independent current `amps` flowing from `from` through the source into `to`. */
  stampCurrentSource(from: number, to: number, amps: number): void {
    this.addRhs(this.nodeIndex(from), -amps);
    this.addRhs(this.nodeIndex(to), amps);
  }

  /** Ideal voltage source: v(positive) - v(negative) = volts. */
  stampVoltageSource(positive: number, negative: number, branch: number, volts: number): void {
    const p = this.nodeIndex(positive);
    const n = this.nodeIndex(negative);
    const k = this.branchIndex(branch);
    this.add(p, k, 1);
    this.add(n, k, -1);
    this.add(k, p, 1);
    this.add(k, n, -1);
    this.addRhs(k, volts);
  }
}

/** Solution vector accessor shared by devices. */
export class Solution {
  constructor(
    readonly x: Float64Array,
    readonly nodeCount: number,
  ) {}

  /** Voltage of a node relative to ground. */
  voltage(node: number): number {
    return node === 0 ? 0 : this.x[node - 1];
  }

  branchCurrent(branch: number): number {
    return this.x[this.nodeCount - 1 + branch];
  }
}
