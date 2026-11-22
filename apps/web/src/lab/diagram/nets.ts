import {
  BATTERY_TERMINALS,
  L298N_TERMINALS,
  LOGIC_CHIP_GATES,
  PART_SHAPES,
  boardPinNumber,
  boardTerminals,
  isProgrammable,
  isHole,
  stripOf,
  type CircuitComponent,
  type CircuitDocument,
} from '@banglalab/shared';

/**
 * What a schematic diagram is made of, and the first step of drawing one:
 * finding which legs of the breadboard circuit are joined (the nets).
 * Pure data in, pure data out: no React, so it is tested without a browser.
 */

export type Side = 'left' | 'right' | 'up' | 'down';
export type NetKind = 'supply' | 'ground' | 'signal';

export interface Point {
  x: number;
  y: number;
}

export interface DiagramPin {
  name: string;
  /** Text printed beside the leg on box symbols. */
  label: string;
  /** Index into `nets`, or null when nothing else is joined to this leg. */
  net: number | null;
  /** Where the leg ends, in diagram units. */
  x: number;
  y: number;
  side: Side;
}

export interface DiagramPart {
  id: string;
  component: CircuitComponent;
  /** Where the symbol is drawn from: its left edge, and the line its main legs lie on. */
  x: number;
  y: number;
  width: number;
  /** Two-leg symbols are mirrored when their second leg faces the supply. */
  flipped: boolean;
  /** For parts drawn as a labelled box: its size, and how far its top edge is above `y`. */
  box: { width: number; height: number; top: number } | null;
  pins: DiagramPin[];
}

export interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface DiagramNet {
  kind: NetKind;
  /** "componentId.pin" of every leg on this net. */
  legs: string[];
  /** The source that names a rail: a battery's voltage or the board's 5 V. */
  source: { type: 'battery'; voltage: number } | { type: 'board'; label: string } | null;
  segments: Segment[];
  /** Where three or more wire ends meet. */
  dots: Point[];
  /** Left end of the rail, where its name is written; null for nets joined directly. */
  labelAt: Point | null;
  /** Right end of a ground rail, where the ground symbol hangs. */
  groundAt: Point | null;
}

/**
 * The end of a wire that is not drawn all the way: a supply or ground symbol, or
 * a flag carrying a name. Flags with the same name are joined, as in any schematic.
 */
export interface DiagramTerminal {
  kind: 'supply' | 'ground' | 'flag';
  net: number;
  x: number;
  y: number;
  /** The way the symbol or flag points away from the wire. */
  side: Side;
  /** The name on a flag; null when it is the net's own supply or ground name. */
  text: string | null;
}

export interface DiagramLayout {
  width: number;
  height: number;
  parts: DiagramPart[];
  nets: DiagramNet[];
  terminals: DiagramTerminal[];
}

/** Parts drawn as a labelled box with named legs. */
export const BOX_TYPES = new Set([
  'temperature',
  'dht11',
  'soil',
  'ir',
  'ldrmodule',
  'rain',
  'mq135',
  'mq7',
  'ph',
  'voltagesensor',
  'acs712',
  'tds',
  'turbidity',
  'tp4056',
  'lm2596',
  'bme280',
  'ina219',
  'pir',
  'rgbled',
  'oled',
  'relaymodule',
  'logic',
  'relay',
  'servo',
  'ultrasonic',
  'lcd',
  'uno',
  'esp32',
  'l298n',
]);
/** Boxes with so many legs that only the connected ones are drawn. */
export const SPARSE_BOX_TYPES = new Set(['lcd', 'uno', 'esp32', 'l298n', 'logic']);

export function pinNames(component: CircuitComponent): readonly string[] {
  if (component.type === 'battery') return BATTERY_TERMINALS;
  if (isProgrammable(component)) return boardTerminals(component.type);
  if (component.type === 'l298n') return L298N_TERMINALS;
  return PART_SHAPES[component.type].pins;
}

export function pinLabel(component: CircuitComponent, pin: string): string {
  if (component.type === 'uno') {
    if (pin.startsWith('gnd')) return 'GND';
    if (pin === '5v') return '5V';
    const number = boardPinNumber('uno', pin);
    if (number === null) return pin.toUpperCase();
    return number >= 14 ? `A${number - 14}` : `D${number}`;
  }
  // A chip's pins are named as in its datasheet: 1A and 1B in, 1Y out, for its first gate.
  if (component.type === 'logic') {
    const n = Number(pin.slice(1));
    if (n === 7) return 'GND';
    if (n === 14) return 'VCC';
    const gates = LOGIC_CHIP_GATES[component.props.chip].gates;
    const index = gates.findIndex((gate) => gate.output === n || gate.inputs.includes(n));
    const gate = gates[index]!;
    const role =
      gate.output === n ? 'Y' : gate.inputs.length === 1 ? 'A' : 'AB'[gate.inputs.indexOf(n)];
    return `${index + 1}${role}`;
  }
  // The ESP32's pins are named as printed on the board.
  if (component.type === 'esp32') return pin.startsWith('gnd') ? 'GND' : pin.toUpperCase();
  const short: Record<string, string> = {
    anode: '+',
    cathode: '−',
    pos: '+',
    neg: '−',
    ip1: 'IP+',
    ip2: 'IP−',
    // The voltage sensor's input terminal, marked VCC on the module.
    vin: 'VCC',
    // The charger's and regulator's pads, as printed on their boards.
    inp: 'IN+',
    inn: 'IN−',
    bp: 'B+',
    bn: 'B−',
    outp: 'OUT+',
    outn: 'OUT−',
    vinp: 'VIN+',
    vinm: 'VIN−',
  };
  return short[pin] ?? pin.toUpperCase();
}

