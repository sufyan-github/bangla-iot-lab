/**
 * Model of a half-size solderless breadboard (30 columns).
 *
 * Coordinates are in units of one hole pitch (2.54 mm on a real board), so the
 * same numbers drive rendering, lead-length rules and connectivity.
 *
 *   tp  + + + + +   + + + + +   ...   top power rail (+)
 *   tn  - - - - -   - - - - -   ...   top power rail (−)
 *   a-e             five holes joined per column
 *   (centre trench)
 *   f-j             five holes joined per column
 *   bp / bn         bottom power rails
 */
export const BOARD_COLUMNS = 30;

export const TERMINAL_ROWS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'] as const;
export type TerminalRow = (typeof TERMINAL_ROWS)[number];

export const RAILS = ['tp', 'tn', 'bp', 'bn'] as const;
export type Rail = (typeof RAILS)[number];

/** A hole name such as "a12" (terminal strip) or "tp7" (power rail). */
export type HoleId = string;

const ROW_Y: Record<TerminalRow | Rail, number> = {
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
};

/** Board size in pitch units, including the margin around the outer holes. */
export const BOARD_WIDTH = BOARD_COLUMNS + 1;
export const BOARD_HEIGHT = 19;

export type ParsedHole =
  | { kind: 'terminal'; row: TerminalRow; column: number }
  | { kind: 'rail'; rail: Rail; column: number };

/** Rail holes come in groups of five with a gap, as on a real board. */
function railHasHole(column: number): boolean {
  return column % 6 !== 0;
}

export function parseHole(id: string): ParsedHole | null {
  const match = /^([a-j]|tp|tn|bp|bn)([1-9]\d?)$/.exec(id);
  if (!match) return null;
  const name = match[1] as TerminalRow | Rail;
  const column = Number(match[2]);
  if (column < 1 || column > BOARD_COLUMNS) return null;
  if (name.length === 2) {
    return railHasHole(column) ? { kind: 'rail', rail: name as Rail, column } : null;
  }
  return { kind: 'terminal', row: name as TerminalRow, column };
}

export function isHole(id: string): boolean {
  return parseHole(id) !== null;
}

function requireHole(id: string): ParsedHole {
  const hole = parseHole(id);
  if (!hole) throw new Error(`"${id}" is not a breadboard hole`);
  return hole;
}

/**
 * Name of the metal strip a hole belongs to. Two holes are electrically
 * connected by the board itself exactly when their strip names are equal.
 */
export function stripOf(id: HoleId): string {
  const hole = requireHole(id);
  if (hole.kind === 'rail') return `rail:${hole.rail}`;
  const half = hole.row <= 'e' ? 'top' : 'bottom';
  return `strip:${hole.column}:${half}`;
}

export function holeCoordinates(id: HoleId): { x: number; y: number } {
  const hole = requireHole(id);
  return { x: hole.column, y: ROW_Y[hole.kind === 'rail' ? hole.rail : hole.row] };
}

const HOLES: HoleId[] = [];
const HOLE_AT = new Map<string, HoleId>();
for (const name of [...RAILS, ...TERMINAL_ROWS]) {
  for (let column = 1; column <= BOARD_COLUMNS; column++) {
    const id = `${name}${column}`;
    if (!parseHole(id)) continue;
    HOLES.push(id);
    HOLE_AT.set(`${column},${ROW_Y[name]}`, id);
  }
}

export function allHoles(): readonly HoleId[] {
  return HOLES;
}

/** The hole at exact grid coordinates, if there is one. */
export function holeAt(x: number, y: number): HoleId | undefined {
  return HOLE_AT.get(`${x},${y}`);
}

/** Straight-line distance between two holes in pitch units. */
export function holeDistance(a: HoleId, b: HoleId): number {
  const p = holeCoordinates(a);
  const q = holeCoordinates(b);
  return Math.hypot(p.x - q.x, p.y - q.y);
}
