import { Type, type Static } from 'typebox';
import { Value } from 'typebox/value';
import { gateOutput, type GateKind } from './circuit';

/**
 * The logic sheet: a circuit drawn with logic symbols instead of chips. Each
 * element is a switch, a lamp, a clock, a gate or a D flip-flop, and wires go
 * from an element's output to another's input. It is worked out as pure
 * logic (HIGH and LOW), with no voltages, as a textbook draws it.
 */

export const SHEET_GATES = ['AND', 'OR', 'NOT', 'NAND', 'NOR', 'XOR'] as const;
export const SHEET_KINDS = [
  'input',
  'output',
  'clock',
  ...SHEET_GATES,
  'MUX',
  'FA',
  'DFF',
  'JKFF',
  'TFF',
  'HEX',
] as const;
/** Elements that remember: their outputs change only on their clock's rising edge. */
export const SHEET_MEMORY_KINDS = ['DFF', 'JKFF', 'TFF'] as const;
export type SheetKind = (typeof SHEET_KINDS)[number];

/** Each kind's input and output ports, in the order they are drawn, with a gate's usual two inputs. */
export const SHEET_PORTS: Record<
  SheetKind,
  { inputs: readonly string[]; outputs: readonly string[] }
> = {
  input: { inputs: [], outputs: ['q'] },
  output: { inputs: ['a'], outputs: [] },
  clock: { inputs: [], outputs: ['q'] },
  AND: { inputs: ['a', 'b'], outputs: ['y'] },
  OR: { inputs: ['a', 'b'], outputs: ['y'] },
  NOT: { inputs: ['a'], outputs: ['y'] },
  NAND: { inputs: ['a', 'b'], outputs: ['y'] },
  NOR: { inputs: ['a', 'b'], outputs: ['y'] },
  XOR: { inputs: ['a', 'b'], outputs: ['y'] },
  /** Two data inputs and the select: Y is A while SEL is LOW, B while it is HIGH. */
  MUX: { inputs: ['a', 'b', 'sel'], outputs: ['y'] },
  /** A full adder: S and the carry out of A + B + Cin. */
  FA: { inputs: ['a', 'b', 'cin'], outputs: ['s', 'cout'] },
  DFF: { inputs: ['d', 'clk'], outputs: ['q', 'nq'] },
  JKFF: { inputs: ['j', 'clk', 'k'], outputs: ['q', 'nq'] },
  TFF: { inputs: ['t', 'clk'], outputs: ['q', 'nq'] },
  /** Shows its four inputs (D0 the smallest) as one hexadecimal digit. */
  HEX: { inputs: ['d0', 'd1', 'd2', 'd3'], outputs: [] },
};

/** Gates that may have three or four inputs instead of two. */
const WIDE_GATES: readonly SheetKind[] = ['AND', 'OR', 'NAND', 'NOR', 'XOR'];
const GATE_INPUTS = ['a', 'b', 'c', 'd'];

/** An element's ports: a gate has as many inputs as it was given. */
export function sheetPorts(element: Pick<SheetElement, 'kind' | 'inputs'>): {
  inputs: readonly string[];
  outputs: readonly string[];
} {
  const base = SHEET_PORTS[element.kind];
  if (WIDE_GATES.includes(element.kind) && element.inputs) {
    return { inputs: GATE_INPUTS.slice(0, element.inputs), outputs: base.outputs };
  }
  return base;
}

/** How many elements and wires a sheet may hold. */
export const MAX_SHEET_ELEMENTS = 60;
export const MAX_SHEET_WIRES = 120;
/** The sheet's size in grid steps. */
export const SHEET_WIDTH = 40;
export const SHEET_HEIGHT = 24;

const SheetId = Type.String({ pattern: '^[A-Z]+[0-9]{1,3}$' });
const Port = Type.String({ pattern: '^[A-Z]+[0-9]{1,3}\\.[a-z]+$' });