/**
 * A logic chip is drawn as a box with a symbol inside for each of its gates in
 * use, as a datasheet's logic diagram draws it. A gate is in use when any of
 * its legs is joined to something.
 */
export const GATE_CELL = 80;
export const LOGIC_BOX_HEIGHT = 76;
export function gatesInUse(
  component: CircuitComponent,
  connected: (pin: string) => boolean,
): number[] {
  if (component.type !== 'logic') return [];
  return LOGIC_CHIP_GATES[component.props.chip].gates.flatMap((gate, index) =>
    [...gate.inputs, gate.output].some((n) => connected(`p${n}`)) ? [index] : [],
  );
}
/** The narrowest box that holds the chip's gates in use beside its leg names. */
export const logicBoxWidth = (gates: number) => (gates === 0 ? 0 : gates * GATE_CELL + 56);

/** Sockets of a board that give out a supply voltage, with the name written on its rail. */
const BOARD_SUPPLIES: Record<string, Record<string, string>> = {
  uno: { '5v': '5V' },
  esp32: { '3v3': '3V3', vin: 'VIN' },
};
/** A board's supply sockets, and the ground socket that stands for both of its ground sockets. */
export function boardPowerPins(type: 'uno' | 'esp32'): { supplies: string[]; ground: string } {
  return {
    supplies: Object.keys(BOARD_SUPPLIES[type]!),
    ground: boardTerminals(type).find((pin) => pin.startsWith('gnd'))!,
  };
}
export const isSupplyLeg = (component: CircuitComponent, pin: string) =>
  (component.type === 'battery' && pin === 'pos') ||
  BOARD_SUPPLIES[component.type]?.[pin] !== undefined;
export const isGroundLeg = (component: CircuitComponent, pin: string) =>
  (component.type === 'battery' && pin === 'neg') ||
  (isProgrammable(component) && pin.startsWith('gnd'));
/** A board has two ground sockets; the second is not drawn as a leg of its own. */
const isSecondGround = (component: CircuitComponent, pin: string) =>
  isProgrammable(component) && pin === 'gnd2';

export interface Leg {
  component: CircuitComponent;
  pin: string;
}

/** Groups every leg in the circuit by what it is electrically joined to. */
export function findNets(circuit: CircuitDocument): Leg[][] {
  const parent = new Map<string, string>();
  const find = (key: string): string => {
    const up = parent.get(key);
    if (up === undefined) {
      parent.set(key, key);
      return key;
    }
    if (up === key) return key;
    const root = find(up);
    parent.set(key, root);
    return root;
  };
  const join = (a: string, b: string) => parent.set(find(a), find(b));
  // Holes in one strip are joined inside the breadboard.
  const node = (endpoint: string) => (isHole(endpoint) ? `strip:${stripOf(endpoint)}` : endpoint);

  for (const wire of circuit.wires) join(node(wire.from), node(wire.to));
  const groups = new Map<string, Leg[]>();
  for (const component of circuit.components) {
    // The board's two ground sockets are one net inside the board.
    if (isProgrammable(component)) {
      const [first, second] = boardTerminals(component.type).filter((pin) => pin.startsWith('gnd'));
      join(`${component.id}.${first}`, `${component.id}.${second}`);
    }
  }
  for (const component of circuit.components) {
    for (const pin of pinNames(component)) {
      const endpoint =
        'pins' in component
          ? (component.pins as Record<string, string>)[pin]!
          : `${component.id}.${pin}`;
      const root = find(node(endpoint));
      groups.set(root, [...(groups.get(root) ?? []), { component, pin }]);
    }
  }
  // The board's two ground sockets count as one leg; a net needs two legs to be worth drawing.
  return [...groups.values()]
    .map((legs) => legs.filter((leg) => !isSecondGround(leg.component, leg.pin)))
    .filter((legs) => legs.length >= 2);
}

export function classify(legs: Leg[]): NetKind {
  const supply = legs.some((leg) => isSupplyLeg(leg.component, leg.pin));
  const ground = legs.some((leg) => isGroundLeg(leg.component, leg.pin));
  if (supply && !ground) return 'supply';
  if (ground && !supply) return 'ground';
  return 'signal';
}

/** The nets of a circuit, with what each one is and a lookup from leg to net. */
export interface Analysis {
  netLegs: Leg[][];
  kinds: NetKind[];
  /** The net a leg is on, or null when nothing else is joined to it. */
  netOfLeg(component: CircuitComponent, pin: string): number | null;
  /** The parts of a drawn net that do not depend on the layout. */
  describe(net: number): Pick<DiagramNet, 'kind' | 'legs' | 'source'>;
}

export function analyse(circuit: CircuitDocument): Analysis {
  const netLegs = findNets(circuit);
  const kinds = netLegs.map(classify);
  const netOf = new Map<string, number>();
  netLegs.forEach((legs, index) => {
    for (const leg of legs) netOf.set(`${leg.component.id}.${leg.pin}`, index);
  });
  return {
    netLegs,
    kinds,
    netOfLeg: (component, pin) =>
      netOf.get(`${component.id}.${pin === 'gnd2' ? 'gnd' : pin}`) ?? null,
    describe(net) {
      const legs = netLegs[net]!;
      const supplyLeg = legs.find((leg) => isSupplyLeg(leg.component, leg.pin));
      return {
        kind: kinds[net]!,
        legs: legs.map((leg) => `${leg.component.id}.${leg.pin}`),
        source:
          supplyLeg?.component.type === 'battery'
            ? { type: 'battery', voltage: supplyLeg.component.props.voltage }
            : supplyLeg
              ? { type: 'board', label: BOARD_SUPPLIES[supplyLeg.component.type]![supplyLeg.pin]! }
              : null,
      };
    },
  };
}
