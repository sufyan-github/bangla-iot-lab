import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  allHoles,
  holeAt,
  holeCoordinates,
  isHole,
  moveOffBoardPart,
  parseTerminal,
  type CircuitComponent,
  type CircuitDocument,
  type EditResult,
  type Position,
  type ProgrammableType,
  type Wire,
} from '@banglalab/shared';
import { esp32BoardLayout } from './esp32/geometry';
import { PITCH, type Box, type Point } from './units';

export { PITCH, type Box, type Point } from './units';
export const BOARD_X = 190;
export const BOARD_Y = 28;
export const CANVAS_WIDTH = BOARD_X + BOARD_WIDTH * PITCH + 26;
const BREADBOARD_BOTTOM = BOARD_Y + BOARD_HEIGHT * PITCH;

export const BREADBOARD_BOX: Box = {
  x: BOARD_X,
  y: BOARD_Y,
  width: BOARD_WIDTH * PITCH,
  height: BOARD_HEIGHT * PITCH,
};

/**
 * Where the UNO sits until it is moved: under the breadboard, so wires from its
 * top sockets reach the board directly. Socket positions below are for this place.
 */
export const UNO_BOX: Box = { x: BOARD_X, y: BREADBOARD_BOTTOM + 40, width: 474, height: 188 };
const SOCKET_PITCH = 22;
const ESP32_LAYOUT = esp32BoardLayout();
/** The ESP32 board takes the same place until it is moved. A circuit has one board or the other. */
export const ESP32_BOX: Box = {
  x: UNO_BOX.x,
  y: UNO_BOX.y,
  width: ESP32_LAYOUT.width,
  height: ESP32_LAYOUT.height,
};
/** Where each kind of board sits until it is moved. Socket positions are given for this place. */
export const BOARD_HOME: Record<ProgrammableType, Box> = { uno: UNO_BOX, esp32: ESP32_BOX };
const BATTERY_SIZE = { width: 104, height: 156 };
/** How far a battery's terminals stick out to its right. */
const BATTERY_TERMINAL_REACH = 16;

/** The work surface ends here; batteries and the board cannot be dragged further down. */
const SURFACE_BOTTOM = UNO_BOX.y + UNO_BOX.height + 28 + PITCH * 10;
const MARGIN = 6;

export type OffBoardPart = Extract<CircuitComponent, { type: 'battery' | ProgrammableType }>;

export function offBoardParts(circuit: CircuitDocument): OffBoardPart[] {
  return circuit.components.filter(
    (c): c is OffBoardPart => c.type === 'battery' || c.type === 'uno' || c.type === 'esp32',
  );
}

/** Where a battery or board is drawn: where the student put it, or its usual place. */
export function partBox(circuit: CircuitDocument, part: OffBoardPart): Box {
  const size = part.type === 'battery' ? BATTERY_SIZE : BOARD_HOME[part.type];
  if (part.at) {
    return {
      x: BOARD_X + part.at.x * PITCH,
      y: BOARD_Y + part.at.y * PITCH,
      width: size.width,
      height: size.height,
    };
  }
  if (part.type !== 'battery') return BOARD_HOME[part.type];
  // Batteries start beside the board, stacked in the order they were added.
  const index = circuit.components.filter((c) => c.type === 'battery').indexOf(part);
  return { x: 26, y: 56 + Math.max(0, index) * 206, ...BATTERY_SIZE };
}

/** The room a part takes up, including what sticks out of its body. */
function footprint(type: OffBoardPart['type'], box: Box): Box {
  // A board's USB socket overhangs its left edge.
  return type === 'battery'
    ? { ...box, width: box.width + BATTERY_TERMINAL_REACH + 9 }
    : { x: box.x - 12, y: box.y, width: box.width + 12, height: box.height };
}

const overlaps = (a: Box, b: Box, gap: number) =>
  a.x < b.x + b.width + gap &&
  b.x < a.x + a.width + gap &&
  a.y < b.y + b.height + gap &&
  b.y < a.y + a.height + gap;

