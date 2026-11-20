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
const BREADBOARD_BOTTOM = BOARD_Y + BOARD_HEIGHT * PITCH;

/** The UNO sits under the breadboard, so wires from its top sockets reach the board directly. */
export const UNO_BOX = { x: BOARD_X, y: BREADBOARD_BOTTOM + 40, width: 474, height: 188 };
const SOCKET_PITCH = 22;

/** Canvas height: taller when there is a board to show. */
export function canvasHeight(circuit: CircuitDocument): number {
  const hasBoard = circuit.components.some((c) => c.type === 'uno');
  return (hasBoard ? UNO_BOX.y + UNO_BOX.height : BREADBOARD_BOTTOM) + 28;
}

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

export const UNO_SOCKETS: readonly {
  terminal: string;
  point: Point;
  label: string;
  top: boolean;
}[] = UNO_HEADERS.flatMap((header, row) => {
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
const UNO_SOCKET_POINT = new Map(UNO_SOCKETS.map((s) => [s.terminal, s.point]));

/** Canvas position of a hole, battery terminal or board socket; null if it no longer exists. */
export function endpointPoint(circuit: CircuitDocument, endpoint: string): Point | null {
  if (isHole(endpoint)) return holePoint(endpoint);
  const terminal = parseTerminal(endpoint);
  if (!terminal) return null;
  const owner = circuit.components.find((c) => c.id === terminal.componentId);
  if (owner?.type === 'uno') return UNO_SOCKET_POINT.get(terminal.pin) ?? null;
  const index = batteryIndex(circuit, terminal.componentId);
  return index < 0 ? null : batteryTerminalPoint(index, terminal.pin);
}

/** The hole, battery terminal or board socket closest to a point, if one is within reach. */
export function endpointNear(circuit: CircuitDocument, point: Point): string | undefined {
  const within = (p: Point | null, reach: number) =>
    p !== null && Math.hypot(p.x - point.x, p.y - point.y) <= reach;
  for (const component of circuit.components) {
    if (component.type === 'battery') {
      for (const pin of ['pos', 'neg']) {
        const endpoint = `${component.id}.${pin}`;
        if (within(endpointPoint(circuit, endpoint), PITCH * 0.8)) return endpoint;
      }
    } else if (component.type === 'uno') {
      const socket = UNO_SOCKETS.find((s) => within(s.point, SOCKET_PITCH * 0.55));
      if (socket) return `${component.id}.${socket.terminal}`;
    }
  }
  return holeNear(point);
}

export const HOLE_POINTS: readonly { hole: string; point: Point }[] = allHoles().map((hole) => ({
  hole,
  point: holePoint(hole),
}));
