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
  'DEC',
  'CNT',
  'REG',
  'RAM',
  'SUB',
] as const;
/** Flip-flops: their outputs change only on their clock's rising edge. */
export const SHEET_MEMORY_KINDS = ['DFF', 'JKFF', 'TFF'] as const;
/** Blocks that hold a number (a count, a register's value, a memory's words), changed on a clock edge. */
export const SHEET_STORE_KINDS = ['CNT', 'REG', 'RAM'] as const;
/** How many 4-bit words the RAM block holds. */
export const RAM_WORDS = 16;
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
  /** A 2-to-4 decoder: the output whose number A1 A0 gives is HIGH, the others LOW. */
  DEC: { inputs: ['a0', 'a1'], outputs: ['y0', 'y1', 'y2', 'y3'] },
  /** A 4-bit counter: one more on each rising clock edge, 0 again with CLR HIGH; CO HIGH at 15. */
  CNT: { inputs: ['clk', 'clr'], outputs: ['q0', 'q1', 'q2', 'q3', 'co'] },
  /** A 4-bit register: takes D0 to D3 on each rising clock edge, and holds them. */
  REG: { inputs: ['d0', 'd1', 'd2', 'd3', 'clk'], outputs: ['q0', 'q1', 'q2', 'q3'] },
  /**
   * 16 words of 4 bits: Q shows the word at address A0 to A3 at once; with WE
   * HIGH, a rising clock edge writes D0 to D3 there.
   */
  RAM: {
    inputs: ['a0', 'a1', 'a2', 'a3', 'd0', 'd1', 'd2', 'd3', 'we', 'clk'],
    outputs: ['q0', 'q1', 'q2', 'q3'],
  },
  /** A block the student made: its ports (i1, i2, … and o1, o2, …) come from its pins. */
  SUB: { inputs: [], outputs: [] },
};

/** The most inputs, and the most outputs, a block may have; and how many blocks a sheet may hold. */
export const MAX_PINS = 8;
export const MAX_BLOCKS = 12;

/** How much of the grid each kind takes, wide by high: most take 3 × 3; blocks with many ports are taller. */
const SIZES: Partial<Record<SheetKind, { w: number; h: number }>> = {
  DEC: { w: 3, h: 4 },
  CNT: { w: 3, h: 5 },
  REG: { w: 3, h: 5 },
  RAM: { w: 4, h: 9 },
};
export function sheetSize(element: Pick<SheetElement, 'kind'> & { pins?: number[] }): {
  w: number;
  h: number;
} {
  if (element.kind === 'SUB') {
    const [ins = 1, outs = 1] = element.pins ?? [];
    return { w: SIZE, h: Math.max(SIZE, Math.max(ins, outs) + 1) };
  }
  return SIZES[element.kind] ?? { w: SIZE, h: SIZE };
}

/** Most elements take a 3 × 3 block of the grid. */
const SIZE = 3;

/** Gates that may have three or four inputs instead of two. */
const WIDE_GATES: readonly SheetKind[] = ['AND', 'OR', 'NAND', 'NOR', 'XOR'];
const GATE_INPUTS = ['a', 'b', 'c', 'd'];

/** An element's ports: a gate has as many inputs as it was given. */
export function sheetPorts(element: Pick<SheetElement, 'kind' | 'inputs'> & { pins?: number[] }): {
  inputs: readonly string[];
  outputs: readonly string[];
} {
  if (element.kind === 'SUB') {
    const [ins = 0, outs = 0] = element.pins ?? [];
    return {
      inputs: Array.from({ length: ins }, (_, i) => `i${i + 1}`),
      outputs: Array.from({ length: outs }, (_, i) => `o${i + 1}`),
    };
  }
  const base = SHEET_PORTS[element.kind];
  if (WIDE_GATES.includes(element.kind) && element.inputs) {
    return { inputs: GATE_INPUTS.slice(0, element.inputs), outputs: base.outputs };
  }
  return base;
}

