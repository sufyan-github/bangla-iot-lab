import {
  BREADBOARD_SPECS,
  L298N_TERMINALS,
  isHole,
  layoutOf,
  moveOffBoardPart,
  parseTerminal,
  type CircuitComponent,
  type CircuitDocument,
  type EditResult,
  type PlacedBreadboard,
  type Position,
  type ProgrammableType,
  type Wire,
} from '@banglalab/shared';
import { esp32BoardLayout } from './esp32/geometry';
import { PITCH, type Box, type Point } from './units';

export { PITCH, type Box, type Point } from './units';
/**
 * The work surface's origin: where the first breadboard's corner sits until it
 * is moved. Stored positions are in hole pitches from here.
 */
export const BOARD_X = 190;
export const BOARD_Y = 28;
const HALF = BREADBOARD_SPECS.half;
/** The narrowest the work surface gets: room for a half breadboard and the parts beside it. */
export const CANVAS_WIDTH = BOARD_X + HALF.width * PITCH + 26;
const BREADBOARD_BOTTOM = BOARD_Y + HALF.height * PITCH;
/** How far the work surface reaches right and down; it grows to hold what is placed, up to here. */
const SURFACE_LIMIT = 3600;
/**
 * How far it reaches left and up of where the first breadboard starts (D-107).
 * A saved circuit keeps positions down to 100 hole pitches before that corner,
 * so every place up to here can be stored.
 */
const SURFACE_START = -2000;
/** The bare surface kept around the circuit on every side, to move about in and to build into. */
export const SURFACE_ROOM = 12 * PITCH;
/** The tab above a breadboard's top-left corner, by which it is picked up and moved. */
export const BREADBOARD_TAB = { width: 104, height: 26 } as const;

/** Where a breadboard is drawn on the canvas. */
export function breadboardBox(board: PlacedBreadboard): Box {
  return {
    x: BOARD_X + board.x * PITCH,
    y: BOARD_Y + board.y * PITCH,
    width: board.width * PITCH,
    height: board.height * PITCH,
  };
}

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
/** The motor driver module starts beside the board, under the breadboard's right half. */
export const DRIVER_BOX: Box = { x: 704, y: UNO_BOX.y, width: 236, height: 176 };
/** How far each of the driver's terminals is from the module's top-left corner. */
const DRIVER_TERMINAL_AT: Record<(typeof L298N_TERMINALS)[number], Point> = {
  // Motor screws on the two sides.
  out1: { x: 14, y: 54 },
  out2: { x: 14, y: 84 },
  out3: { x: 222, y: 54 },
  out4: { x: 222, y: 84 },
  // Power screws, then the six control pins, along the bottom.
  vs: { x: 22, y: 154 },
  gnd: { x: 48, y: 154 },
  '5v': { x: 74, y: 154 },
  ena: { x: 108, y: 154 },
  in1: { x: 130, y: 154 },
  in2: { x: 152, y: 154 },
  in3: { x: 174, y: 154 },
  in4: { x: 196, y: 154 },
  enb: { x: 218, y: 154 },
};
export const DRIVER_TERMINALS = L298N_TERMINALS.map((terminal) => ({
  terminal,
  at: DRIVER_TERMINAL_AT[terminal],
}));

export function driverTerminalPoint(box: Box, terminal: string): Point | null {
  const at = DRIVER_TERMINAL_AT[terminal as keyof typeof DRIVER_TERMINAL_AT];
  return at ? { x: box.x + at.x, y: box.y + at.y } : null;
}
/** How far a battery's terminals stick out to its right. */
const BATTERY_TERMINAL_REACH = 16;

const MARGIN = 6;

export type OffBoardPart = Extract<
  CircuitComponent,
  { type: 'breadboard' | 'battery' | 'l298n' | ProgrammableType }
>;

export function offBoardParts(circuit: CircuitDocument): OffBoardPart[] {
  return circuit.components.filter((c): c is OffBoardPart => !('pins' in c));
}

/** The size of a part beside the board, and where it sits until it is moved (batteries are stacked). */
const sizeOf = (part: OffBoardPart) =>
  part.type === 'breadboard'
    ? {
        width: BREADBOARD_SPECS[part.props.size].width * PITCH,
        height: BREADBOARD_SPECS[part.props.size].height * PITCH,
      }
    : part.type === 'battery'
      ? BATTERY_SIZE
      : part.type === 'l298n'
        ? DRIVER_BOX
        : BOARD_HOME[part.type];

