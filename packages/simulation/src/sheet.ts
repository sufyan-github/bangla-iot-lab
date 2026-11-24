import {
  SHEET_GATES,
  SHEET_PORTS,
  sheetGateOutput,
  type LogicSheet,
  type SheetElement,
} from '@banglalab/shared';

/**
 * Works out a logic sheet: every port's level, and what its flip-flops hold.
 * The gates answer at once, as on the breadboard. Flip-flops change only on
 * their clock's rising edge, seen by comparing with the clock level they saw
 * last; one flip-flop may clock another (a ripple counter), so edges are taken
 * in passes until nothing more changes.
 */
export interface SheetState {
  /** Every port's level, by "element.port". */
  levels: Record<string, boolean>;
  /** Each flip-flop's Q, by element id. */
  memory: Record<string, boolean>;
  /** The clock level each flip-flop saw last. */
  clocks: Record<string, boolean>;
  /** Inputs of elements joined to nothing; they are read as LOW. */
  floating: string[];
  /** True when the gates never settled: a loop that keeps changing by itself. */
  unsettled: boolean;
}

const isGate = (kind: string): kind is (typeof SHEET_GATES)[number] =>
  (SHEET_GATES as readonly string[]).includes(kind);

/** A clock is LOW for the first half of each period and HIGH for the second. */
export function sheetClockLevel(element: SheetElement, timeMs: number): boolean {
  const hz = element.hz ?? 1;
  return Math.floor((timeMs * 2 * hz) / 1000 + 1e-9) % 2 === 1;
}

/** The next moment any clock on the sheet changes, after `timeMs`, or Infinity. */
export function nextSheetClockChange(sheet: LogicSheet, timeMs: number): number {
  let soonest = Infinity;
  for (const element of sheet.elements) {
    if (element.kind !== 'clock') continue;
    const half = 1000 / (2 * (element.hz ?? 1));
    soonest = Math.min(soonest, (Math.floor(timeMs / half + 1e-9) + 1) * half);
  }
  return soonest;
}

export function evaluateSheet(sheet: LogicSheet, timeMs: number, before?: SheetState): SheetState {
  const source = new Map(sheet.wires.map((wire) => [wire.to, wire.from]));
  const levels: Record<string, boolean> = { ...(before?.levels ?? {}) };
  const memory: Record<string, boolean> = {};
  const clocks: Record<string, boolean> = {};
  const floating: string[] = [];
  for (const element of sheet.elements) {
    if (element.kind === 'DFF') {
      memory[element.id] = before?.memory[element.id] ?? false;
      // At power-on a flip-flop has seen no clock yet, so it waits for a LOW before an edge.
      clocks[element.id] = before?.clocks[element.id] ?? true;
    }
    for (const port of SHEET_PORTS[element.kind].inputs) {
      if (!source.has(`${element.id}.${port}`)) floating.push(`${element.id}.${port}`);
    }
  }
  const input = (element: SheetElement, port: string) => {
    const from = source.get(`${element.id}.${port}`);
    return from ? (levels[from] ?? false) : false;
  };

  /** Settles the gates with the flip-flops holding what they hold; false if it never settles. */
  const settle = (): boolean => {
    const rounds = sheet.elements.length + 2;
    for (let round = 0; round < rounds; round++) {
      let changed = false;
      const put = (port: string, level: boolean) => {
        if (levels[port] !== level) changed = true;
        levels[port] = level;
      };
      for (const element of sheet.elements) {
        for (const port of SHEET_PORTS[element.kind].inputs)
          put(`${element.id}.${port}`, input(element, port));
        const { id, kind } = element;
        if (kind === 'input') put(`${id}.q`, element.on === true);
        else if (kind === 'clock') put(`${id}.q`, sheetClockLevel(element, timeMs));
        else if (kind === 'DFF') {
          put(`${id}.q`, memory[id]!);
          put(`${id}.nq`, !memory[id]!);
        } else if (isGate(kind)) {
          const ins = SHEET_PORTS[kind].inputs.map((port) => input(element, port));
          put(`${id}.y`, sheetGateOutput(kind, ins));
        }
      }
      if (!changed) return true;
    }
    return false;
  };

  let settled = settle();
  const flipFlops = sheet.elements.filter((e) => e.kind === 'DFF');
  for (let pass = 0; pass <= flipFlops.length; pass++) {
    let changed = false;
    for (const element of flipFlops) {
      const clock = input(element, 'clk');
      if (!clocks[element.id] && clock) {
        const d = input(element, 'd');
        if (memory[element.id] !== d) changed = true;
        memory[element.id] = d;
      }
      clocks[element.id] = clock;
    }
    if (!changed) break;
    settled = settle() && settled;
  }
  return { levels, memory, clocks, floating, unsettled: !settled };
}

export interface SheetTruthTable {
  inputs: string[];
  outputs: string[];
  rows: { inputs: boolean[]; outputs: boolean[] }[];
}

/**
 * The sheet's truth table: every combination of its switches (at most four),
 * and each lamp. Null when there are no switches or lamps, too many switches,
 * or the sheet has flip-flops or clocks, whose outputs depend on what came before.
 */
export function sheetTruthTable(sheet: LogicSheet): SheetTruthTable | null {
  const inputs = sheet.elements.filter((e) => e.kind === 'input').map((e) => e.id);
  const outputs = sheet.elements.filter((e) => e.kind === 'output').map((e) => e.id);
  if (inputs.length === 0 || outputs.length === 0 || inputs.length > 4) return null;
  if (sheet.elements.some((e) => e.kind === 'DFF' || e.kind === 'clock')) return null;
  const rows = Array.from({ length: 1 << inputs.length }, (_, row) => {
    const levels = inputs.map((_, i) => ((row >> (inputs.length - 1 - i)) & 1) === 1);
    const set: LogicSheet = {
      ...sheet,
      elements: sheet.elements.map((e) =>
        e.kind === 'input' ? { ...e, on: levels[inputs.indexOf(e.id)] } : e,
      ),
    };
    const state = evaluateSheet(set, 0);
    return { inputs: levels, outputs: outputs.map((id) => state.levels[`${id}.a`] ?? false) };
  });
  return { inputs, outputs, rows };
}