/** The gate delays the sheet offers, in milliseconds: none, or long enough to see. */
export const SHEET_DELAYS = [0, 10, 20, 50] as const;

/** Sets how long each gate takes to answer (0 for at once). */
export function setSheetDelay(sheet: LogicSheet, delayMs: number): SheetEdit {
  if (!(SHEET_DELAYS as readonly number[]).includes(delayMs))
    return { ok: false, error: 'missing' };
  const next: LogicSheet = { ...sheet };
  if (delayMs === 0) delete next.delayMs;
  else next.delayMs = delayMs as 10 | 20 | 50;
  return { ok: true, sheet: next };
}

/** The longest name an element may be given. */
export const MAX_LABEL = 12;

/** How many elements and wires a sheet may hold. */
export const MAX_SHEET_ELEMENTS = 60;
export const MAX_SHEET_WIRES = 120;
/** The sheet's size in grid steps. */
export const SHEET_WIDTH = 40;
export const SHEET_HEIGHT = 24;

const SheetId = Type.String({ pattern: '^[A-Z]+[0-9]{1,3}$' });
const BlockId = Type.String({ pattern: '^B[0-9]{1,3}$' });
const Label = Type.String({ minLength: 1, maxLength: MAX_LABEL, pattern: '^[^\\n\\r\\t]+$' });
/** A port, "G1.y"; a port's name may end in a number, as a hex digit's "d0" does. */
const Port = Type.String({ pattern: '^[A-Z]+[0-9]{1,3}\\.[a-z][a-z0-9]*$' });

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
    Type.Literal('DEC'),
    Type.Literal('CNT'),
    Type.Literal('REG'),
    Type.Literal('RAM'),
    Type.Literal('SUB'),
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
  /** A name the student gives it ("A", "Sum"), shown instead of its id. */
  label: Type.Optional(Label),
  /** A block: which of the sheet's blocks it is, and how many inputs and outputs that has. */
  block: Type.Optional(BlockId),
  pins: Type.Optional(
    Type.Tuple([
      Type.Integer({ minimum: 1, maximum: MAX_PINS }),
      Type.Integer({ minimum: 1, maximum: MAX_PINS }),
    ]),
  ),
});
export type SheetElement = Static<typeof SheetElementSchema>;

export const SheetWireSchema = Type.Object({
  id: Type.String({ pattern: '^N[0-9]{1,3}$' }),
  /** An output port, "G1.y". */
  from: Port,
  /** An input port, "G2.a". */
  to: Port,
  /** Set on each wire of a bus: the wires of one bus share it and are drawn as one. */
  bus: Type.Optional(Type.String({ pattern: '^K[0-9]{1,3}$' })),
});
export type SheetWire = Static<typeof SheetWireSchema>;

/**
 * A block the student made from part of a sheet: its elements and wires, kept
 * as they were. Its switches, in order, are the block's inputs, and its lamps
 * its outputs. It may use blocks made before it, never itself or later ones.
 */
export const SheetBlockSchema = Type.Object({
  id: BlockId,
  name: Label,
  elements: Type.Array(SheetElementSchema, { maxItems: MAX_SHEET_ELEMENTS }),
  wires: Type.Array(SheetWireSchema, { maxItems: MAX_SHEET_WIRES }),
  /** The ids of the switches that are its inputs, and the lamps that are its outputs. */
  inputs: Type.Array(SheetId, { minItems: 1, maxItems: MAX_PINS }),
  outputs: Type.Array(SheetId, { minItems: 1, maxItems: MAX_PINS }),
});
export type SheetBlock = Static<typeof SheetBlockSchema>;

