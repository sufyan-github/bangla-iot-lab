import { PART_DEFINITIONS } from '@banglalab/parts';
import {
  boardPinNumber,
  boardSocketOfPin,
  isHole,
  isLogicChipPart,
  isProgrammable,
  stripOf,
  type CircuitComponent,
  type CircuitDocument,
  type ProgrammableBoard,
} from '@banglalab/shared';
import { esp32PinByGpio, netName } from '@banglalab/simulation';
import { sketchPins, type SketchPins } from './sketch-pins';

/**
 * The lab's tutor, first stage (D-116): hints, by fixed rules, for what the
 * simulation cannot see wrong. The circuit runs, nothing is reported, and it
 * does not do what the student meant: a leg in a row of its own, a wire to
 * nowhere, a program that drives a pin nothing is wired to. Each hint is told
 * in three steps (a nudge, where, and how to fix it), and names the places on
 * the board to ring. Nothing here leaves the device.
 */

export type HintRule =
  | 'loose-wire'
  | 'part-unconnected'
  | 'loose-leg'
  | 'pin-unwired'
  | 'pin-unused'
  | 'input-floating'
  | 'input-only-output'
  | 'adc2-wifi';

export interface Hint {
  rule: HintRule;
  /** Filled into the hint's text: `part`, `leg`, `pin`. */
  params: Record<string, string>;
  /** Holes and board sockets to ring on the board. */
  places: string[];
  partId?: string;
}

/** The order hints are given in: the plainest first, as a teacher would look. */
const ORDER: readonly HintRule[] = [
  'part-unconnected',
  'loose-leg',
  'loose-wire',
  'pin-unwired',
  'pin-unused',
  'input-floating',
  'input-only-output',
  'adc2-wifi',
];

/** Parts every leg of which must be joined to something for the part to do anything. */
const ALL_LEGS = new Set([
  'resistor',
  'led',
  'button',
  'switch',
  'capacitor',
  'diode',
  'ldr',
  'buzzer',
  'motor',
  'ttmotor',
  'transistor',
  'potentiometer',
]);

const definitionOf = (type: string) => PART_DEFINITIONS.find((d) => d.simulates === type);

/** What a leg is called on the part: "+", "OUT", "anode". */
function legName(component: CircuitComponent, pin: string): string {
  return definitionOf(component.type)?.pins.find((p) => p.id === pin)?.label ?? pin.toUpperCase();
}

/** The legs a part needs joined: all of a two- or three-leg part's; a module's supply and ground. */
function neededLegs(component: CircuitComponent & { pins: Record<string, string> }): string[] {
  const legs = Object.keys(component.pins);
  if (ALL_LEGS.has(component.type)) return legs;
  // The buzzer board that sounds on HIGH does not use its + pin.
  if (component.type === 'buzzermodule' && component.props.trigger === 'high') {
    return ['s', 'gnd'];
  }
  const definition = definitionOf(component.type);
  if (!definition) return [];
  return legs.filter((leg) => {
    const role = definition.pins.find((p) => p.id === leg)?.role;
    return role === 'power' || role === 'ground';
  });
}

interface BoardProgramText {
  /** The program last put on the board; the hints about programs read only this. */
  source: string;
}

/**
 * The hints for a circuit, plainest first. `programs` holds what was last put
 * on each board, by the board's id; a board with nothing put on it gets no
 * hints about its program.
 */
