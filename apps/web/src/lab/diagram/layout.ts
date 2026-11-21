import {
  BATTERY_TERMINALS,
  PART_SHAPES,
  UNO_TERMINALS,
  isHole,
  stripOf,
  unoPinNumber,
  type CircuitComponent,
  type CircuitDocument,
} from '@banglalab/shared';

/**
 * Turns a breadboard circuit into a schematic diagram: which legs are joined
 * (the nets), where each symbol goes, and right-angle wires between them.
 *
 * The layout is deliberately simple and always correct rather than clever.
 * Symbols stand in one row. Supply nets run as rails above the row and ground
 * rails below it; every other net gets a horizontal track under the row, and
 * each leg reaches its net by a vertical drop. Two parts in series that end up
 * side by side are joined directly, so a plain loop looks like the textbook one.
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
  /** Left edge of the symbol; its legs are measured from here and from `baseline`. */
  x: number;
  width: number;
  /** Two-leg symbols are mirrored when their second leg faces the supply. */
  flipped: boolean;
  /** Size of the box, for parts drawn as a labelled box. */
  box: { width: number; height: number } | null;
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
  source: { type: 'battery'; voltage: number } | { type: 'uno' } | null;
  segments: Segment[];
  /** Where three or more wire ends meet. */
  dots: Point[];
  /** Left end of the rail, where its name is written; null for nets joined directly. */
  labelAt: Point | null;
  /** Right end of a ground rail, where the ground symbol hangs. */
  groundAt: Point | null;
}

export interface DiagramLayout {
  width: number;
  height: number;
  baseline: number;
  parts: DiagramPart[];
  nets: DiagramNet[];
}

const GAP = 44;
const TRACK = 20;
/** Half the height of the band the symbols stand in; tracks start beyond it. */
const BAND = 62;
const MARGIN_LEFT = 78;
const MARGIN = 36;
const JOG = 14;
const TWO_LEG_WIDTH = 80;
const BOX_PIN_SPACING = 34;
const BOX_HEIGHT = 52;
const BOX_LEG = 12;

/** Parts drawn as a labelled box with named legs. */
const BOX_TYPES = new Set([
  'temperature',
  'soil',
  'ir',
  'relay',
  'servo',
  'ultrasonic',
  'lcd',
  'uno',
]);
/** Boxes with so many legs that only the connected ones are drawn. */
const SPARSE_BOX_TYPES = new Set(['lcd', 'uno']);

function pinNames(component: CircuitComponent): readonly string[] {
  if (component.type === 'battery') return BATTERY_TERMINALS;
  if (component.type === 'uno') return UNO_TERMINALS;
  return PART_SHAPES[component.type].pins;
}

function pinLabel(component: CircuitComponent, pin: string): string {
  if (component.type === 'uno') {
    if (pin.startsWith('gnd')) return 'GND';
    if (pin === '5v') return '5V';
    const number = unoPinNumber(pin);
    if (number === null) return pin.toUpperCase();
    return number >= 14 ? `A${number - 14}` : `D${number}`;
  }
  const short: Record<string, string> = { anode: '+', cathode: '−', pos: '+', neg: '−' };
  return short[pin] ?? pin.toUpperCase();
}

const isSupplyLeg = (component: CircuitComponent, pin: string) =>
  (component.type === 'battery' && pin === 'pos') || (component.type === 'uno' && pin === '5v');
const isGroundLeg = (component: CircuitComponent, pin: string) =>
  (component.type === 'battery' && pin === 'neg') ||
  (component.type === 'uno' && pin.startsWith('gnd'));

interface Leg {
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
    if (component.type === 'uno') join(`${component.id}.gnd`, `${component.id}.gnd2`);
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
    .map((legs) => legs.filter((leg) => !(leg.component.type === 'uno' && leg.pin === 'gnd2')))
    .filter((legs) => legs.length >= 2);
}

function classify(legs: Leg[]): NetKind {
  const supply = legs.some((leg) => isSupplyLeg(leg.component, leg.pin));
  const ground = legs.some((leg) => isGroundLeg(leg.component, leg.pin));
  if (supply && !ground) return 'supply';
  if (ground && !supply) return 'ground';
  return 'signal';
}