export const LogicSheetSchema = Type.Object({
  version: Type.Literal(1),
  elements: Type.Array(SheetElementSchema, { maxItems: MAX_SHEET_ELEMENTS }),
  wires: Type.Array(SheetWireSchema, { maxItems: MAX_SHEET_WIRES }),
  /** Blocks made on this sheet, which can be placed on it like any element. */
  blocks: Type.Optional(Type.Array(SheetBlockSchema, { maxItems: MAX_BLOCKS })),
  /** How long each gate takes to answer, in milliseconds; none (at once) when absent. */
  delayMs: Type.Optional(Type.Union([Type.Literal(10), Type.Literal(20), Type.Literal(50)])),
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
  const blocks = sheet.blocks ?? [];
  const blockIds = new Set<string>();
  for (const [index, block] of blocks.entries()) {
    if (blockIds.has(block.id)) return 'same-block';
    blockIds.add(block.id);
    // A block may use only blocks made before it.
    const inner = wiringProblem(block, blocks.slice(0, index));
    if (inner) return `block-${inner}`;
    const kindOf = (id: string) => block.elements.find((e) => e.id === id)?.kind;
    if (!block.inputs.every((id) => kindOf(id) === 'input')) return 'bad-pin';
    if (!block.outputs.every((id) => kindOf(id) === 'output')) return 'bad-pin';
  }
  return wiringProblem(sheet, blocks);
}

/** What is wrong with these elements and wires, using these blocks, or null. */
function wiringProblem(
  sheet: Pick<LogicSheet, 'elements' | 'wires'>,
  blocks: readonly SheetBlock[],
): string | null {
  const ids = new Set<string>();
  for (const element of sheet.elements) {
    if (ids.has(element.id)) return 'same-id';
    ids.add(element.id);
    if (element.kind === 'SUB') {
      const block = blocks.find((b) => b.id === element.block);
      if (!block) return 'no-block';
      const [ins, outs] = element.pins ?? [];
      if (ins !== block.inputs.length || outs !== block.outputs.length) return 'bad-pins';
    }
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
  sheet: Pick<LogicSheet, 'elements'>,
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
  DEC: 'DEC',
  CNT: 'CNT',
  REG: 'REG',
  RAM: 'RAM',
  SUB: 'U',
};

export type SheetEdit =
  { ok: true; sheet: LogicSheet; id?: string; ids?: string[] } | { ok: false; error: SheetError };
export type SheetError =
  | 'full'
  | 'taken'
  | 'not-output'
  | 'not-input'
  | 'input-taken'
  | 'missing'
  | 'no-pins'
  | 'in-use'
  | 'not-bus';

function nextId(sheet: LogicSheet, prefix: string): string {
  const used = new Set(sheet.elements.map((e) => e.id));
  for (let n = 1; ; n++) if (!used.has(`${prefix}${n}`)) return `${prefix}${n}`;
}

type Placed = Pick<SheetElement, 'kind' | 'x' | 'y' | 'pins'>;
/** True when two elements' blocks of the grid share any square. */
const overlaps = (a: Placed, b: Placed) => {
  const [sa, sb] = [sheetSize(a), sheetSize(b)];
  return a.x < b.x + sb.w && b.x < a.x + sa.w && a.y < b.y + sb.h && b.y < a.y + sa.h;
};
/** The nearest place to (x, y) where the element lies wholly on the sheet. */
const onSheet = (kind: SheetKind, x: number, y: number, pins?: number[]) => {
  const { w, h } = sheetSize({ kind, pins });
  return {
    x: Math.max(0, Math.min(SHEET_WIDTH - w, Math.round(x))),
    y: Math.max(0, Math.min(SHEET_HEIGHT - h, Math.round(y))),
  };
};

/** Puts a new element with its top-left corner at (x, y). */
export function addSheetElement(
  sheet: LogicSheet,
  kind: SheetKind,
  x: number,
  y: number,
  /** For a block: which of the sheet's blocks. */
  blockId?: string,
): SheetEdit {
  if (sheet.elements.length >= MAX_SHEET_ELEMENTS) return { ok: false, error: 'full' };
  const block = kind === 'SUB' ? sheet.blocks?.find((b) => b.id === blockId) : undefined;
  if (kind === 'SUB' && !block) return { ok: false, error: 'missing' };
  const extra = block
    ? { block: block.id, pins: [block.inputs.length, block.outputs.length] as [number, number] }
    : {};
  const at = onSheet(kind, x, y, extra.pins);
  if (sheet.elements.some((e) => overlaps(e, { kind, ...at, ...extra })))
    return { ok: false, error: 'taken' };
  const id = nextId(sheet, PREFIX[kind]);
  const element: SheetElement = {
    id,
    kind,
    ...at,
    ...extra,
    ...(kind === 'input' ? { on: false } : {}),
    ...(kind === 'clock' ? { hz: 1 } : {}),
  };
  return { ok: true, id, sheet: { ...sheet, elements: [...sheet.elements, element] } };
}

/** Moves an element, keeping it on the sheet and off the others. */
export function moveSheetElement(sheet: LogicSheet, id: string, x: number, y: number): SheetEdit {
  const element = sheet.elements.find((e) => e.id === id);
  if (!element) return { ok: false, error: 'missing' };
  const at = onSheet(element.kind, x, y, element.pins);
  if (sheet.elements.some((e) => e.id !== id && overlaps(e, { ...element, ...at })))
    return { ok: false, error: 'taken' };
  return {
    ok: true,
    id,
    sheet: { ...sheet, elements: sheet.elements.map((e) => (e.id === id ? { ...e, ...at } : e)) },
  };
}

/** What an element is called on the sheet: the name it was given, or its id. */
export const sheetName = (element: Pick<SheetElement, 'id' | 'label'>) =>
  element.label ?? element.id;

/**
 * Changes a switch's position, a clock's speed, a gate's inputs, or the name
 * shown (an empty name takes it away).
 */
export function setSheetElement(
  sheet: LogicSheet,
  id: string,
  change: { on?: boolean; hz?: number; inputs?: number; label?: string },
): SheetEdit {
  const element = sheet.elements.find((e) => e.id === id);
  if (!element) return { ok: false, error: 'missing' };
  const next = { ...element };
  if (change.label !== undefined) {
    const label = change.label.replace(/\s+/g, ' ').trim().slice(0, MAX_LABEL).trim();
    if (label) next.label = label;
    else delete next.label;
  }
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

/** Takes away an element and every wire to or from it, a wire by its id, or a whole bus by its id. */
export function removeFromSheet(sheet: LogicSheet, id: string): SheetEdit {
  if (sheet.wires.some((w) => w.id === id || w.bus === id)) {
    return {
      ok: true,
      sheet: { ...sheet, wires: sheet.wires.filter((w) => w.id !== id && w.bus !== id) },
    };
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

/** Elements copied from a sheet, with the wires between them. */
export interface SheetClip {
  elements: SheetElement[];
  wires: SheetWire[];
  /** The blocks the copied elements are made with, and those they are made with, in order. */
  blocks?: SheetBlock[];
}

/** The elements with these ids, and the wires that join them to each other. */
export function copyFromSheet(sheet: LogicSheet, ids: readonly string[]): SheetClip {
  const chosen = new Set(ids);
  const owner = (port: string) => port.split('.')[0]!;
  const elements = sheet.elements.filter((e) => chosen.has(e.id));
  // Every block these use, directly or inside another block.
  const all = sheet.blocks ?? [];
  const needed = new Set<string>();
  const need = (list: readonly SheetElement[]) => {
    for (const e of list) {
      if (e.kind !== 'SUB' || !e.block || needed.has(e.block)) continue;
      needed.add(e.block);
      need(all.find((b) => b.id === e.block)?.elements ?? []);
    }
  };
  need(elements);
  return {
    elements,
    wires: sheet.wires.filter((w) => chosen.has(owner(w.from)) && chosen.has(owner(w.to))),
    ...(needed.size > 0 ? { blocks: all.filter((b) => needed.has(b.id)) } : {}),
  };
}

/**
 * Brings copied blocks into a sheet: one the sheet already has, the same in
 * every way, is used as it is; any other is added under a new id. Returns the
 * sheet and how the ids changed, or null when there is no room.
 */
function bringBlocks(
  sheet: LogicSheet,
  blocks: readonly SheetBlock[],
): { sheet: LogicSheet; ids: Map<string, string> } | null {
  const ids = new Map<string, string>();
  let have = [...(sheet.blocks ?? [])];
  const retarget = (elements: readonly SheetElement[]) =>
    elements.map((e) =>
      e.kind === 'SUB' && e.block && ids.has(e.block) ? { ...e, block: ids.get(e.block)! } : e,
    );
  const sameAs = (a: SheetBlock, b: SheetBlock) =>
    JSON.stringify({ ...a, id: '' }) === JSON.stringify({ ...b, id: '' });
  for (const block of blocks) {
    const moved = { ...block, elements: retarget(block.elements) };
    const match = have.find((b) => sameAs(b, moved));
    if (match) {
      ids.set(block.id, match.id);
      continue;
    }
    if (have.length >= MAX_BLOCKS) return null;
    const used = new Set(have.map((b) => b.id));
    let n = 1;
    while (used.has(`B${n}`)) n++;
    ids.set(block.id, `B${n}`);
    have = [...have, { ...moved, id: `B${n}` }];
  }
  return { sheet: have.length > 0 ? { ...sheet, blocks: have } : sheet, ids };
}

const inside = (e: Placed) => {
  const { w, h } = sheetSize(e);
  return e.x >= 0 && e.y >= 0 && e.x + w <= SHEET_WIDTH && e.y + h <= SHEET_HEIGHT;
};

/**
 * Puts a copy of copied elements on the sheet, with new ids and the wires
 * between them, moved by (dx, dy). If that place is taken it tries further
 * along, step by step down and to the right. Returns the new elements' ids.
 */
export function pasteIntoSheet(sheet: LogicSheet, clip: SheetClip, dx = 2, dy = 2): SheetEdit {
  if (clip.elements.length === 0) return { ok: false, error: 'missing' };
  const brought = bringBlocks(sheet, clip.blocks ?? []);
  if (!brought) return { ok: false, error: 'full' };
  const blockIds = brought.ids;
  sheet = brought.sheet;
  clip = {
    ...clip,
    elements: clip.elements.map((e) =>
      e.kind === 'SUB' && e.block && blockIds.has(e.block)
        ? { ...e, block: blockIds.get(e.block)! }
        : e,
    ),
  };
  if (sheet.elements.length + clip.elements.length > MAX_SHEET_ELEMENTS)
    return { ok: false, error: 'full' };
  if (sheet.wires.length + clip.wires.length > MAX_SHEET_WIRES) return { ok: false, error: 'full' };
  for (let attempt = 0; attempt < 12; attempt++) {
    const ox = dx + attempt;
    const oy = dy + attempt;
    const placed = clip.elements.map((e) => ({ ...e, x: e.x + ox, y: e.y + oy }));
    if (!placed.every(inside)) continue;
    if (placed.some((p) => sheet.elements.some((e) => overlaps(e, p)))) continue;
    // New ids, kind by kind, after those already on the sheet.
    let working: LogicSheet = sheet;
    const rename = new Map<string, string>();
    for (const element of placed) {
      const id = nextId(working, PREFIX[element.kind]);
      rename.set(element.id, id);
      working = { ...working, elements: [...working.elements, { ...element, id }] };
    }
    const used = new Set(working.wires.map((w) => w.id));
    // The pasted buses get numbers of their own.
    const takenBuses = new Set(working.wires.flatMap((w) => (w.bus ? [w.bus] : [])));
    const busIds = new Map<string, string>();
    let k = 1;
    for (const bus of new Set(clip.wires.flatMap((w) => (w.bus ? [w.bus] : [])))) {
      while (takenBuses.has(`K${k}`)) k++;
      takenBuses.add(`K${k}`);
      busIds.set(bus, `K${k}`);
    }
    let n = 1;
    const wires = clip.wires.map((wire) => {
      while (used.has(`N${n}`)) n++;
      used.add(`N${n}`);
      const port = (p: string) => {
        const [id, name] = p.split('.');
        return `${rename.get(id!)}.${name}`;
      };
      return {
        id: `N${n}`,
        from: port(wire.from),
        to: port(wire.to),
        ...(wire.bus ? { bus: busIds.get(wire.bus)! } : {}),
      };
    });
    return {
      ok: true,
      ids: [...rename.values()],
      sheet: { ...working, wires: [...working.wires, ...wires] },
    };
  }
  return { ok: false, error: 'taken' };
}

/** Takes away these elements, and every wire to or from them. */
export function removeManyFromSheet(sheet: LogicSheet, ids: readonly string[]): SheetEdit {
  const gone = new Set(ids);
  if (!sheet.elements.some((e) => gone.has(e.id))) return { ok: false, error: 'missing' };
  const owner = (port: string) => port.split('.')[0]!;
  return {
    ok: true,
    sheet: {
      ...sheet,
      elements: sheet.elements.filter((e) => !gone.has(e.id)),
      wires: sheet.wires.filter((w) => !gone.has(owner(w.from)) && !gone.has(owner(w.to))),
    },
  };
}

/** Moves these elements together by (dx, dy), if all of them still fit. */
export function moveSheetElements(
  sheet: LogicSheet,
  ids: readonly string[],
  dx: number,
  dy: number,
): SheetEdit {
  const moving = new Set(ids);
  const moved = sheet.elements
    .filter((e) => moving.has(e.id))
    .map((e) => ({ ...e, x: e.x + Math.round(dx), y: e.y + Math.round(dy) }));
  if (moved.length === 0) return { ok: false, error: 'missing' };
  if (!moved.every(inside)) return { ok: false, error: 'taken' };
  const staying = sheet.elements.filter((e) => !moving.has(e.id));
  if (moved.some((m) => staying.some((e) => overlaps(e, m)))) return { ok: false, error: 'taken' };
  const byId = new Map(moved.map((e) => [e.id, e]));
  return {
    ok: true,
    sheet: { ...sheet, elements: sheet.elements.map((e) => byId.get(e.id) ?? e) },
  };
}

/**
 * Makes a block from these elements: its switches (top to bottom) become its
 * inputs and its lamps its outputs, under their names; the elements and the
 * wires between them are kept inside it. The sheet's own elements stay as they
 * are, so the circuit can still be tried there. Returns the new block's id.
 */
export function makeBlock(sheet: LogicSheet, ids: readonly string[], name: string): SheetEdit {
  const blocks = sheet.blocks ?? [];
  if (blocks.length >= MAX_BLOCKS) return { ok: false, error: 'full' };
  const clip = copyFromSheet(sheet, ids);
  const order = (a: SheetElement, b: SheetElement) => a.y - b.y || a.x - b.x;
  const inputs = clip.elements.filter((e) => e.kind === 'input').sort(order);
  const outputs = clip.elements.filter((e) => e.kind === 'output').sort(order);
  if (inputs.length === 0 || outputs.length === 0) return { ok: false, error: 'no-pins' };
  if (inputs.length > MAX_PINS || outputs.length > MAX_PINS) return { ok: false, error: 'full' };
  const used = new Set(blocks.map((b) => b.id));
  let n = 1;
  while (used.has(`B${n}`)) n++;
  const id = `B${n}`;
  const label = name.replace(/\s+/g, ' ').trim().slice(0, MAX_LABEL).trim() || id;
  const block: SheetBlock = {
    id,
    name: label,
    // Switches inside a block are driven from outside; their own position does not matter.
    elements: clip.elements.map((e) => (e.kind === 'input' ? { ...e, on: false } : e)),
    wires: clip.wires,
    inputs: inputs.map((e) => e.id),
    outputs: outputs.map((e) => e.id),
  };
  return { ok: true, id, sheet: { ...sheet, blocks: [...blocks, block] } };
}

/** Forgets a block, if nothing on the sheet or in a later block is made with it. */
export function removeBlock(sheet: LogicSheet, blockId: string): SheetEdit {
  const blocks = sheet.blocks ?? [];
  if (!blocks.some((b) => b.id === blockId)) return { ok: false, error: 'missing' };
  const uses = (elements: readonly SheetElement[]) =>
    elements.some((e) => e.kind === 'SUB' && e.block === blockId);
  if (uses(sheet.elements) || blocks.some((b) => uses(b.elements)))
    return { ok: false, error: 'in-use' };
  const rest = blocks.filter((b) => b.id !== blockId);
  const without: LogicSheet = { ...sheet };
  delete without.blocks;
  return { ok: true, sheet: rest.length > 0 ? { ...without, blocks: rest } : without };
}

/** The names of a block's inputs and outputs, in port order. */
export function blockPinNames(block: SheetBlock): { inputs: string[]; outputs: string[] } {
  const nameOf = (id: string) => {
    const element = block.elements.find((e) => e.id === id);
    return element ? sheetName(element) : id;
  };
  return { inputs: block.inputs.map(nameOf), outputs: block.outputs.map(nameOf) };
}

/** A group of an element's pins that a bus can join, D0 to D3 say, the smallest bit first. */
export interface SheetPinGroup {
  /** "CNT1.q" */
  name: string;
  ports: string[];
  side: 'input' | 'output';
}

/** Which pins of each kind form groups, by the letter they start with. */
const GROUPS: Partial<Record<SheetKind, { letter: string; side: 'input' | 'output' }[]>> = {
  CNT: [{ letter: 'q', side: 'output' }],
  REG: [
    { letter: 'd', side: 'input' },
    { letter: 'q', side: 'output' },
  ],
  RAM: [
    { letter: 'a', side: 'input' },
    { letter: 'd', side: 'input' },
    { letter: 'q', side: 'output' },
  ],
  HEX: [{ letter: 'd', side: 'input' }],
  DEC: [
    { letter: 'a', side: 'input' },
    { letter: 'y', side: 'output' },
  ],
};

/** The element's pin groups that a bus can join. */
export function sheetPinGroups(element: SheetElement): SheetPinGroup[] {
  const ports = sheetPorts(element);
  // A block's inputs, in order, are one group, and its outputs another, when there are two or more.
  if (element.kind === 'SUB') {
    const group = (letter: 'i' | 'o', list: readonly string[], side: 'input' | 'output') =>
      list.length >= 2
        ? [{ name: `${element.id}.${letter}`, ports: list.map((p) => `${element.id}.${p}`), side }]
        : [];
    return [...group('i', ports.inputs, 'input'), ...group('o', ports.outputs, 'output')];
  }
  return (GROUPS[element.kind] ?? []).map(({ letter, side }) => ({
    name: `${element.id}.${letter}`,
    ports: (side === 'input' ? ports.inputs : ports.outputs)
      .filter((port) => new RegExp(`^${letter}[0-9]$`).test(port))
      .map((port) => `${element.id}.${port}`),
    side,
  }));
}

/** The group with this name ("CNT1.q"), or null. */
export function pinGroupOf(
  sheet: Pick<LogicSheet, 'elements'>,
  name: string,
): SheetPinGroup | null {
  const [id] = name.split('.');
  const element = sheet.elements.find((e) => e.id === id);
  return (element && sheetPinGroups(element).find((g) => g.name === name)) ?? null;
}

/**
 * Joins two pin groups of the same width with a bus: one wire for each bit,
 * the smallest to the smallest, from the outputs to the inputs (either group
 * may be given first). None of the inputs may have a wire already.
 */
export function connectBus(sheet: LogicSheet, a: string, b: string): SheetEdit {
  const first = pinGroupOf(sheet, a);
  const second = pinGroupOf(sheet, b);
  if (!first || !second) return { ok: false, error: 'missing' };
  if (first.side === second.side || first.ports.length !== second.ports.length)
    return { ok: false, error: 'not-bus' };
  const [from, to] = first.side === 'output' ? [first, second] : [second, first];
  if (to.ports.some((port) => sheet.wires.some((w) => w.to === port)))
    return { ok: false, error: 'input-taken' };
  if (sheet.wires.length + from.ports.length > MAX_SHEET_WIRES) return { ok: false, error: 'full' };
  const buses = new Set(sheet.wires.flatMap((w) => (w.bus ? [w.bus] : [])));
  let k = 1;
  while (buses.has(`K${k}`)) k++;
  const used = new Set(sheet.wires.map((w) => w.id));
  let n = 1;
  const wires = from.ports.map((port, bit) => {
    while (used.has(`N${n}`)) n++;
    used.add(`N${n}`);
    return { id: `N${n}`, from: port, to: to.ports[bit]!, bus: `K${k}` };
  });
  return { ok: true, id: `K${k}`, sheet: { ...sheet, wires: [...sheet.wires, ...wires] } };
}

/**
 * A block's inside as a sheet of its own, to look at or change, with the blocks
 * it may use (those made before it). Null when there is no such block.
 */
export function blockAsSheet(sheet: LogicSheet, blockId: string): LogicSheet | null {
  const blocks = sheet.blocks ?? [];
  const index = blocks.findIndex((b) => b.id === blockId);
  if (index < 0) return null;
  const block = blocks[index]!;
  const earlier = blocks.slice(0, index);
  return {
    version: 1,
    elements: block.elements,
    wires: block.wires,
    ...(earlier.length > 0 ? { blocks: earlier } : {}),
  };
}

/**
 * Puts a changed inside back into a block. Its switches and lamps (top to
 * bottom) are its pins again; every copy of the block, on the sheet and inside
 * later blocks, takes the new number of pins, and wires to pins that are gone go.
 */
export function updateBlock(
  sheet: LogicSheet,
  blockId: string,
  inner: Pick<LogicSheet, 'elements' | 'wires'>,
): SheetEdit {
  const blocks = sheet.blocks ?? [];
  const index = blocks.findIndex((b) => b.id === blockId);
  if (index < 0) return { ok: false, error: 'missing' };
  const order = (a: SheetElement, b: SheetElement) => a.y - b.y || a.x - b.x;
  const inputs = inner.elements.filter((e) => e.kind === 'input').sort(order);
  const outputs = inner.elements.filter((e) => e.kind === 'output').sort(order);
  if (inputs.length === 0 || outputs.length === 0) return { ok: false, error: 'no-pins' };
  if (inputs.length > MAX_PINS || outputs.length > MAX_PINS) return { ok: false, error: 'full' };
  const pins: [number, number] = [inputs.length, outputs.length];
  // Every copy takes the new pins; wires to pins it no longer has go.
  const refit = (part: Pick<LogicSheet, 'elements' | 'wires'>) => {
    const copies = new Set(
      part.elements.filter((e) => e.kind === 'SUB' && e.block === blockId).map((e) => e.id),
    );
    if (copies.size === 0) return part;
    const kept = (port: string) => {
      const [id, name] = port.split('.');
      if (!copies.has(id!)) return true;
      const n = Number(name!.slice(1));
      return name!.startsWith('i') ? n <= pins[0] : n <= pins[1];
    };
    return {
      elements: part.elements.map((e) => (copies.has(e.id) ? { ...e, pins } : e)),
      wires: part.wires.filter((w) => kept(w.from) && kept(w.to)),
    };
  };
  const block: SheetBlock = {
    ...blocks[index]!,
    elements: inner.elements,
    wires: inner.wires,
    inputs: inputs.map((e) => e.id),
    outputs: outputs.map((e) => e.id),
  };
  const nextBlocks = blocks.map((b, i) =>
    i === index ? block : i > index ? { ...b, ...refit(b) } : b,
  );
  return { ok: true, id: blockId, sheet: { ...sheet, ...refit(sheet), blocks: nextBlocks } };
}
