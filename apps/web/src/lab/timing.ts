import { SHEET_MEMORY_KINDS, sheetName, type LogicSheet } from '@banglalab/shared';

/** How much of the past a timing diagram shows. */
export const TIMING_WINDOW_MS = 8000;
/** The most lines a diagram draws; more would be too thin to read. */
export const MAX_TIMING_SIGNALS = 10;

/** One line of the diagram: a port, and the name it is shown under. */
export interface TimingSignal {
  port: string;
  label: string;
}

/**
 * What a timing diagram follows, as a textbook draws one: clocks at the top,
 * then switches, then what the flip-flops hold (Q), then the lamps.
 */
export function timingSignals(sheet: LogicSheet): TimingSignal[] {
  const memory = SHEET_MEMORY_KINDS as readonly string[];
  const groups: TimingSignal[][] = [[], [], [], []];
  for (const element of sheet.elements) {
    const name = sheetName(element);
    if (element.kind === 'clock') groups[0]!.push({ port: `${element.id}.q`, label: name });
    else if (element.kind === 'input') groups[1]!.push({ port: `${element.id}.q`, label: name });
    else if (memory.includes(element.kind))
      groups[2]!.push({ port: `${element.id}.q`, label: `${name}.Q` });
    else if (element.kind === 'output') groups[3]!.push({ port: `${element.id}.a`, label: name });
  }
  // In the order the elements were placed (IN2 before IN10), whatever they are called.
  const byNumber = (a: TimingSignal, b: TimingSignal) =>
    a.port.localeCompare(b.port, 'en', { numeric: true });
  return groups.flatMap((group) => group.sort(byNumber)).slice(0, MAX_TIMING_SIGNALS);
}

/** A change of level, at a time in milliseconds. */
export interface TimingStep {
  time: number;
  level: boolean;
}

/**
 * Remembers when each port changed level, for the last few seconds. Only
 * changes are kept, so a slow clock costs as little as a fast one.
 */
export class TimingTrace {
  private readonly changes = new Map<string, TimingStep[]>();

  /** Notes the levels at a moment; times must not go backwards. */
  record(time: number, levels: Readonly<Record<string, boolean>>, ports: readonly string[]): void {
    for (const port of ports) {
      const level = levels[port] ?? false;
      let steps = this.changes.get(port);
      if (!steps) this.changes.set(port, (steps = []));
      if (steps.length === 0 || steps[steps.length - 1]!.level !== level) {
        steps.push({ time, level });
      }
      // Forget what is out of sight, keeping the level the window starts on.
      let old = 0;
      while (old + 1 < steps.length && steps[old + 1]!.time <= time - TIMING_WINDOW_MS) old++;
      if (old > 0) steps.splice(0, old);
    }
  }

  /**
   * The port's level from `from` to `to`: where it starts (or when it was
   * first seen, if later) and each change after. Empty if never seen.
   */
  steps(port: string, from: number, to: number): TimingStep[] {
    const steps = this.changes.get(port) ?? [];
    const shown: TimingStep[] = [];
    for (const step of steps) {
      if (step.time > to) break;
      if (step.time <= from) shown[0] = { time: from, level: step.level };
      else shown.push(step);
    }
    return shown;
  }

  clear(): void {
    this.changes.clear();
  }
}