/** Where a breadboard, battery or board is drawn: where the student put it, or its usual place. */
export function partBox(circuit: CircuitDocument, part: OffBoardPart): Box {
  const size = sizeOf(part);
  if (part.at) {
    return {
      x: BOARD_X + part.at.x * PITCH,
      y: BOARD_Y + part.at.y * PITCH,
      width: size.width,
      height: size.height,
    };
  }
  if (part.type === 'l298n') return DRIVER_BOX;
  // A breadboard always has its place; this is only for the type checker.
  if (part.type === 'breadboard') return { x: BOARD_X, y: BOARD_Y, ...size };
  if (part.type !== 'battery') return BOARD_HOME[part.type];
  // Batteries start beside the board, stacked in the order they were added.
  const index = circuit.components.filter((c) => c.type === 'battery').indexOf(part);
  return { x: 26, y: 56 + Math.max(0, index) * 206, ...BATTERY_SIZE };
}

/** The room a part takes up, including what sticks out of its body. */
function footprint(type: OffBoardPart['type'], box: Box): Box {
  // A breadboard's tab rises above its top edge.
  if (type === 'breadboard') {
    return { ...box, y: box.y - BREADBOARD_TAB.height, height: box.height + BREADBOARD_TAB.height };
  }
  // A board's USB socket overhangs its left edge.
  if (type === 'l298n') return box;
  return type === 'battery'
    ? { ...box, width: box.width + BATTERY_TERMINAL_REACH + 9 }
    : { x: box.x - 12, y: box.y, width: box.width + 12, height: box.height };
}

const overlaps = (a: Box, b: Box, gap: number) =>
  a.x < b.x + b.width + gap &&
  b.x < a.x + a.width + gap &&
  a.y < b.y + b.height + gap &&
  b.y < a.y + a.height + gap;

/** True when the part fits at `box`: on the work surface, clear of the breadboards and other parts. */
export function fitsAt(circuit: CircuitDocument, part: OffBoardPart, box: Box): boolean {
  const area = footprint(part.type, box);
  if (area.x < SURFACE_START + MARGIN || area.x + area.width > SURFACE_LIMIT - MARGIN) return false;
  if (area.y < SURFACE_START + MARGIN || area.y + area.height > SURFACE_LIMIT - MARGIN) {
    return false;
  }
  return offBoardParts(circuit).every(
    (other) =>
      other.id === part.id || !overlaps(area, footprint(other.type, partBox(circuit, other)), 4),
  );
}

/** Moves a battery or board so its top-left corner is at a canvas point, if it fits there. */
export function moveOffBoardTo(circuit: CircuitDocument, id: string, corner: Point): EditResult {
  const part = offBoardParts(circuit).find((c) => c.id === id);
  if (!part) return { ok: false, error: 'unknown-item' };
  // A breadboard moves a whole hole at a time, so its holes stay on the shared grid.
  const snap = (value: number, origin: number) =>
    part.type === 'breadboard'
      ? origin + Math.round((value - origin) / PITCH) * PITCH
      : Math.round(value);
  const box = { ...partBox(circuit, part), x: snap(corner.x, BOARD_X), y: snap(corner.y, BOARD_Y) };
  if (!fitsAt(circuit, part, box)) return { ok: false, error: 'no-room' };
  const at = toPosition(box);
  return moveOffBoardPart(
    circuit,
    id,
    part.type === 'breadboard' ? { x: Math.round(at.x), y: Math.round(at.y) } : at,
  );
}

/**
 * A free place for a new breadboard of this size, in whole pitches: below the
 * lowest thing on the work surface, at the left. Null when the surface is full.
 */
