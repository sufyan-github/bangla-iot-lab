import type { Probe, SignalTrace } from '@banglalab/simulation';

/** Oldest samples are dropped beyond this many per recording. */
const MAX_SAMPLES = 60_000;

/**
 * Rolling record of what the instrument probes saw. Kept outside React state
 * because it grows thirty times a second; the instruments redraw from it on
 * their own animation frames.
 */
export const signals = {
  probes: [] as Probe[],
  /** Simulated time of each sample, milliseconds. Each value holds until the next sample. */
  times: [] as number[],
  values: [] as number[][],
  /** Simulated time the recording has reached. */
  now: 0,
  /** Changes whenever there is something new to draw. */
  version: 0,

  reset(probes: readonly Probe[]): void {
    this.probes = [...probes];
    this.times = [];
    this.values = this.probes.map(() => []);
    this.now = 0;
    this.version++;
  },

  append(trace: SignalTrace | undefined, now: number): void {
    if (!trace) return;
    if (trace.probes.join() !== this.probes.join()) this.reset(trace.probes);
    this.times.push(...trace.times);
    trace.values.forEach((series, p) => this.values[p]!.push(...series));
    const excess = this.times.length - MAX_SAMPLES;
    if (excess > 0) {
      this.times.splice(0, excess);
      for (const series of this.values) series.splice(0, excess);
    }
    this.now = now;
    this.version++;
  },

  /** The samples of one probe that matter for the time window ending now, or at `to`. */
  window(
    probe: Probe,
    spanMs: number,
    until?: number,
  ): { times: number[]; values: number[]; from: number; to: number } | null {
    const index = this.probes.indexOf(probe);
    if (index < 0 || this.times.length === 0) return null;
    const to = until ?? this.now;
    const from = to - spanMs;
    // Start one sample before the window, since that value is still showing at its left edge.
    let start = this.times.findIndex((t) => t > from);
    start = start < 0 ? this.times.length - 1 : Math.max(0, start - 1);
    // And stop at the window's end, for a window held in the past.
    let end = this.times.findIndex((t) => t > to);
    end = end < 0 ? this.times.length : end;
    return {
      times: this.times.slice(start, end),
      values: this.values[index]!.slice(start, end),
      from,
      to: Math.min(to, this.now),
    };
  },

  /**
   * The first time after `after` that a probe crosses a logic threshold the
   * given way: from LOW to HIGH (`rise`) or HIGH to LOW (`fall`). Null if it
   * has not happened yet.
   */
  findEdge(probe: Probe, edge: 'rise' | 'fall', after: number, threshold = 2.5): number | null {
    const index = this.probes.indexOf(probe);
    if (index < 0) return null;
    const values = this.values[index]!;
    for (let i = 1; i < this.times.length; i++) {
      if (this.times[i]! <= after) continue;
      const was = values[i - 1]! > threshold;
      const now = values[i]! > threshold;
      if (edge === 'rise' ? !was && now : was && !now) return this.times[i]!;
    }
    return null;
  },
};

export interface SignalStats {
  min: number;
  max: number;
  /** Time-weighted average over the window. */
  average: number;
}

/** Lowest, highest and average value of a stepped signal over a window. */
export function signalStats(view: NonNullable<ReturnType<typeof signals.window>>): SignalStats {
  let min = Infinity;
  let max = -Infinity;
  let area = 0;
  let covered = 0;
  for (let i = 0; i < view.times.length; i++) {
    const start = Math.max(view.times[i]!, view.from);
    const end = Math.min(view.times[i + 1] ?? view.to, view.to);
    if (end <= start) continue;
    const value = view.values[i]!;
    min = Math.min(min, value);
    max = Math.max(max, value);
    area += value * (end - start);
    covered += end - start;
  }
  return covered > 0 ? { min, max, average: area / covered } : { min: 0, max: 0, average: 0 };
}
