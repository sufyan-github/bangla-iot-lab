import { beforeEach, describe, expect, it } from 'vitest';
import { signalStats, signals } from './signals';

beforeEach(() => signals.reset(['part:LED1']));

describe('signal recording buffer', () => {
  it('joins the traces of successive frames', () => {
    signals.append({ probes: ['part:LED1'], times: [0, 10], values: [[0, 5]] }, 30);
    signals.append({ probes: ['part:LED1'], times: [30, 40], values: [[5, 0]] }, 60);
    expect(signals.times).toEqual([0, 10, 30, 40]);
    expect(signals.now).toBe(60);
  });

  it('measures a square wave over the visible window', () => {
    // 0 V for 10 ms, 5 V for 30 ms, 0 V for 20 ms.
    signals.append({ probes: ['part:LED1'], times: [0, 10, 40], values: [[0, 5, 0]] }, 60);
    const whole = signalStats(signals.window('part:LED1', 60)!);
    expect(whole).toEqual({ min: 0, max: 5, average: 2.5 });
    // The last 20 ms are all low; the window before that sample is not counted.
    expect(signalStats(signals.window('part:LED1', 20)!)).toEqual({ min: 0, max: 0, average: 0 });
    // The last 30 ms: 10 ms high, 20 ms low.
    expect(signalStats(signals.window('part:LED1', 30)!).average).toBeCloseTo(5 / 3, 9);
  });

  it('starts again when the probes change, and ignores frames with no trace', () => {
    signals.append({ probes: ['part:LED1'], times: [0], values: [[1]] }, 10);
    signals.append(undefined, 20);
    expect(signals.now).toBe(10);
    signals.append({ probes: ['part:R1'], times: [20], values: [[2]] }, 30);
    expect(signals.probes).toEqual(['part:R1']);
    expect(signals.times).toEqual([20]);
    expect(signals.window('part:LED1', 100)).toBeNull();
  });

  it('keeps a bounded history', () => {
    const times = Array.from({ length: 70_000 }, (_, i) => i);
    signals.append({ probes: ['part:LED1'], times, values: [times.map((t) => t % 2)] }, 70_000);
    expect(signals.times.length).toBe(60_000);
    expect(signals.times[0]).toBe(10_000);
    expect(signals.values[0]!.length).toBe(60_000);
  });
});
