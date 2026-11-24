import {
  RAM_WORDS,
  SHEET_GATES,
  SHEET_MEMORY_KINDS,
  SHEET_STORE_KINDS,
  sheetGateOutput,
  sheetPorts,
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
  /**
   * What each counter, register and RAM holds, by element id: a counter's
   * count and a register's value as one number, a RAM's sixteen words.
   */
  store: Record<string, number[]>;
  /** The clock level each flip-flop saw last. */
  clocks: Record<string, boolean>;
  /** Inputs of elements joined to nothing; they are read as LOW. */
  floating: string[];
  /** True when the gates never settled: a loop that keeps changing by itself. */
  unsettled: boolean;
}

const isGate = (kind: string): kind is (typeof SHEET_GATES)[number] =>
  (SHEET_GATES as readonly string[]).includes(kind);
const remembers = (kind: string) => (SHEET_MEMORY_KINDS as readonly string[]).includes(kind);
const stores = (kind: string) => (SHEET_STORE_KINDS as readonly string[]).includes(kind);
/** The number on four ports named with a letter and 0 to 3, the 0 port the smallest bit. */
const nibble = (bit: (port: string) => boolean, letter: string) =>
  [0, 1, 2, 3].reduce((sum, i) => sum + (bit(`${letter}${i}`) ? 1 << i : 0), 0);

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
  const store: Record<string, number[]> = {};
  const clocks: Record<string, boolean> = {};
  const floating: string[] = [];
  for (const element of sheet.elements) {
    if (remembers(element.kind) || stores(element.kind)) {
      if (remembers(element.kind)) memory[element.id] = before?.memory[element.id] ?? false;
      else {
        const size = element.kind === 'RAM' ? RAM_WORDS : 1;
        const kept = before?.store?.[element.id];
        store[element.id] = kept?.length === size ? [...kept] : new Array<number>(size).fill(0);
      }
      // At power-on it has seen no clock yet, so it waits for a LOW before an edge.
      clocks[element.id] = before?.clocks[element.id] ?? true;
    }
    for (const port of sheetPorts(element).inputs) {
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
        for (const port of sheetPorts(element).inputs)
          put(`${element.id}.${port}`, input(element, port));
        const { id, kind } = element;
        if (kind === 'input') put(`${id}.q`, element.on === true);
        else if (kind === 'clock') put(`${id}.q`, sheetClockLevel(element, timeMs));
        else if (remembers(kind)) {
          put(`${id}.q`, memory[id]!);
          put(`${id}.nq`, !memory[id]!);
        } else if (kind === 'DEC') {
          const address = (input(element, 'a1') ? 2 : 0) + (input(element, 'a0') ? 1 : 0);
          for (let n = 0; n < 4; n++) put(`${id}.y${n}`, address === n);
        } else if (stores(kind)) {
          const word =
            kind === 'RAM'
              ? store[id]![nibble((port) => input(element, port), 'a')]!
              : store[id]![0]!;
          for (let bit = 0; bit < 4; bit++) put(`${id}.q${bit}`, ((word >> bit) & 1) === 1);
          if (kind === 'CNT') put(`${id}.co`, word === 15);
        } else if (kind === 'MUX') {
          put(`${id}.y`, input(element, 'sel') ? input(element, 'b') : input(element, 'a'));
        } else if (kind === 'FA') {
          const [a, b, c] = ['a', 'b', 'cin'].map((port) => input(element, port));
          put(`${id}.s`, (a !== b) !== c);
          put(`${id}.cout`, (a && b) || (a && c) || (b && c));
        } else if (isGate(kind)) {
          const ins = sheetPorts(element).inputs.map((port) => input(element, port));
          put(`${id}.y`, sheetGateOutput(kind, ins));
        }
      }
      if (!changed) return true;
    }
    return false;
  };

  let settled = settle();
  const flipFlops = sheet.elements.filter((e) => remembers(e.kind) || stores(e.kind));
  for (let pass = 0; pass <= flipFlops.length; pass++) {
    let changed = false;
    for (const element of flipFlops) {
      const clock = input(element, 'clk');
      if (!clocks[element.id] && clock && stores(element.kind)) {
        const words = store[element.id]!;
        const read = (port: string) => input(element, port);
        if (element.kind === 'CNT') {
          // CLR HIGH at the edge starts the count again (a synchronous clear).
          const next = read('clr') ? 0 : (words[0]! + 1) & 15;
          if (next !== words[0]) changed = true;
          words[0] = next;
        } else if (element.kind === 'REG') {
          const next = nibble(read, 'd');
          if (next !== words[0]) changed = true;
          words[0] = next;
        } else if (read('we')) {
          const address = nibble(read, 'a');
          const next = nibble(read, 'd');
          if (next !== words[address]) changed = true;
          words[address] = next;
        }
      } else if (!clocks[element.id] && clock) {
        const q = memory[element.id]!;
        let next: boolean;
        if (element.kind === 'DFF') next = input(element, 'd');
        else if (element.kind === 'TFF') next = input(element, 't') ? !q : q;
        else {
          // JK: J sets, K clears, both turn it over, neither keeps it.
          const j = input(element, 'j');
          const k = input(element, 'k');
          next = j && k ? !q : j ? true : k ? false : q;
        }
        if (next !== q) changed = true;
        memory[element.id] = next;
      }
      clocks[element.id] = clock;
    }
    if (!changed) break;
    settled = settle() && settled;
  }
  return { levels, memory, store, clocks, floating, unsettled: !settled };
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
  if (sheet.elements.some((e) => remembers(e.kind) || stores(e.kind) || e.kind === 'clock'))
    return null;
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