export function freeBreadboardPlace(
  circuit: CircuitDocument,
  size: 'half' | 'full' | 'mini',
): Position | null {
  const spec = BREADBOARD_SPECS[size];
  const probe = {
    id: '~new',
    type: 'breadboard',
    props: { size },
    at: { x: 0, y: 0 },
  } as const;
  const bottom = Math.max(
    BOARD_Y,
    ...offBoardParts(circuit).map((part) => {
      const box = footprint(part.type, partBox(circuit, part));
      return box.y + box.height;
    }),
  );
  const top = Math.ceil((bottom + BREADBOARD_TAB.height + 12 - BOARD_Y) / PITCH);
  for (let y = 0; y <= top; y++) {
    for (let x = 0; BOARD_X + (x + spec.width) * PITCH < SURFACE_LIMIT; x++) {
      const box = {
        x: BOARD_X + x * PITCH,
        y: BOARD_Y + y * PITCH,
        width: spec.width * PITCH,
        height: spec.height * PITCH,
      };
      // Not further right than the surface already reaches, unless it must.
      if (y < top && box.x + box.width > canvasWidth(circuit)) break;
      if (fitsAt(circuit, probe, box)) return { x, y };
    }
  }
  return null;
}

/**
 * Puts a newly added board beside the circuit's other board, to its right on
 * the same level, when there is room; otherwise anywhere it fits.
 */
export function placeBesideOtherBoard(circuit: CircuitDocument, id: string): CircuitDocument {
  const other = offBoardParts(circuit).find(
    (part) => part.id !== id && (part.type === 'uno' || part.type === 'esp32'),
  );
  if (other) {
    const box = partBox(circuit, other);
    for (let gap = 40; gap < 400; gap += PITCH) {
      const moved = moveOffBoardTo(circuit, id, { x: box.x + box.width + gap, y: box.y });
      if (moved.ok) return moved.circuit;
    }
  }
  return settleOffBoardPart(circuit, id);
}

/**
 * Finds room for a part whose usual place is taken, as happens when another
 * part was moved there. Returns the circuit unchanged when the part already fits.
 */
export function settleOffBoardPart(circuit: CircuitDocument, id: string): CircuitDocument {
  const part = offBoardParts(circuit).find((c) => c.id === id);
  if (!part || fitsAt(circuit, part, partBox(circuit, part))) return circuit;
  for (let y = MARGIN + 2; y < SURFACE_LIMIT; y += PITCH) {
    for (let x = MARGIN + 14; x < canvasWidth(circuit); x += PITCH) {
      const moved = moveOffBoardTo(circuit, id, { x, y });
      if (moved.ok) return moved.circuit;
    }
  }
  return circuit;
}

/** Canvas height: tall enough for every breadboard and every part beside them. */
export function canvasHeight(circuit: CircuitDocument): number {
  const bottoms = offBoardParts(circuit).map((part) => {
    const box = partBox(circuit, part);
    return box.y + box.height;
  });
  return Math.max(BREADBOARD_BOTTOM, ...bottoms) + 28;
}

/** Canvas width: at least a half breadboard's, wider when parts reach further right. */
export function canvasWidth(circuit: CircuitDocument): number {
  const rights = offBoardParts(circuit).map((part) => {
    const box = footprint(part.type, partBox(circuit, part));
    return box.x + box.width;
  });
  return Math.max(CANVAS_WIDTH, ...rights.map((right) => right + 26));
}

/**
 * The area the circuit takes up: at least the first breadboard's place with the
 * room beside it, and further in any direction when parts lie further out.
 */
export function canvasBox(circuit: CircuitDocument): Box {
  const boxes = offBoardParts(circuit).map((part) => footprint(part.type, partBox(circuit, part)));
  const x = Math.min(0, ...boxes.map((box) => box.x - 26));
  const y = Math.min(0, ...boxes.map((box) => box.y - MARGIN));
  return { x, y, width: canvasWidth(circuit) - x, height: canvasHeight(circuit) - y };
}

/**
 * The surface that is drawn: the circuit's area with bare room on every side,
 * and never less than the window shows, so the mat has no edge in sight. A part
 * put down in that room widens the circuit's area, and the room moves out with it.
 */
export function surfaceBox(
  content: Box,
  shown: { width: number; height: number },
  /** How far the view has been moved: the mat reaches past that too, so it never runs out. */
  reached: Box | null = null,
): Box {
  const left = Math.min(content.x, reached?.x ?? content.x) - SURFACE_ROOM;
  const top = Math.min(content.y, reached?.y ?? content.y) - SURFACE_ROOM;
  const right = Math.max(
    content.x + content.width + SURFACE_ROOM,
    content.x + shown.width,
    reached ? reached.x + reached.width + SURFACE_ROOM : -Infinity,
  );
  const bottom = Math.max(
    content.y + content.height + SURFACE_ROOM,
    content.y + shown.height,
    reached ? reached.y + reached.height + SURFACE_ROOM : -Infinity,
  );
  // No further than a part can be put, and the room beyond it.
  const x = Math.max(left, SURFACE_START - SURFACE_ROOM);
  const y = Math.max(top, SURFACE_START - SURFACE_ROOM);
  return {
    x,
    y,
    width: Math.min(right, SURFACE_LIMIT + SURFACE_ROOM) - x,
    height: Math.min(bottom, SURFACE_LIMIT + SURFACE_ROOM) - y,
  };
}