export function hintsFor(
  circuit: CircuitDocument,
  programs: Readonly<Record<string, BoardProgramText | undefined>> = {},
): Hint[] {
  const hints: Hint[] = [];
  const boardParts = circuit.components.filter(
    (c): c is CircuitComponent & { pins: Record<string, string> } =>
      'pins' in c && !isLogicChipPart(c),
  );

  // What touches each strip of a breadboard: the legs of parts, and wire ends.
  const touches = new Map<string, string[]>();
  const touch = (hole: string, who: string) => {
    const strip = stripOf(hole);
    touches.set(strip, [...(touches.get(strip) ?? []), who]);
  };
  for (const component of circuit.components) {
    if (!('pins' in component)) continue;
    for (const [pin, hole] of Object.entries(component.pins as Record<string, string>)) {
      if (isHole(hole)) touch(hole, `${component.id}.${pin}`);
    }
  }
  for (const wire of circuit.wires) {
    if (isHole(wire.from)) touch(wire.from, `wire:${wire.id}:from`);
    if (isHole(wire.to)) touch(wire.to, `wire:${wire.id}:to`);
  }
  // Something else is in the strip: another part's leg, or a wire. A part's own
  // other leg in the same strip does not count; the simulation reports that.
  const joined = (hole: string, self: string, part?: string) =>
    (touches.get(stripOf(hole)) ?? []).some(
      (who) => who !== self && (part === undefined || !who.startsWith(`${part}.`)),
    );

  for (const component of boardParts) {
    const legs = Object.entries(component.pins).filter(([, hole]) => isHole(hole));
    const loose = legs.filter(
      ([pin, hole]) => !joined(hole, `${component.id}.${pin}`, component.id),
    );
    if (legs.length > 0 && loose.length === legs.length) {
      hints.push({
        rule: 'part-unconnected',
        params: { part: component.id },
        places: legs.map(([, hole]) => hole),
        partId: component.id,
      });
      continue;
    }
    const needed = new Set(neededLegs(component));
    for (const [pin, hole] of loose) {
      if (!needed.has(pin)) continue;
      hints.push({
        rule: 'loose-leg',
        params: { part: component.id, leg: legName(component, pin) },
        places: [hole],
        partId: component.id,
      });
    }
  }

  for (const wire of circuit.wires) {
    for (const [end, place] of [
      ['from', wire.from],
      ['to', wire.to],
    ] as const) {
      if (isHole(place) && !joined(place, `wire:${wire.id}:${end}`)) {
        hints.push({ rule: 'loose-wire', params: { wire: wire.id }, places: [place] });
      }
    }
  }

  for (const board of circuit.components.filter(isProgrammable)) {
    const program = programs[board.id];
    if (!program || program.source.trim() === '') continue;
    hints.push(...programHints(circuit, board, sketchPins(board.type, program.source)));
  }

  return hints.sort((a, b) => ORDER.indexOf(a.rule) - ORDER.indexOf(b.rule));
}

/** Which nets the board's sockets and the parts' legs are on, through wires and strips. */
function netsOf(circuit: CircuitDocument) {
  const parent = new Map<string, string>();
  const find = (net: string): string => {
    let root = net;
    while (parent.has(root)) root = parent.get(root)!;
    return root;
  };
  for (const wire of circuit.wires) {
    const a = find(netName(wire.from));
    const b = find(netName(wire.to));
    if (a !== b) parent.set(a, b);
  }
  // Every part leg and every wire end on each net.
  const members = new Map<string, { part?: CircuitComponent; pin: string; place: string }[]>();
  const add = (place: string, pin: string, part?: CircuitComponent) => {
    const net = find(netName(place));
    members.set(net, [...(members.get(net) ?? []), { part, pin, place }]);
  };
  for (const component of circuit.components) {
    if (!('pins' in component)) continue;
    for (const [pin, hole] of Object.entries(component.pins as Record<string, string>)) {
      add(hole, pin, component);
    }
  }
  for (const wire of circuit.wires) {
    for (const place of [wire.from, wire.to]) if (!isHole(place)) add(place, place);
  }
  return (place: string) => members.get(find(netName(place))) ?? [];
}