export const SheetElementSchema = Type.Object({
  id: SheetId,
  kind: Type.Union([
    Type.Literal('input'),
    Type.Literal('output'),
    Type.Literal('clock'),
    Type.Literal('AND'),
    Type.Literal('OR'),
    Type.Literal('NOT'),
    Type.Literal('NAND'),
    Type.Literal('NOR'),
    Type.Literal('XOR'),
    Type.Literal('MUX'),
    Type.Literal('FA'),
    Type.Literal('DFF'),
    Type.Literal('JKFF'),
    Type.Literal('TFF'),
    Type.Literal('HEX'),
  ]),
  /** Where its top-left corner is, in grid steps. */
  x: Type.Integer({ minimum: 0, maximum: SHEET_WIDTH - 1 }),
  y: Type.Integer({ minimum: 0, maximum: SHEET_HEIGHT - 1 }),
  /** A switch: whether it is on (HIGH). */
  on: Type.Optional(Type.Boolean()),
  /** A gate: how many inputs it has, 2 (the default) to 4. */
  inputs: Type.Optional(Type.Integer({ minimum: 2, maximum: 4 })),
  /** A clock: how many times a second it ticks. */
  hz: Type.Optional(Type.Number({ minimum: 0.2, maximum: 10 })),
});
export type SheetElement = Static<typeof SheetElementSchema>;

export const SheetWireSchema = Type.Object({
  id: Type.String({ pattern: '^N[0-9]{1,3}$' }),
  /** An output port, "G1.y". */
  from: Port,
  /** An input port, "G2.a". */
  to: Port,
});
export type SheetWire = Static<typeof SheetWireSchema>;

export const LogicSheetSchema = Type.Object({
  version: Type.Literal(1),
  elements: Type.Array(SheetElementSchema, { maxItems: MAX_SHEET_ELEMENTS }),
  wires: Type.Array(SheetWireSchema, { maxItems: MAX_SHEET_WIRES }),
});
export type LogicSheet = Static<typeof LogicSheetSchema>;

export function emptySheet(): LogicSheet {
  return { version: 1, elements: [], wires: [] };
}

/** True when the value is a sheet the lab can open: valid, with every wire between real ports. */
export function isLogicSheet(value: unknown): value is LogicSheet {
  if (!Value.Check(LogicSheetSchema, value)) return false;
  return sheetProblem(value) === null;
}

/** What is wrong with a sheet's wiring, or null. */
function sheetProblem(sheet: LogicSheet): string | null {
  const ids = new Set<string>();
  for (const element of sheet.elements) {
    if (ids.has(element.id)) return 'same-id';
    ids.add(element.id);
  }
  const fed = new Set<string>();
  for (const wire of sheet.wires) {
    if (portOf(sheet, wire.from)?.side !== 'output') return 'bad-from';
    if (portOf(sheet, wire.to)?.side !== 'input') return 'bad-to';
    if (fed.has(wire.to)) return 'input-taken';
    fed.add(wire.to);
  }
  return null;
}

/** The element and side of a port, or null when there is no such port. */
export function portOf(
  sheet: LogicSheet,
  port: string,
): { element: SheetElement; side: 'input' | 'output' } | null {
  const [id, name] = port.split('.');
  const element = sheet.elements.find((e) => e.id === id);
  if (!element || !name) return null;
  const ports = sheetPorts(element);
  if (ports.inputs.includes(name)) return { element, side: 'input' };
  if (ports.outputs.includes(name)) return { element, side: 'output' };
  return null;
}

/** The letter an element's id starts with. */
const PREFIX: Record<SheetKind, string> = {
  input: 'IN',
  output: 'OUT',
  clock: 'CLK',
  AND: 'G',
  OR: 'G',
  NOT: 'G',
  NAND: 'G',
  NOR: 'G',
  XOR: 'G',
  MUX: 'MX',
  FA: 'FA',
  DFF: 'FF',
  JKFF: 'FF',
  TFF: 'FF',
  HEX: 'HEX',
};

export type SheetEdit =
  { ok: true; sheet: LogicSheet; id?: string } | { ok: false; error: SheetError };
export type SheetError = 'full' | 'taken' | 'not-output' | 'not-input' | 'input-taken' | 'missing';

function nextId(sheet: LogicSheet, prefix: string): string {
  const used = new Set(sheet.elements.map((e) => e.id));
  for (let n = 1; ; n++) if (!used.has(`${prefix}${n}`)) return `${prefix}${n}`;
}

/** Each element takes a 3 × 3 block of the grid. */
const SIZE = 3;
const overlaps = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.abs(a.x - b.x) < SIZE && Math.abs(a.y - b.y) < SIZE;

/** Puts a new element with its top-left corner at (x, y). */
export function addSheetElement(
  sheet: LogicSheet,
  kind: SheetKind,
  x: number,
  y: number,
): SheetEdit {
  if (sheet.elements.length >= MAX_SHEET_ELEMENTS) return { ok: false, error: 'full' };
  const at = {
    x: Math.max(0, Math.min(SHEET_WIDTH - SIZE, Math.round(x))),
    y: Math.max(0, Math.min(SHEET_HEIGHT - SIZE, Math.round(y))),
  };
  if (sheet.elements.some((e) => overlaps(e, at))) return { ok: false, error: 'taken' };
  const id = nextId(sheet, PREFIX[kind]);
  const element: SheetElement = {
    id,
    kind,
    ...at,
    ...(kind === 'input' ? { on: false } : {}),
    ...(kind === 'clock' ? { hz: 1 } : {}),
  };
  return { ok: true, id, sheet: { ...sheet, elements: [...sheet.elements, element] } };
}

