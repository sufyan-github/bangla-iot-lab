import type { DiagramLayout, Point } from './nets';

/**
 * Where current is flowing in a drawn diagram. The simulator knows the current
 * into every leg of every part; this follows it along the diagram's wires.
 * Each drawn net is a tree of wire pieces: the current in a piece is what the
 * legs on one side of it put into the net. Pure data, tested without a browser.
 */

/** A piece of wire with current in it, drawn from where the current comes from to where it goes. */
export interface Flow {
  from: Point;
  to: Point;
  amperes: number;
}

/** Below this a wire is shown as carrying nothing: input pins and leakage. */
const VISIBLE_CURRENT = 5e-6;

const keyOf = (point: Point) => `${point.x},${point.y}`;

export function currentFlows(layout: DiagramLayout, legCurrents: Record<string, number>): Flow[] {
  const flows: Flow[] = [];

  // Through the parts themselves, so the flow reads as one path and not as separate stubs:
  // along a two-leg part from the leg the current enters by, and up through a battery from − to +.
  for (const part of layout.parts) {
    if (part.box || part.component.type === 'transistor') continue;
    const [entry, exit] =
      part.component.type === 'battery'
        ? [part.pins.find((pin) => pin.name === 'neg'), part.pins.find((pin) => pin.name === 'pos')]
        : [
            part.pins.find((pin) => pin.side === 'left'),
            part.pins.find((pin) => pin.side === 'right'),
          ];
    const amperes = entry && legCurrents[`${part.id}.${entry.name}`];
    if (!entry || !exit || amperes === undefined || Math.abs(amperes) < VISIBLE_CURRENT) continue;
    const a = { x: entry.x, y: entry.y };
    const b = { x: exit.x, y: exit.y };
    flows.push(amperes > 0 ? { from: a, to: b, amperes } : { from: b, to: a, amperes: -amperes });
  }

  layout.nets.forEach((net, index) => {
    if (net.segments.length === 0) return;
    // What each leg tip puts into the net: the opposite of what flows into the part there.
    // A tip whose current is not known makes its whole piece of the net unknown.
    const injected = new Map<string, number | null>();
    for (const part of layout.parts) {
      for (const pin of part.pins) {
        if (pin.net !== index) continue;
        const current = legCurrents[`${part.id}.${pin.name}`];
        const key = keyOf(pin);
        const before = injected.get(key);
        injected.set(
          key,
          current === undefined || before === null ? null : (before ?? 0) - current,
        );
      }
    }
    // A supply or ground symbol, or a flag, takes or gives whatever its wire needs.
    const open = new Set(layout.terminals.filter((terminal) => terminal.net === index).map(keyOf));

    // Cut every wire at the points where something joins it, giving plain end-to-end pieces.
    const points = new Map<string, Point>();
    const note = (point: Point) => points.set(keyOf(point), { x: point.x, y: point.y });
    for (const s of net.segments) {
      note({ x: s.x1, y: s.y1 });
      note({ x: s.x2, y: s.y2 });
    }
    for (const part of layout.parts) part.pins.filter((pin) => pin.net === index).forEach(note);
    layout.terminals.filter((terminal) => terminal.net === index).forEach(note);
    const links = new Map<string, Set<string>>();
    const link = (a: Point, b: Point) => {
      if (keyOf(a) === keyOf(b)) return;
      for (const [from, to] of [
        [a, b],
        [b, a],
      ] as const) {
        const set = links.get(keyOf(from)) ?? new Set<string>();
        set.add(keyOf(to));
        links.set(keyOf(from), set);
      }
    };
    for (const s of net.segments) {
      const vertical = s.x1 === s.x2;
      const along = (p: Point) => (vertical ? p.y : p.x);
      const low = Math.min(along({ x: s.x1, y: s.y1 }), along({ x: s.x2, y: s.y2 }));
      const high = Math.max(along({ x: s.x1, y: s.y1 }), along({ x: s.x2, y: s.y2 }));
      const on = [...points.values()]
        .filter(
          (p) => (vertical ? p.x === s.x1 : p.y === s.y1) && along(p) >= low && along(p) <= high,
        )
        .sort((a, b) => along(a) - along(b));
      for (let i = 0; i + 1 < on.length; i++) link(on[i]!, on[i + 1]!);
    }

    // Walk each connected piece from an open end if it has one, adding up what the far side injects.
    const seen = new Set<string>();
    for (const start of points.keys()) {
      if (seen.has(start)) continue;
      const piece: string[] = [];
      const queue = [start];
      seen.add(start);
      while (queue.length > 0) {
        const at = queue.pop()!;
        piece.push(at);
        for (const next of links.get(at) ?? []) {
          if (!seen.has(next)) {
            seen.add(next);
            queue.push(next);
          }
        }
      }
      if (piece.some((key) => injected.get(key) === null)) continue;
      const edges = piece.reduce((count, key) => count + (links.get(key)?.size ?? 0), 0) / 2;
      if (edges !== piece.length - 1) continue; // a loop: the split between its two sides is not known

      const root = piece.find((key) => open.has(key)) ?? piece[0]!;
      const order: { key: string; parent: string | null }[] = [];
      const stack: { key: string; parent: string | null }[] = [{ key: root, parent: null }];
      while (stack.length > 0) {
        const node = stack.pop()!;
        order.push(node);
        for (const next of links.get(node.key) ?? []) {
          if (next !== node.parent) stack.push({ key: next, parent: node.key });
        }
      }
      const carried = new Map<string, number>();
      for (const node of order.reverse()) {
        const total = (carried.get(node.key) ?? 0) + (injected.get(node.key) ?? 0);
        if (node.parent === null) continue;
        carried.set(node.parent, (carried.get(node.parent) ?? 0) + total);
        if (Math.abs(total) < VISIBLE_CURRENT) continue;
        // What the far side injects flows towards the root; a negative total flows away from it.
        const here = points.get(node.key)!;
        const parent = points.get(node.parent)!;
        flows.push(
          total > 0
            ? { from: here, to: parent, amperes: total }
            : { from: parent, to: here, amperes: -total },
        );
      }
    }
  });
  return flows;
}