/** Pins a bus the program uses drives through its library, without the program naming them. */
function busPins(board: ProgrammableBoard, pins: SketchPins): Set<number> {
  const taken = new Set<number>();
  const uno = board.type === 'uno';
  if (pins.buses.has('i2c')) (uno ? [18, 19] : [21, 22]).forEach((p) => taken.add(p));
  if (pins.buses.has('spi'))
    (uno ? [10, 11, 12, 13] : [5, 18, 19, 23]).forEach((p) => taken.add(p));
  if (pins.buses.has('serial2')) [16, 17].forEach((p) => taken.add(p));
  // The USB serial link, which a program uses through Serial.
  [0, 1].forEach((p) => taken.add(p));
  if (!uno) [1, 3].forEach((p) => taken.add(p));
  return taken;
}

function programHints(
  circuit: CircuitDocument,
  board: ProgrammableBoard,
  pins: SketchPins,
): Hint[] {
  const hints: Hint[] = [];
  const net = netsOf(circuit);
  const wiredTo = (socket: string) =>
    circuit.wires.some(
      (w) => w.from === `${board.id}.${socket}` || w.to === `${board.id}.${socket}`,
    );
  const label = (socket: string) => socket.toUpperCase();
  const led = board.type === 'uno' ? 13 : 2;

  for (const [pin, uses] of pins.uses) {
    const socket = boardSocketOfPin(board.type, pin);
    if (!socket) continue;
    const place = `${board.id}.${socket}`;
    // The board's own LED needs nothing wired to blink.
    const ownLed = pin === led && [...uses].every((u) => u === 'output' || u === 'pwm');
    if (!wiredTo(socket) && !ownLed) {
      hints.push({
        rule: 'pin-unwired',
        params: { pin: label(socket), board: board.id },
        places: [place],
        partId: board.id,
      });
    }
    if (board.type === 'esp32') {
      const info = esp32PinByGpio(pin);
      const drives = uses.has('output') || uses.has('pwm') || uses.has('servo') || uses.has('tone');
      if (info?.inputOnly && (drives || pins.modes.get(pin) === 'OUTPUT')) {
        hints.push({ rule: 'input-only-output', params: { pin: label(socket) }, places: [place] });
      }
      if (uses.has('analog-in') && pins.wifi && info?.adc?.unit === 2) {
        hints.push({ rule: 'adc2-wifi', params: { pin: label(socket) }, places: [place] });
      }
    }
    // A button read with no pull-up or pull-down, inside the chip or on the board.
    const mode = pins.modes.get(pin);
    if (uses.has('input') && mode !== 'INPUT_PULLUP' && mode !== 'INPUT_PULLDOWN') {
      const others = net(place).filter((m) => m.place !== place);
      const driven = others.some((m) => {
        if (!m.part) return true; // another socket: a supply, ground or another pin
        if (m.part.type === 'resistor' || m.part.type === 'potentiometer') return true;
        const role = definitionOf(m.part.type)?.pins.find((p) => p.id === m.pin)?.role;
        return (
          role === 'output' || role === 'bidirectional' || role === 'power' || role === 'ground'
        );
      });
      const switched = others.some((m) => m.part?.type === 'button' || m.part?.type === 'switch');
      if (switched && !driven) {
        hints.push({ rule: 'input-floating', params: { pin: label(socket) }, places: [place] });
      }
    }
  }

  // A part wired to a pin the program never names. Only when every pin it uses was understood.
  if (pins.unknown === 0) {
    const buses = busPins(board, pins);
    const seen = new Set<string>();
    for (const wire of circuit.wires) {
      for (const end of [wire.from, wire.to]) {
        if (!end.startsWith(`${board.id}.`)) continue;
        const socket = end.slice(board.id.length + 1);
        const pin = boardPinNumber(board.type, socket);
        if (pin === null || buses.has(pin) || pins.mentioned.has(pin) || seen.has(socket)) continue;
        // Only a pin that leads to a part: a wire to an empty row is a hint of its own.
        if (!net(end).some((m) => m.part)) continue;
        seen.add(socket);
        hints.push({
          rule: 'pin-unused',
          params: { pin: label(socket), board: board.id },
          places: [end],
          partId: board.id,
        });
      }
    }
  }
  return hints;
}
