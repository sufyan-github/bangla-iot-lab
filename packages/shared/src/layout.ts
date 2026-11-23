import {
  BREADBOARD_SPECS,
  holeExists,
  holesOf,
  localCoordinates,
  parseHole,
  type BreadboardSize,
  type HoleId,
} from './breadboard';
import type { CircuitDocument } from './circuit';

/** A breadboard as placed in a circuit: its top-left corner on the shared grid, in pitches. */
export interface PlacedBreadboard {
  id: string;
  size: BreadboardSize;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Where every hole of a circuit's breadboards is, on one grid of hole pitches
 * shared by all of them. Breadboards sit at whole pitches, so a part's legs
 * can be lined up hole for hole whichever breadboard they are on.
 */
export class BreadboardLayout {
  readonly boards: readonly PlacedBreadboard[];
  private readonly byId = new Map<string, PlacedBreadboard>();
  private readonly at = new Map<string, HoleId>();
  private allHoles: HoleId[] | null = null;

  constructor(boards: readonly PlacedBreadboard[]) {
    this.boards = boards;
    for (const board of boards) {
      this.byId.set(board.id, board);
      for (const hole of holesOf(board.id, board.size)) {
        const { x, y } = this.coordinates(hole)!;
        this.at.set(`${x},${y}`, hole);
      }
    }
  }

  board(id: string): PlacedBreadboard | undefined {
    return this.byId.get(id);
  }

  /** True when the hole is on one of the breadboards. */
  has(hole: string): boolean {
    const parsed = parseHole(hole);
    const board = parsed ? this.byId.get(parsed.board) : undefined;
    return parsed !== null && board !== undefined && holeExists(parsed, board.size);
  }

  /** Where a hole is on the shared grid, or null when no breadboard has it. */
  coordinates(hole: string): { x: number; y: number } | null {
    const parsed = parseHole(hole);
    const board = parsed ? this.byId.get(parsed.board) : undefined;
    if (!parsed || !board || !holeExists(parsed, board.size)) return null;
    const local = localCoordinates(parsed, board.size);
    return { x: board.x + local.x, y: board.y + local.y };
  }

  /** The hole at exact grid coordinates, if there is one. */
  holeAt(x: number, y: number): HoleId | undefined {
    return this.at.get(`${x},${y}`);
  }

  /** Every hole of every breadboard. */
  holes(): readonly HoleId[] {
    this.allHoles ??= this.boards.flatMap((board) => holesOf(board.id, board.size));
    return this.allHoles;
  }

  /** Straight-line distance between two holes in pitch units; Infinity if either is missing. */
  distance(a: HoleId, b: HoleId): number {
    const p = this.coordinates(a);
    const q = this.coordinates(b);
    return p && q ? Math.hypot(p.x - q.x, p.y - q.y) : Infinity;
  }
}

const made = new Map<string, BreadboardLayout>();

/** The layout of a circuit's breadboards. Circuits with the same breadboards share one. */
export function layoutOf(circuit: CircuitDocument): BreadboardLayout {
  const boards: PlacedBreadboard[] = [];
  for (const component of circuit.components) {
    if (component.type !== 'breadboard') continue;
    const spec = BREADBOARD_SPECS[component.props.size];
    boards.push({
      id: component.id,
      size: component.props.size,
      x: component.at.x,
      y: component.at.y,
      width: spec.width,
      height: spec.height,
    });
  }
  const key = boards.map((b) => `${b.id}:${b.size}:${b.x},${b.y}`).join('|');
  let layout = made.get(key);
  if (!layout) {
    layout = new BreadboardLayout(boards);
    if (made.size >= 16) made.delete(made.keys().next().value!);
    made.set(key, layout);
  }
  return layout;
}
