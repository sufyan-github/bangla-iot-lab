import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  allHoles,
  holeAt,
  holeCoordinates,
  isHole,
  parseTerminal,
  type CircuitDocument,
} from '@banglalab/shared';

/** Canvas layout in SVG user units. One breadboard pitch is 24 units. */
export const PITCH = 24;
export const BOARD_X = 190;
export const BOARD_Y = 28;
export const CANVAS_WIDTH = BOARD_X + BOARD_WIDTH * PITCH + 26;
export const CANVAS_HEIGHT = BOARD_Y + BOARD_HEIGHT * PITCH + 28;

export interface Point {
  x: number;
  y: number;
}

export function holePoint(hole: string): Point {
  const { x, y } = holeCoordinates(hole);
  return { x: BOARD_X + x * PITCH, y: BOARD_Y + y * PITCH };
}

/** Breadboard grid coordinates nearest to a canvas point. */
export function gridAt(point: Point): Point {
  return {
    x: Math.round((point.x - BOARD_X) / PITCH),
    y: Math.round((point.y - BOARD_Y) / PITCH),
  };
}

export function holeNear(point: Point): string | undefined {
  const grid = gridAt(point);
  return holeAt(grid.x, grid.y);
}

/** Batteries sit beside the board, stacked in the order they were added. */
export function batteryBox(index: number) {
  return { x: 26, y: 56 + index * 206, width: 104, height: 156 };
}

function batteryIndex(circuit: CircuitDocument, componentId: string): number {
  return circuit.components
    .filter((c) => c.type === 'battery')
    .findIndex((c) => c.id === componentId);
}

export function batteryTerminalPoint(index: number, pin: string): Point {
  const box = batteryBox(index);
  return { x: box.x + box.width + 16, y: box.y + (pin === 'pos' ? 44 : 112) };
}

/** Canvas position of a hole or battery terminal; null if it no longer exists. */
export function endpointPoint(circuit: CircuitDocument, endpoint: string): Point | null {
  if (isHole(endpoint)) return holePoint(endpoint);
  const terminal = parseTerminal(endpoint);
  if (!terminal) return null;
  const index = batteryIndex(circuit, terminal.componentId);
  return index < 0 ? null : batteryTerminalPoint(index, terminal.pin);
}

/** The hole or battery terminal closest to a point, if one is within reach. */
export function endpointNear(circuit: CircuitDocument, point: Point): string | undefined {
  const reach = PITCH * 0.8;
  for (const component of circuit.components) {
    if (component.type !== 'battery') continue;
    for (const pin of ['pos', 'neg']) {
      const p = endpointPoint(circuit, `${component.id}.${pin}`);
      if (p && Math.hypot(p.x - point.x, p.y - point.y) <= reach) return `${component.id}.${pin}`;
    }
  }
  return holeNear(point);
}

export const HOLE_POINTS: readonly { hole: string; point: Point }[] = allHoles().map((hole) => ({
  hole,
  point: holePoint(hole),
}));
