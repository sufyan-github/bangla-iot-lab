/**
 * Model of solderless breadboards. A circuit holds one or more, each a part of
 * its own (`BB1`, `BB2`, …), and every hole is named after its breadboard:
 * "BB1.a12" is a terminal strip hole, "BB2.tp7" a power rail hole. Holes of
 * different breadboards are never joined by the boards themselves.
 *
 * Coordinates are in units of one hole pitch (2.54 mm on a real board), so the
 * same numbers drive rendering, lead-length rules and connectivity. Here they
 * are measured from a breadboard's own top-left corner; `layout.ts` places the
 * breadboards on the circuit's shared grid.
 *
 *   tp  + + + + +   + + + + +   ...   top power rail (+)
 *   tn  - - - - -   - - - - -   ...   top power rail (−)
 *   a-e             five holes joined per column
 *   (centre trench)
 *   f-j             five holes joined per column
 *   bp / bn         bottom power rails
 *
 * The mini board has the terminal strips only, without power rails.
 */
export const BREADBOARD_SIZES = ['half', 'full', 'mini'] as const;
export type BreadboardSize = (typeof BREADBOARD_SIZES)[number];

export const TERMINAL_ROWS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'] as const;
export type TerminalRow = (typeof TERMINAL_ROWS)[number];

export const RAILS = ['tp', 'tn', 'bp', 'bn'] as const;
export type Rail = (typeof RAILS)[number];

/** A hole name such as "BB1.a12" (terminal strip) or "BB1.tp7" (power rail). */
export type HoleId = string;

/** A breadboard's id: "BB" and a number. */
export const BREADBOARD_ID = /^BB[1-9]\d*$/;

export interface BreadboardSpec {
  /** Columns of terminal strips, numbered from 1. */
  columns: number;
  rails: boolean;
  /** Size in pitch units, including the margin around the outer holes. */
  width: number;
  height: number;
  /** Rows of holes, by their distance from the top edge. */
  rowY: Readonly<Partial<Record<TerminalRow | Rail, number>>>;
  /** True for the columns that have a hole in the power rails. */
  railHole(column: number): boolean;
  /** Holes in all: 400, 830 or 170, as the boards are sold. */
  holes: number;
}

const WITH_RAILS = {
  tp: 1,
  tn: 2,
  a: 4,
  b: 5,
  c: 6,
  d: 7,
  e: 8,
  f: 11,
  g: 12,
  h: 13,
  i: 14,
  j: 15,
  bp: 17,
  bn: 18,
} as const;
const WITHOUT_RAILS = { a: 2, b: 3, c: 4, d: 5, e: 6, f: 9, g: 10, h: 11, i: 12, j: 13 } as const;

export const BREADBOARD_SPECS: Readonly<Record<BreadboardSize, BreadboardSpec>> = {
  // 30 columns; each rail has 25 holes in groups of five, a gap every sixth column.
  half: {
    columns: 30,
    rails: true,
    width: 31,
    height: 19,
    rowY: WITH_RAILS,
    railHole: (column) => column % 6 !== 0,
    holes: 400,
  },
  // 63 columns; each rail has 50 holes in ten groups of five, from column 2 to column 60.
  full: {
    columns: 63,
    rails: true,
    width: 64,
    height: 19,
    rowY: WITH_RAILS,
    railHole: (column) => column >= 2 && column <= 60 && (column - 2) % 6 !== 5,
    holes: 830,
  },
  // 17 columns and no rails.
  mini: {
    columns: 17,
    rails: false,
    width: 18,
    height: 15,
    rowY: WITHOUT_RAILS,
    railHole: () => false,
    holes: 170,
  },
};

export type ParsedHole =
  | { board: string; kind: 'terminal'; row: TerminalRow; column: number }
  | { board: string; kind: 'rail'; rail: Rail; column: number };

/** Reads a hole's name. It says nothing of whether the breadboard is that big. */
export function parseHole(id: string): ParsedHole | null {
  const match = /^(BB[1-9]\d*)\.([a-j]|tp|tn|bp|bn)([1-9]\d?)$/.exec(id);
  if (!match) return null;
  const board = match[1]!;
  const name = match[2] as TerminalRow | Rail;
  const column = Number(match[3]);
  return name.length === 2
    ? { board, kind: 'rail', rail: name as Rail, column }
    : { board, kind: 'terminal', row: name as TerminalRow, column };
}

/** True for anything written as a breadboard hole. */
export function isHole(id: string): boolean {
  return parseHole(id) !== null;
}

/** True when a breadboard of this size has the hole. */
export function holeExists(hole: ParsedHole, size: BreadboardSize): boolean {
  const spec = BREADBOARD_SPECS[size];
  if (hole.column < 1 || hole.column > spec.columns) return false;
  return hole.kind === 'terminal' || (spec.rails && spec.railHole(hole.column));
}

/** The name of a hole on a breadboard: `holeName('BB1', 'a', 12)` is "BB1.a12". */
export function holeName(board: string, row: TerminalRow | Rail, column: number): HoleId {
  return `${board}.${row}${column}`;
}

/** The breadboard a hole belongs to, or undefined when it is not a hole. */
export function boardOfHole(id: string): string | undefined {
  return parseHole(id)?.board;
}

/** A hole's row of terminal strips ("a" to "j") or rail ("tp" and so on). */
export function rowOfHole(id: string): TerminalRow | Rail | undefined {
  const hole = parseHole(id);
  return hole ? (hole.kind === 'rail' ? hole.rail : hole.row) : undefined;
}

/** True for a hole in a power rail marked + (`plus`) or − (`minus`). */
export function isRailHole(id: string, sign?: 'plus' | 'minus'): boolean {
  const row = rowOfHole(id);
  if (row === undefined || row.length !== 2) return false;
  if (sign === undefined) return true;
  return sign === 'plus' ? row.endsWith('p') : row.endsWith('n');
}

function requireHole(id: string): ParsedHole {
  const hole = parseHole(id);
  if (!hole) throw new Error(`"${id}" is not a breadboard hole`);
  return hole;
}

/**
 * Name of the metal strip a hole belongs to. Two holes are electrically
 * connected by a breadboard itself exactly when their strip names are equal.
 */
export function stripOf(id: HoleId): string {
  const hole = requireHole(id);
  if (hole.kind === 'rail') return `${hole.board}:rail:${hole.rail}`;
  const half = hole.row <= 'e' ? 'top' : 'bottom';
  return `${hole.board}:strip:${hole.column}:${half}`;
}

/** Where a hole is on its own breadboard, in pitch units from the board's top-left corner. */
export function localCoordinates(hole: ParsedHole, size: BreadboardSize): { x: number; y: number } {
  const y = BREADBOARD_SPECS[size].rowY[hole.kind === 'rail' ? hole.rail : hole.row];
  return { x: hole.column, y: y ?? 0 };
}

/** Every hole of a breadboard of this size, named after `board`. */
export function holesOf(board: string, size: BreadboardSize): HoleId[] {
  const spec = BREADBOARD_SPECS[size];
  const holes: HoleId[] = [];
  for (const name of [...(spec.rails ? RAILS : []), ...TERMINAL_ROWS]) {
    for (let column = 1; column <= spec.columns; column++) {
      const id = holeName(board, name, column);
      if (holeExists(requireHole(id), size)) holes.push(id);
    }
  }
  return holes;
}