/** True when the part fits at `box`: on the work surface, clear of the breadboard and other parts. */
export function fitsAt(circuit: CircuitDocument, part: OffBoardPart, box: Box): boolean {
  const area = footprint(part.type, box);
  if (area.x < MARGIN || area.x + area.width > CANVAS_WIDTH - MARGIN) return false;
  if (area.y < MARGIN || area.y + area.height > SURFACE_BOTTOM - MARGIN) return false;
  if (overlaps(area, BREADBOARD_BOX, 4)) return false;
  return offBoardParts(circuit).every(
    (other) =>
      other.id === part.id || !overlaps(area, footprint(other.type, partBox(circuit, other)), 4),
  );
}

/** Moves a battery or board so its top-left corner is at a canvas point, if it fits there. */
export function moveOffBoardTo(circuit: CircuitDocument, id: string, corner: Point): EditResult {
  const part = offBoardParts(circuit).find((c) => c.id === id);
  if (!part) return { ok: false, error: 'unknown-item' };
  const box = { ...partBox(circuit, part), x: Math.round(corner.x), y: Math.round(corner.y) };
  if (!fitsAt(circuit, part, box)) return { ok: false, error: 'no-room' };
  return moveOffBoardPart(circuit, id, toPosition(box));
}

/**
 * Finds room for a part whose usual place is taken, as happens when another
 * part was moved there. Returns the circuit unchanged when the part already fits.
 */
export function settleOffBoardPart(circuit: CircuitDocument, id: string): CircuitDocument {
  const part = offBoardParts(circuit).find((c) => c.id === id);
  if (!part || fitsAt(circuit, part, partBox(circuit, part))) return circuit;
  for (let y = MARGIN + 2; y < SURFACE_BOTTOM; y += PITCH) {
    for (let x = MARGIN + 14; x < CANVAS_WIDTH; x += PITCH) {
      const moved = moveOffBoardTo(circuit, id, { x, y });
      if (moved.ok) return moved.circuit;
    }
  }
  return circuit;
}