/** Where a hole is on the canvas; off the canvas when no breadboard has it. */
export function holePoint(circuit: CircuitDocument, hole: string): Point {
  const at = layoutOf(circuit).coordinates(hole);
  if (!at) return { x: -100, y: -100 };
  return { x: BOARD_X + at.x * PITCH, y: BOARD_Y + at.y * PITCH };
}

/** Breadboard grid coordinates nearest to a canvas point. */
export function gridAt(point: Point): Point {
  return {
    x: Math.round((point.x - BOARD_X) / PITCH),
    y: Math.round((point.y - BOARD_Y) / PITCH),
  };
}

export function holeNear(circuit: CircuitDocument, point: Point): string | undefined {
  const grid = gridAt(point);
  return layoutOf(circuit).holeAt(grid.x, grid.y);
}

/** Every hole of the circuit's breadboards, with where it is on the canvas. */
export function holePoints(circuit: CircuitDocument): { hole: string; point: Point }[] {
  return layoutOf(circuit)
    .holes()
    .map((hole) => ({ hole, point: holePoint(circuit, hole) }));
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
  const home =
    board.type === 'battery' || board.type === 'l298n' || board.type === 'breadboard'
      ? box
      : BOARD_HOME[board.type];
  return { x: box.x - home.x, y: box.y - home.y };
}

export function batteryTerminalPoint(box: Box, pin: string): Point {
  return { x: box.x + box.width + BATTERY_TERMINAL_REACH, y: box.y + (pin === 'pos' ? 44 : 112) };
}

/** Canvas position of a hole, battery terminal or board socket; null if it no longer exists. */
export function endpointPoint(circuit: CircuitDocument, endpoint: string): Point | null {
  if (isHole(endpoint)) {
    return layoutOf(circuit).has(endpoint) ? holePoint(circuit, endpoint) : null;
  }
  const terminal = parseTerminal(endpoint);
  if (!terminal) return null;
  const owner = offBoardParts(circuit).find((c) => c.id === terminal.componentId);
  if (!owner) return null;
  if (owner.type === 'battery') {
    return batteryTerminalPoint(partBox(circuit, owner), terminal.pin);
  }
  if (owner.type === 'l298n') return driverTerminalPoint(partBox(circuit, owner), terminal.pin);
  if (owner.type === 'breadboard') return null;
  const socket = SOCKET_POINT[owner.type].get(terminal.pin);
  if (!socket) return null;
  const shift = boardShift(circuit, owner);
  return { x: socket.x + shift.x, y: socket.y + shift.y };
}

/** The hole, battery terminal or board socket closest to a point, if one is within reach. */
export function endpointNear(circuit: CircuitDocument, point: Point): string | undefined {
  const within = (p: Point, reach: number) => Math.hypot(p.x - point.x, p.y - point.y) <= reach;
  for (const part of offBoardParts(circuit)) {
    if (part.type === 'breadboard') continue;
    if (part.type === 'battery') {
      const box = partBox(circuit, part);
      for (const pin of ['pos', 'neg']) {
        if (within(batteryTerminalPoint(box, pin), PITCH * 0.8)) return `${part.id}.${pin}`;
      }
    } else if (part.type === 'l298n') {
      const box = partBox(circuit, part);
      const found = DRIVER_TERMINALS.find(({ at }) =>
        within({ x: box.x + at.x, y: box.y + at.y }, SOCKET_PITCH * 0.5),
      );
      if (found) return `${part.id}.${found.terminal}`;
    } else {
      const shift = boardShift(circuit, part);
      const socket = BOARD_SOCKETS[part.type].find((s) =>
        within({ x: s.point.x + shift.x, y: s.point.y + shift.y }, SOCKET_PITCH * 0.55),
      );
      if (socket) return `${part.id}.${socket.terminal}`;
    }
  }
  return holeNear(circuit, point);
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