/** Moves an element, keeping it on the sheet and off the others. */
export function moveSheetElement(sheet: LogicSheet, id: string, x: number, y: number): SheetEdit {
  const element = sheet.elements.find((e) => e.id === id);
  if (!element) return { ok: false, error: 'missing' };
  const at = {
    x: Math.max(0, Math.min(SHEET_WIDTH - SIZE, Math.round(x))),
    y: Math.max(0, Math.min(SHEET_HEIGHT - SIZE, Math.round(y))),
  };
  if (sheet.elements.some((e) => e.id !== id && overlaps(e, at)))
    return { ok: false, error: 'taken' };
  return {
    ok: true,
    id,
    sheet: { ...sheet, elements: sheet.elements.map((e) => (e.id === id ? { ...e, ...at } : e)) },
  };
}

/** Changes a switch's position or a clock's speed. */
export function setSheetElement(
  sheet: LogicSheet,
  id: string,
  change: { on?: boolean; hz?: number; inputs?: number },
): SheetEdit {
  const element = sheet.elements.find((e) => e.id === id);
  if (!element) return { ok: false, error: 'missing' };
  const next = { ...element };
  if (change.on !== undefined && element.kind === 'input') next.on = change.on;
  if (change.hz !== undefined && element.kind === 'clock')
    next.hz = Math.max(0.2, Math.min(10, change.hz));
  let wires = sheet.wires;
  if (change.inputs !== undefined && WIDE_GATES.includes(element.kind)) {
    next.inputs = Math.max(2, Math.min(4, Math.round(change.inputs)));
    // Wires to inputs the gate no longer has go with them.
    const kept = new Set(sheetPorts(next).inputs.map((port) => `${id}.${port}`));
    wires = wires.filter((w) => !w.to.startsWith(`${id}.`) || kept.has(w.to));
  }
  return {
    ok: true,
    id,
    sheet: { ...sheet, elements: sheet.elements.map((e) => (e.id === id ? next : e)), wires },
  };
}

/** Takes away an element and every wire to or from it, or a wire by its id. */
export function removeFromSheet(sheet: LogicSheet, id: string): SheetEdit {
  if (sheet.wires.some((w) => w.id === id)) {
    return { ok: true, sheet: { ...sheet, wires: sheet.wires.filter((w) => w.id !== id) } };
  }
  if (!sheet.elements.some((e) => e.id === id)) return { ok: false, error: 'missing' };
  const owner = (port: string) => port.split('.')[0];
  return {
    ok: true,
    sheet: {
      ...sheet,
      elements: sheet.elements.filter((e) => e.id !== id),
      wires: sheet.wires.filter((w) => owner(w.from) !== id && owner(w.to) !== id),
    },
  };
}

/**
 * Joins two ports by a wire, from an output to an input (either may be given
 * first). An input takes only one wire; an output may feed any number, its own
 * element's inputs among them (a flip-flop's Q̄ back to its D).
 */
export function connectSheet(sheet: LogicSheet, a: string, b: string): SheetEdit {
  const first = portOf(sheet, a);
  const second = portOf(sheet, b);
  if (!first || !second) return { ok: false, error: 'missing' };
  const [from, to] = first.side === 'output' ? [a, b] : [b, a];
  if (portOf(sheet, from)!.side !== 'output') return { ok: false, error: 'not-output' };
  if (portOf(sheet, to)!.side !== 'input') return { ok: false, error: 'not-input' };
  if (sheet.wires.some((w) => w.to === to)) return { ok: false, error: 'input-taken' };
  if (sheet.wires.length >= MAX_SHEET_WIRES) return { ok: false, error: 'full' };
  const used = new Set(sheet.wires.map((w) => w.id));
  let n = 1;
  while (used.has(`N${n}`)) n++;
  return { ok: true, sheet: { ...sheet, wires: [...sheet.wires, { id: `N${n}`, from, to }] } };
}

/** What a gate on the sheet gives for its inputs. */
export function sheetGateOutput(kind: (typeof SHEET_GATES)[number], inputs: readonly boolean[]) {
  return gateOutput(kind as GateKind, inputs);
}