/** Canvas height: tall enough for the breadboard and every part beside it. */
export function canvasHeight(circuit: CircuitDocument): number {
  const bottoms = offBoardParts(circuit).map((part) => {
    const box = partBox(circuit, part);
    return box.y + box.height;
  });
  return Math.max(BREADBOARD_BOTTOM, ...bottoms) + 28;
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

/** Sockets along the UNO's two headers, in the order they appear on a real board. */
const UNO_HEADERS = [
  {
    y: UNO_BOX.y + 17,
    x: UNO_BOX.x + 112,
    groups: [
      ['gnd', 'd13', 'd12', 'd11', 'd10', 'd9', 'd8'],
      ['d7', 'd6', 'd5', 'd4', 'd3', 'd2', 'd1', 'd0'],
    ],
  },
  {
    y: UNO_BOX.y + UNO_BOX.height - 17,
    x: UNO_BOX.x + 242,
    groups: [
      ['5v', 'gnd2'],
      ['a0', 'a1', 'a2', 'a3', 'a4', 'a5'],
    ],
  },
];

function socketLabel(terminal: string): string {
  if (terminal.startsWith('gnd')) return 'GND';
  if (terminal === '5v') return '5V';
  if (terminal.startsWith('a')) return terminal.toUpperCase();
  const pin = terminal.slice(1);
  return [3, 5, 6, 9, 10, 11].includes(Number(pin)) ? `~${pin}` : pin; // ~ marks PWM pins
}

export const UNO_SOCKETS: readonly BoardSocket[] = UNO_HEADERS.flatMap((header, row) => {
  let x = header.x;
  return header.groups.flatMap((group) => {
    const sockets = group.map((terminal, i) => ({
      terminal,
      point: { x: x + i * SOCKET_PITCH, y: header.y },
      label: socketLabel(terminal),
      top: row === 0,
    }));
    x += group.length * SOCKET_PITCH + 10;
    return sockets;
  });
});

export interface BoardSocket {
  terminal: string;
  /** Where the socket is when the board is in its usual place. */
  point: Point;
  label: string;
  /** True for the row along the top edge of the board. */
  top: boolean;
}

/** The ESP32 board's 30 pins, from its drawing. */
export const ESP32_SOCKETS: readonly BoardSocket[] = ESP32_LAYOUT.pins.map((pin) => ({
  terminal: pin.id,
  point: { x: ESP32_BOX.x + pin.point.x, y: ESP32_BOX.y + pin.point.y },
  label: pin.label,
  top: pin.row === 'top',
}));

/** Every socket of a kind of board, with the board in its usual place. */
export const BOARD_SOCKETS: Record<ProgrammableType, readonly BoardSocket[]> = {
  uno: UNO_SOCKETS,
  esp32: ESP32_SOCKETS,
};
const SOCKET_POINT: Record<ProgrammableType, Map<string, Point>> = {
  uno: new Map(UNO_SOCKETS.map((s) => [s.terminal, s.point])),
  esp32: new Map(ESP32_SOCKETS.map((s) => [s.terminal, s.point])),
};

/** How far a moved board is from the place its socket positions are given for. */
export function boardShift(circuit: CircuitDocument, board: OffBoardPart): Point {
  const box = partBox(circuit, board);
  const home = board.type === 'battery' ? box : BOARD_HOME[board.type];
  return { x: box.x - home.x, y: box.y - home.y };
}

export function batteryTerminalPoint(box: Box, pin: string): Point {
  return { x: box.x + box.width + BATTERY_TERMINAL_REACH, y: box.y + (pin === 'pos' ? 44 : 112) };
}

/** Canvas position of a hole, battery terminal or board socket; null if it no longer exists. */
export function endpointPoint(circuit: CircuitDocument, endpoint: string): Point | null {
  if (isHole(endpoint)) return holePoint(endpoint);
  const terminal = parseTerminal(endpoint);
  if (!terminal) return null;
  const owner = offBoardParts(circuit).find((c) => c.id === terminal.componentId);
  if (!owner) return null;
  if (owner.type === 'battery') {
    return batteryTerminalPoint(partBox(circuit, owner), terminal.pin);
  }
  const socket = SOCKET_POINT[owner.type].get(terminal.pin);
  if (!socket) return null;
  const shift = boardShift(circuit, owner);
  return { x: socket.x + shift.x, y: socket.y + shift.y };
}

/** The hole, battery terminal or board socket closest to a point, if one is within reach. */
export function endpointNear(circuit: CircuitDocument, point: Point): string | undefined {
  const within = (p: Point, reach: number) => Math.hypot(p.x - point.x, p.y - point.y) <= reach;
  for (const part of offBoardParts(circuit)) {
    if (part.type === 'battery') {
      const box = partBox(circuit, part);
      for (const pin of ['pos', 'neg']) {
        if (within(batteryTerminalPoint(box, pin), PITCH * 0.8)) return `${part.id}.${pin}`;
      }
    } else {
      const shift = boardShift(circuit, part);
      const socket = BOARD_SOCKETS[part.type].find((s) =>
        within({ x: s.point.x + shift.x, y: s.point.y + shift.y }, SOCKET_PITCH * 0.55),
      );
      if (socket) return `${part.id}.${socket.terminal}`;
    }
  }
  return holeNear(point);
}

/** A canvas point as a stored position, in hole pitches from the breadboard's origin. */
export function toPosition(point: Point): Position {
  const pitches = (value: number) => Math.round((value / PITCH) * 1000) / 1000;
  return { x: pitches(point.x - BOARD_X), y: pitches(point.y - BOARD_Y) };
}

export function fromPosition(position: Position): Point {
  return { x: BOARD_X + position.x * PITCH, y: BOARD_Y + position.y * PITCH };
}

/** Canvas points a wire is routed through between its ends. */
export function wireBends(wire: Wire): Point[] {
  return (wire.bends ?? []).map(fromPosition);
}

/** How far `point` is from the straight line between `a` and `b`. */
export function distanceToSegment(point: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const along =
    lengthSquared === 0
      ? 0
      : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared));
  return Math.hypot(point.x - (a.x + dx * along), point.y - (a.y + dy * along));
}

export const HOLE_POINTS: readonly { hole: string; point: Point }[] = allHoles().map((hole) => ({
  hole,
  point: holePoint(hole),
}));
