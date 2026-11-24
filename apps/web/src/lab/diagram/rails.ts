import {
  isLogicChipPart,
  isProgrammable,
  type CircuitComponent,
  type CircuitDocument,
} from '@banglalab/shared';
import {
  BOX_TYPES,
  LOGIC_BOX_HEIGHT,
  SPARSE_BOX_TYPES,
  gatesInUse,
  logicBoxWidth,
  pinLabel,
  pinNames,
  type Analysis,
  type DiagramLayout,
  type DiagramNet,
  type DiagramPart,
  type DiagramPin,
  type Point,
  type Segment,
  type Side,
} from './nets';

/**
 * The layout for circuits without a board: a row of symbols between rails.
 *
 * Deliberately simple and always correct rather than clever. Symbols stand in
 * one row, ordered outward from the supply. Supply nets run as rails above the
 * row and ground rails below it; every other net gets a horizontal track under
 * the row, and each leg reaches its net by a vertical drop. Two parts in series
 * that end up side by side are joined directly, so a plain battery loop looks
 * like the one in the textbook.
 */

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

export function layoutRails(circuit: CircuitDocument, analysis: Analysis): DiagramLayout {
  const { netLegs, kinds, netOfLeg } = analysis;

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
  const isSource = (c: CircuitComponent) => c.type === 'battery' || isProgrammable(c);
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
      const gates = gatesInUse(component, (name) => netOfLeg(component, name) !== null).length;
      width = Math.max(
        96,
        (Math.max(top.length, bottom.length) + 1) * BOX_PIN_SPACING,
        logicBoxWidth(gates),
      );
      const height = isLogicChipPart(component) ? LOGIC_BOX_HEIGHT : BOX_HEIGHT;
      box = { width, height, top: -height / 2 };
      const spread = (legs: typeof shown, y: number, side: Side) =>
        legs.map((leg, i) =>
          pin(leg.name, Math.round((width * (i + 1)) / (legs.length + 1)), y, side),
        );
      pins = [
        ...spread(top, -height / 2 - BOX_LEG, 'up'),
        ...spread(bottom, height / 2 + BOX_LEG, 'down'),
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
      y: 0,
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

  const nets: DiagramNet[] = netLegs.map((_, net) => {
    const base = analysis.describe(net);
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
    // Until here legs were measured from the baseline; hand them out as plain positions.
    parts: parts.map((part) => ({
      ...part,
      y: baseline,
      pins: part.pins.map((leg) => ({ ...leg, y: baseline + leg.y })),
    })),
    nets,
    terminals: [],
  };
}
