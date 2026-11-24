import type { LogicSheet } from '@banglalab/shared';
import { describe, expect, it } from 'vitest';
import { TIMING_WINDOW_MS, TimingTrace, timingSignals } from './timing';

const sheet: LogicSheet = {
  version: 1,
  elements: [
    { id: 'OUT1', kind: 'output', x: 30, y: 2 },
    { id: 'IN2', kind: 'input', x: 1, y: 6 },
    { id: 'G1', kind: 'AND', x: 10, y: 2 },
    { id: 'FF1', kind: 'DFF', x: 20, y: 2 },
    { id: 'IN10', kind: 'input', x: 1, y: 9, label: 'B' },
    { id: 'CLK1', kind: 'clock', x: 1, y: 2 },
  ],
  wires: [],
};

describe('timing diagram', () => {
  it('follows clocks, switches, flip-flops and lamps, in that order; not the gates', () => {
    expect(timingSignals(sheet)).toEqual([
      { port: 'CLK1.q', label: 'CLK1' },
      { port: 'IN2.q', label: 'IN2' },
      { port: 'IN10.q', label: 'B' },
      { port: 'FF1.q', label: 'FF1.Q' },
      { port: 'OUT1.a', label: 'OUT1' },
    ]);
  });

  it('keeps only changes, and draws from the level the window starts on', () => {
    const trace = new TimingTrace();
    for (let time = 0; time <= 3000; time += 250) {
      trace.record(time, { 'CLK1.q': Math.floor(time / 500) % 2 === 1 }, ['CLK1.q']);
    }
    expect(trace.steps('CLK1.q', 0, 3000)).toEqual([
      { time: 0, level: false },
      { time: 500, level: true },
      { time: 1000, level: false },
      { time: 1500, level: true },
      { time: 2000, level: false },
      { time: 2500, level: true },
      { time: 3000, level: false },
    ]);
    // A window starting part-way shows the level it starts on.
    expect(trace.steps('CLK1.q', 1200, 2200)).toEqual([
      { time: 1200, level: false },
      { time: 1500, level: true },
      { time: 2000, level: false },
    ]);
  });

  it('forgets what is older than the window, but not the level still showing', () => {
    const trace = new TimingTrace();
    trace.record(0, { 'IN1.q': true }, ['IN1.q']);
    trace.record(100, { 'IN1.q': false }, ['IN1.q']);
    const later = TIMING_WINDOW_MS + 5000;
    trace.record(later, { 'IN1.q': false }, ['IN1.q']);
    expect(trace.steps('IN1.q', later - TIMING_WINDOW_MS, later)).toEqual([
      { time: later - TIMING_WINDOW_MS, level: false },
    ]);
    expect(trace.steps('IN1.q', 0, later)).toEqual([{ time: 100, level: false }]);
  });

  it('starts a line when its element first appears', () => {
    const trace = new TimingTrace();
    trace.record(2000, { 'IN1.q': true }, ['IN1.q']);
    expect(trace.steps('IN1.q', 0, 3000)).toEqual([{ time: 2000, level: true }]);
    expect(trace.steps('OUT9.a', 0, 3000)).toEqual([]);
  });
});