export function layoutDiagram(circuit: CircuitDocument): DiagramLayout {
  const netLegs = findNets(circuit);
  const kinds = netLegs.map(classify);
  const netOf = new Map<string, number>();
  netLegs.forEach((legs, index) => {
    for (const leg of legs) netOf.set(`${leg.component.id}.${leg.pin}`, index);
  });
  const netOfLeg = (component: CircuitComponent, pin: string) =>
    netOf.get(`${component.id}.${pin === 'gnd2' ? 'gnd' : pin}`) ?? null;

  // --- order: sources first, then outwards from the supply, so series parts sit together ---
  const ordered: { component: CircuitComponent; flipped: boolean }[] = [];
  const placed = new Set<string>();
  const seenNets = new Set<number>();
  const queue: number[] = [];
  const enqueue = (component: CircuitComponent) => {
    const nets = pinNames(component)
      .map((pin) => netOfLeg(component, pin))
      .filter((net): net is number => net !== null && kinds[net] !== 'ground');
    // Supply nets first, so parts fed from the rail come before the rest.
    nets.sort((a, b) => Number(kinds[b] === 'supply') - Number(kinds[a] === 'supply'));
    for (const net of nets) {
      if (!seenNets.has(net)) {
        seenNets.add(net);
        queue.push(net);
      }
    }
  };
  const place = (component: CircuitComponent, entryPin?: string) => {
    if (placed.has(component.id)) return;
    placed.add(component.id);
    const names = pinNames(component);
    // The leg nearer the supply goes on the left.
    ordered.push({ component, flipped: names.length === 2 && entryPin === names[1] });
    enqueue(component);
  };
  const drain = () => {
    while (queue.length > 0) {
      const net = queue.shift()!;
      for (const leg of netLegs[net]!) place(leg.component, leg.pin);
    }
  };
  const isSource = (c: CircuitComponent) => c.type === 'battery' || c.type === 'uno';
  for (const component of circuit.components.filter(isSource)) place(component);
  drain();
  for (const component of circuit.components) {
    place(component);
    drain();
  }

  // --- symbols: where each leg leaves, relative to the symbol's left edge and the baseline ---
  const upper = (net: number | null) => net !== null && kinds[net] === 'supply';
  let cursor = MARGIN_LEFT;
  const jogColumns = new Map<string, number>();
  const parts: DiagramPart[] = ordered.map(({ component, flipped }) => {
    const names = pinNames(component);
    const pin = (name: string, x: number, y: number, side: Side): DiagramPin => ({
      name,
      label: pinLabel(component, name),
      net: netOfLeg(component, name),
      x,
      y,
      side,
    });
    let pins: DiagramPin[];
    let width = TWO_LEG_WIDTH;
    let box: DiagramPart['box'] = null;

    if (BOX_TYPES.has(component.type)) {
      const shown = names
        .filter((name) => name !== 'gnd2')
        .map((name) => ({ name, net: netOfLeg(component, name) }))
        .filter((leg) => leg.net !== null || !SPARSE_BOX_TYPES.has(component.type));
      const top = shown.filter((leg) => upper(leg.net));
      const bottom = shown.filter((leg) => !upper(leg.net));
      width = Math.max(96, (Math.max(top.length, bottom.length) + 1) * BOX_PIN_SPACING);
      box = { width, height: BOX_HEIGHT };
      const spread = (legs: typeof shown, y: number, side: Side) =>
        legs.map((leg, i) =>
          pin(leg.name, Math.round((width * (i + 1)) / (legs.length + 1)), y, side),
        );
      pins = [
        ...spread(top, -BOX_HEIGHT / 2 - BOX_LEG, 'up'),
        ...spread(bottom, BOX_HEIGHT / 2 + BOX_LEG, 'down'),
      ];
    } else if (component.type === 'battery') {
      width = 40;
      pins = [pin('pos', 20, -30, 'up'), pin('neg', 20, 30, 'down')];
    } else if (component.type === 'transistor') {
      width = 60;
      pins = [
        pin('base', 0, 0, 'left'),
        pin('collector', 40, -30, 'up'),
        pin('emitter', 40, 30, 'down'),
      ];
    } else if (component.type === 'potentiometer') {
      const [left, right] = flipped ? ['b', 'a'] : ['a', 'b'];
      const wiperUp = upper(netOfLeg(component, 'wiper'));
      pins = [
        pin(left!, 0, 0, 'left'),
        pin('wiper', 40, wiperUp ? -26 : 26, wiperUp ? 'up' : 'down'),
        pin(right!, TWO_LEG_WIDTH, 0, 'right'),
      ];
    } else {
      const [left, right] = flipped ? [names[1]!, names[0]!] : [names[0]!, names[1]!];
      pins = [pin(left, 0, 0, 'left'), pin(right, TWO_LEG_WIDTH, 0, 'right')];
    }

    // A leg that points away from its net needs a column beside the symbol to turn round in.
    let jogs = 0;
    for (const leg of pins) {
      if (leg.net === null) continue;
      const wrongWay =
        (leg.side === 'up' && !upper(leg.net)) || (leg.side === 'down' && upper(leg.net));
      if (wrongWay) jogColumns.set(`${component.id}.${leg.name}`, cursor + width + JOG * ++jogs);
    }
    const part: DiagramPart = {
      id: component.id,
      component,
      x: cursor,
      width,
      flipped,
      box,
      pins: pins.map((leg) => ({ ...leg, x: cursor + leg.x })),
    };
    cursor += width + JOG * jogs + GAP;
    return part;
  });

  // --- series neighbours are joined directly along the baseline ---
  const direct = new Map<number, Segment>();
  for (let i = 0; i + 1 < parts.length; i++) {
    const out = parts[i]!.pins.find((leg) => leg.side === 'right');
    const into = parts[i + 1]!.pins.find((leg) => leg.side === 'left');
    if (!out || !into || out.net === null || out.net !== into.net) continue;
    if (netLegs[out.net]!.length !== 2 || kinds[out.net] !== 'signal') continue;
    direct.set(out.net, { x1: out.x, y1: 0, x2: into.x, y2: 0 });
  }

  // --- tracks: rails above for supply, packed tracks below for signals, ground rails last ---
  const columnOf = (part: DiagramPart, leg: DiagramPin) =>
    jogColumns.get(`${part.id}.${leg.name}`) ?? leg.x;
  const span = netLegs.map((_, net) => {
    const columns = parts.flatMap((part) =>
      part.pins.filter((leg) => leg.net === net).map((leg) => columnOf(part, leg)),
    );
    return { min: Math.min(...columns), max: Math.max(...columns) };
  });
  const tracked = netLegs.map((_, net) => net).filter((net) => !direct.has(net));
  const supplyNets = tracked.filter((net) => kinds[net] === 'supply');
  const groundNets = tracked.filter((net) => kinds[net] === 'ground');
  const signalNets = tracked
    .filter((net) => kinds[net] === 'signal')
    .sort((a, b) => span[a]!.min - span[b]!.min);

  const baseline = MARGIN + supplyNets.length * TRACK + BAND;
  const trackY = new Map<number, number>();
  supplyNets.forEach((net, i) => trackY.set(net, MARGIN + i * TRACK));
  // Signals that do not overlap left to right share a level, which keeps the diagram short.
  const levelEnds: number[] = [];
  for (const net of signalNets) {
    let level = levelEnds.findIndex((end) => end + 12 < span[net]!.min);
    if (level < 0) level = levelEnds.length;
    levelEnds[level] = span[net]!.max;
    trackY.set(net, baseline + BAND + level * TRACK);
  }
  const groundTop = baseline + BAND + levelEnds.length * TRACK + (levelEnds.length > 0 ? 8 : 0);
  groundNets.forEach((net, i) => trackY.set(net, groundTop + i * TRACK));

  const nets: DiagramNet[] = netLegs.map((legs, net) => {
    const supplyLeg = legs.find((leg) => isSupplyLeg(leg.component, leg.pin));
    const source: DiagramNet['source'] =
      supplyLeg?.component.type === 'battery'
        ? { type: 'battery', voltage: supplyLeg.component.props.voltage }
        : supplyLeg?.component.type === 'uno'
          ? { type: 'uno' }
          : null;
    const base = {
      kind: kinds[net]!,
      legs: legs.map((leg) => `${leg.component.id}.${leg.pin}`),
      source,
    };
    const link = direct.get(net);
    if (link) {
      const segment = { ...link, y1: baseline, y2: baseline };
      return { ...base, segments: [segment], dots: [], labelAt: null, groundAt: null };
    }
    const y = trackY.get(net)!;
    const { min, max } = span[net]!;
    const segments: Segment[] = [{ x1: min, y1: y, x2: max, y2: y }];
    const dots: Point[] = [];
    for (const part of parts) {
      for (const leg of part.pins) {
        if (leg.net !== net) continue;
        const column = columnOf(part, leg);
        const tip = baseline + leg.y;
        if (column !== leg.x) segments.push({ x1: leg.x, y1: tip, x2: column, y2: tip });
        segments.push({ x1: column, y1: tip, x2: column, y2: y });
        if (column > min && column < max) dots.push({ x: column, y });
      }
    }
    return {
      ...base,
      segments,
      dots,
      labelAt: base.kind === 'signal' ? null : { x: min, y },
      groundAt: base.kind === 'ground' ? { x: max, y } : null,
    };
  });

  const lowest = Math.max(baseline + BAND, ...[...trackY.values()]);
  return {
    width: Math.max(cursor - GAP + MARGIN + 30, 320),
    height: lowest + MARGIN + (groundNets.length > 0 ? 22 : 0),
    baseline,
    parts,
    nets,
  };
}