/**
 * The simplest sum of products for one output of a truth table with up to four
 * inputs: the prime implicants (Quine–McCluskey), then the smallest set of them
 * that covers every row where the output is 1, found by trying every set (few
 * enough with four inputs). Terms are written with the inputs called A, B, C, D
 * in order, a bar over an input that is LOW: "A·B̄ + C". "0" and "1" when the
 * output never or always is.
 */
export function simplestSum(inputs: number, outputs: readonly boolean[]): string {
  const names = ['A', 'B', 'C', 'D'].slice(0, inputs);
  const ones = outputs.flatMap((high, row) => (high ? [row] : []));
  if (ones.length === 0) return '0';
  if (ones.length === outputs.length) return '1';
  // An implicant: the bits it fixes (mask) and their values.
  type Term = { mask: number; value: number };
  const full = (1 << inputs) - 1;
  let terms: Term[] = ones.map((row) => ({ mask: full, value: row }));
  const primes: Term[] = [];
  while (terms.length > 0) {
    const used = new Set<number>();
    const next = new Map<string, Term>();
    terms.forEach((a, i) =>
      terms.forEach((b, j) => {
        if (j <= i || a.mask !== b.mask) return;
        const differ = (a.value ^ b.value) & a.mask;
        if (differ !== 0 && (differ & (differ - 1)) === 0) {
          const term = { mask: a.mask & ~differ, value: a.value & ~differ };
          next.set(`${term.mask}:${term.value}`, term);
          used.add(i).add(j);
        }
      }),
    );
    terms.forEach((term, i) => {
      if (!used.has(i) && !primes.some((p) => p.mask === term.mask && p.value === term.value))
        primes.push(term);
    });
    terms = [...next.values()];
  }
  const covers = (term: Term, row: number) => (row & term.mask) === term.value;
  const literals = (term: Term) =>
    names.filter((_, i) => term.mask & (1 << (inputs - 1 - i))).length;
  let best: Term[] | null = null;
  for (let set = 1; set < 1 << primes.length; set++) {
    const chosen = primes.filter((_, i) => set & (1 << i));
    if (best && chosen.length > best.length) continue;
    if (!ones.every((row) => chosen.some((term) => covers(term, row)))) continue;
    const cost = (list: Term[]) =>
      list.length * 100 + list.reduce((sum, t) => sum + literals(t), 0);
    if (!best || cost(chosen) < cost(best)) best = chosen;
  }
  return best!
    .map((term) =>
      names
        .map((name, i) => {
          const bit = 1 << (inputs - 1 - i);
          if (!(term.mask & bit)) return '';
          return term.value & bit ? name : `${name}\u0305`;
        })
        .filter(Boolean)
        .join('·'),
    )
    .join(' + ');
}
