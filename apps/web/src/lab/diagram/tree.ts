import {
  boardTerminals,
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
  isGroundLeg,
  isSupplyLeg,
  pinLabel,
  boardPowerPins,
  pinNames,
  type Analysis,
  type DiagramLayout,
  type DiagramPart,
  type DiagramPin,
  type DiagramTerminal,
  type Point,
  type Segment,
  type Side,
} from './nets';

/**
 * The layout for circuits built round a board, drawn the way they are drawn by
 * hand. The board stands on the left. Each pin in use leads off to the right
 * through the parts wired to it, branching where a net has several legs, so a
 * pin's whole circuit reads along one line. Supply and ground are not wired
 * across the page: every leg on them ends in its own small supply or ground
 * symbol, which is what keeps the drawing from becoming a tangle. A module
 * wired to several pins sits on parallel lines from the board.
 *
 * The drawing is a tree. A connection that would close a loop in it is not
 * routed; both ends get a flag with the same name instead. That is always
 * correct, and in school circuits it is rare.
 *
 * It works in two passes. Building: each part becomes a block that knows how
 * much room it needs above, below and to the right, including everything
 * hanging off it. Emitting: blocks are given their place and write out symbols,
 * wires and terminals.
 */

interface Block {
  up: number;
  down: number;
  width: number;
  /** Draws the block with its entry point (the tip of its left leg) at (x, y). */
  emit(x: number, y: number): void;
}

const EMPTY: Block = { up: 0, down: 0, width: 0, emit() {} };

const MARGIN = 40;
/** Wire between a leg and whatever comes next. */
const STUB = 16;
/** Wire from a branching point to each branch. */
const FAN = 14;
/** Clear space between one branch and the next. */
const GAP_Y = 14;
const TWO_LEG = 80;
/** Room a two-leg symbol and its name need above and below its line. */
const HALF = 36;
const BOX_LEG = 12;
/** Distance between the parallel lines into one module. */
const LANE = 20;
const BOX_PIN_SPACING = 34;
const HUB_WIDTH = 104;

const STEP: Record<Side, [number, number]> = {
  left: [-1, 0],
  right: [1, 0],
  up: [0, -1],
  down: [0, 1],
};

const isTwoLeg = (component: CircuitComponent) =>
  !BOX_TYPES.has(component.type) &&
  component.type !== 'battery' &&
  component.type !== 'transistor' &&
  component.type !== 'potentiometer';

export function layoutTree(
  circuit: CircuitDocument,
  hub: CircuitComponent,
  analysis: Analysis,
): DiagramLayout {
  const { netLegs, kinds, netOfLeg } = analysis;
  const parts: DiagramPart[] = [];
  const segments: Segment[][] = netLegs.map(() => []);
  const dots: Point[][] = netLegs.map(() => []);
  const terminals: DiagramTerminal[] = [];

  const placed = new Set<string>([hub.id]);
  /** Nets whose wires are drawn, and where each one starts. */
  const visited = new Set<number>();
  const anchor = new Map<number, Point>();
  /** Nets that have a flag somewhere, and so need one on their wires too. */
  const flagged = new Set<number>();
  const hubPinY = new Map<string, number>();
  const hubTipX = MARGIN + HUB_WIDTH + BOX_LEG;

  const keyOf = (component: CircuitComponent, pin: string) => `${component.id}.${pin}`;
  const hubLegOn = (net: number) => netLegs[net]!.find((leg) => leg.component.id === hub.id);
  /** The name on a net's flags: the board pin it belongs to, when it has one. */
  const flagName = (net: number) => {
    const leg = hubLegOn(net);
    return leg ? pinLabel(hub, leg.pin) : `N${net + 1}`;
  };
  // The ground everything is measured against: the board's. Any other ground net is only named.
  const mainGround = (() => {
    const boards = kinds.findIndex((kind, net) => kind === 'ground' && hubLegOn(net) !== undefined);
    return boards >= 0 ? boards : kinds.indexOf('ground');
  })();

  const wire = (net: number, ...points: [number, number][]) => {
    for (let i = 0; i + 1 < points.length; i++) {
      const [x1, y1] = points[i]!;
      const [x2, y2] = points[i + 1]!;
      if (x1 !== x2 || y1 !== y2) segments[net]!.push({ x1, y1, x2, y2 });
    }
  };
  const pinAt = (
    component: CircuitComponent,
    name: string,
    x: number,
    y: number,
    side: Side,
  ): DiagramPin => ({
    name,
    label: pinLabel(component, name),
    net: netOfLeg(component, name),
    x,
    y,
    side,
  });

  /** A flag at a leg that is not wired to the rest of its net on the page. */
  function flagBlock(net: number, side: Side): Block {
    flagged.add(net);
    const sideways = side === 'left' || side === 'right';
    return {
      up: sideways ? 10 : 26,
      down: sideways ? 10 : 26,
      width: side === 'right' ? 46 : 0,
      emit: (x, y) => terminals.push({ kind: 'flag', net, x, y, side, text: flagName(net) }),
    };
  }

  /** A supply or ground symbol at a leg pointing `side`. */
  function terminalBlock(net: number, side: Side): Block {
    const supply = kinds[net] === 'supply';
    const wants: Side = supply ? 'up' : 'down';
    const symbol = supply || net === mainGround;
    // A second, separate ground is named after its battery rather than drawn as the ground symbol.
    const battery = netLegs[net]!.find((leg) => leg.component.type === 'battery');
    const text = symbol ? null : `${battery?.component.id ?? `N${net + 1}`}−`;
    const kind = !symbol ? 'flag' : supply ? 'supply' : 'ground';
    return {
      up: 34,
      down: 34,
      width: side === 'right' ? 46 : 0,
      emit(x, y) {
        if (!symbol || side === wants) {
          terminals.push({ kind, net, x, y, side, text });
        } else if (side === 'left' || side === 'right') {
          // Out a little, then up to a supply bar or down to a ground symbol.
          const out = x + STEP[side][0] * 12;
          const end = y + (supply ? -12 : 12);
          wire(net, [x, y], [out, y], [out, end]);
          terminals.push({ kind, net, x: out, y: end, side: wants, text });
        } else {
          // The leg points the wrong way for the symbol: name it instead.
          terminals.push({ kind: 'flag', net, x, y, side, text });
        }
      },
    };
  }

  /** What hangs off a leg whose tip points `side`. Only a leg pointing right can lead on to more parts. */
  function legBlock(component: CircuitComponent, pin: string, side: Side): Block {
    const net = netOfLeg(component, pin);
    if (net === null) return EMPTY;
    if (kinds[net] !== 'signal') return terminalBlock(net, side);
    if (visited.has(net) || side !== 'right') return flagBlock(net, side);
    visited.add(net);
    return netBlock(net, keyOf(component, pin));
  }

  /** The parts on a net, fanned out to the right of the leg the net is entered by. */
  function netBlock(net: number, entryKey: string): Block {
    const direct = netLegs[net]!.length === 2 && hubLegOn(net) !== undefined;
    // Claim every part on this net first, so a part is drawn here, next to its
    // neighbours, and not reached the long way round through one of them.
    const claimed = netLegs[net]!.filter(
      (leg) => keyOf(leg.component, leg.pin) !== entryKey && !placed.has(leg.component.id),
    );
    const unique = claimed.filter(
      (leg, i) => claimed.findIndex((other) => other.component.id === leg.component.id) === i,
    );
    for (const leg of unique) placed.add(leg.component.id);

    interface Kid {
      block: Block;
      plain: boolean;
      /** For a part in parallel with an earlier one: that part's index and the net they share. */
      join: { to: number; net: number } | null;
    }
    const kids: Kid[] = [];
    const firstInto = new Map<number, number>();
    for (const leg of unique) {
      const component = leg.component;
      let join: Kid['join'] = null;
      if (isTwoLeg(component)) {
        const far = netOfLeg(
          component,
          pinNames(component).find((name) => name !== leg.pin)!,
        );
        if (far !== null && kinds[far] === 'signal') {
          const first = firstInto.get(far);
          if (first !== undefined && kids.slice(first).every((kid) => kid.plain)) {
            join = { to: first, net: far };
          } else if (first === undefined && !visited.has(far)) {
            firstInto.set(far, kids.length);
          }
        }
      }
      kids.push({
        block: partBlock(component, leg.pin, { direct, bare: join !== null }),
        plain: isTwoLeg(component),
        join,
      });
    }

    const count = kids.length;
    const kidX = count > 1 ? STUB + FAN : STUB;
    const ys: number[] = [];
    kids.forEach((kid, i) => {
      ys.push(i === 0 ? 0 : ys[i - 1]! + kids[i - 1]!.block.down + GAP_Y + kid.block.up);
    });
    return {
      up: count > 0 ? kids[0]!.block.up : 12,
      down: count > 0 ? ys[count - 1]! + kids[count - 1]!.block.down : 12,
      width: kidX + Math.max(0, ...kids.map((kid) => kid.block.width)) + 8,
      emit(x, y) {
        anchor.set(net, { x, y });
        wire(net, [x, y], [x + kidX, y]);
        if (count > 1) {
          wire(net, [x + STUB, y], [x + STUB, y + ys[count - 1]!]);
          kids.forEach((_, i) => {
            if (i > 0) wire(net, [x + STUB, y + ys[i]!], [x + kidX, y + ys[i]!]);
            if (i < count - 1) dots[net]!.push({ x: x + STUB, y: y + ys[i]! });
          });
        }
        kids.forEach((kid, i) => {
          kid.block.emit(x + kidX, y + ys[i]!);
          if (kid.join) {
            // Parallel parts: close the far ends with a short wire up to the first of them.
            const end = x + kidX + TWO_LEG;
            const top = y + ys[kid.join.to]!;
            wire(kid.join.net, [end, y + ys[i]!], [end + 6, y + ys[i]!], [end + 6, top]);
            dots[kid.join.net]!.push({ x: end + 6, y: top });
          }
        });
      },
    };
  }

  /** A part entered by one of its legs from the left. */
  function partBlock(
    component: CircuitComponent,
    entryPin: string,
    options: { direct: boolean; bare: boolean },
  ): Block {
    const natural = naturalBlock(component, entryPin, options);
    if (natural) return natural;
    // This part cannot be drawn entered by that leg. Leave it for later and name the wire.
    placed.delete(component.id);
    return flagBlock(netOfLeg(component, entryPin)!, 'right');
  }

  function naturalBlock(
    component: CircuitComponent,
    entryPin: string | null,
    options: { direct: boolean; bare: boolean },
  ): Block | null {
    const names = pinNames(component);
    const push = (
      x: number,
      y: number,
      width: number,
      flipped: boolean,
      box: DiagramPart['box'],
      pins: DiagramPin[],
    ) => parts.push({ id: component.id, component, x, y, width, flipped, box, pins });
    /** A leg that leads on to more parts, if its net is not drawn yet. */
    const fanOut = (pin: string): Block | null => {
      const net = netOfLeg(component, pin);
      if (net === null || kinds[net] !== 'signal' || visited.has(net)) return null;
      visited.add(net);
      return netBlock(net, keyOf(component, pin));
    };

    if (BOX_TYPES.has(component.type)) return boxBlock(component, entryPin, options.direct);
    if (component.type === 'battery') return null;

    if (component.type === 'transistor') {
      if (entryPin !== 'base') return null;
      // Base on the left; collector leads off above, emitter below.
      const above = fanOut('collector');
      const below = fanOut('emitter');
      const top = above ? Math.max(40, above.down + 12) : 30;
      const bottom = below ? Math.max(40, below.up + 12) : 30;
      const collector = above ?? legBlock(component, 'collector', 'up');
      const emitter = below ?? legBlock(component, 'emitter', 'down');
      return {
        up: top + (above ? above.up : collector.up),
        down: bottom + (below ? below.down : emitter.down),
        width: Math.max(60, 40 + collector.width, 40 + emitter.width),
        emit(x, y) {
          push(x, y, 60, false, null, [
            pinAt(component, 'base', x, y, 'left'),
            pinAt(component, 'collector', x + 40, y - 30, 'up'),
            pinAt(component, 'emitter', x + 40, y + 30, 'down'),
          ]);
          const collectorNet = netOfLeg(component, 'collector');
          const emitterNet = netOfLeg(component, 'emitter');
          if (above) wire(collectorNet!, [x + 40, y - 30], [x + 40, y - top]);
          if (below) wire(emitterNet!, [x + 40, y + 30], [x + 40, y + bottom]);
          collector.emit(x + 40, y - top);
          emitter.emit(x + 40, y + bottom);
        },
      };
    }

    if (component.type === 'potentiometer') {
      if (entryPin === 'wiper') {
        // The wire comes up into the wiper from below; the track's two ends are above it.
        const right = legBlock(component, 'b', 'right');
        const left = legBlock(component, 'a', 'left');
        return {
          up: 34 + Math.max(34, right.up, left.up),
          down: Math.max(12, right.down - 34),
          width: 14 + TWO_LEG + right.width,
          emit(x, y) {
            const sx = x + 14;
            const sy = y - 34;
            push(sx, sy, TWO_LEG, false, null, [
              pinAt(component, 'a', sx, sy, 'left'),
              pinAt(component, 'wiper', sx + 40, sy + 26, 'down'),
              pinAt(component, 'b', sx + TWO_LEG, sy, 'right'),
            ]);
            wire(netOfLeg(component, 'wiper')!, [x, y], [sx + 40, y], [sx + 40, sy + 26]);
            left.emit(sx, sy);
            right.emit(sx + TWO_LEG, sy);
          },
        };
      }
      const flipped = entryPin === 'b';
      const farPin = flipped ? 'a' : 'b';
      const far = options.bare ? EMPTY : legBlock(component, farPin, 'right');
      const wiperNet = netOfLeg(component, 'wiper');
      const wiperUp = wiperNet !== null && kinds[wiperNet] === 'supply';
      const hanging = fanOut('wiper');
      const drop = hanging ? Math.max(40, far.down + GAP_Y + hanging.up) : 26;
      const wiper = hanging ?? legBlock(component, 'wiper', wiperUp ? 'up' : 'down');
      return {
        up: Math.max(HALF, far.up, wiperUp ? 26 + wiper.up : 0),
        down: Math.max(HALF, far.down, wiperUp ? 0 : drop + wiper.down),
        width: Math.max(TWO_LEG + far.width, 40 + wiper.width),
        emit(x, y) {
          const wiperY = y + (wiperUp ? -26 : 26);
          push(x, y, TWO_LEG, flipped, null, [
            pinAt(component, entryPin ?? 'a', x, y, 'left'),
            pinAt(component, 'wiper', x + 40, wiperY, wiperUp ? 'up' : 'down'),
            pinAt(component, farPin, x + TWO_LEG, y, 'right'),
          ]);
          far.emit(x + TWO_LEG, y);
          if (hanging) wire(wiperNet!, [x + 40, wiperY], [x + 40, y + drop]);
          wiper.emit(x + 40, hanging ? y + drop : wiperY);
        },
      };
    }

    // Everything else has two legs: in on the left, out on the right.
    const entry = entryPin ?? names[0]!;
    const farPin = names.find((name) => name !== entry)!;
    const far = options.bare ? EMPTY : legBlock(component, farPin, 'right');
    return {
      up: Math.max(HALF, far.up),
      down: Math.max(HALF, far.down),
      width: TWO_LEG + far.width,
      emit(x, y) {
        push(x, y, TWO_LEG, entry === names[1], null, [
          pinAt(component, entry, x, y, 'left'),
          pinAt(component, farPin, x + TWO_LEG, y, 'right'),
        ]);
        far.emit(x + TWO_LEG, y);
      },
    };
  }

  /**
   * A module drawn as a box. The leg it is entered by is on its left, with any
   * other legs wired straight to board pins on parallel lines below it. Legs
   * leading on to more parts are on the right, supply on top, ground underneath.
   */
  function boxBlock(component: CircuitComponent, entryPin: string | null, direct: boolean): Block {
    const sparse = SPARSE_BOX_TYPES.has(component.type);
    const left: { name: string; hubPin: string | null; net: number | null }[] = [];
    const right: { name: string; block: Block }[] = [];
    const top: { name: string; block: Block }[] = [];
    const bottom: { name: string; block: Block }[] = [];
    if (entryPin) left.push({ name: entryPin, hubPin: null, net: null });
    for (const name of pinNames(component)) {
      if (name === entryPin || name === 'gnd2') continue;
      const net = netOfLeg(component, name);
      if (net === null) {
        if (!sparse) bottom.push({ name, block: EMPTY });
      } else if (kinds[net] === 'supply') {
        top.push({ name, block: terminalBlock(net, 'up') });
      } else if (kinds[net] === 'ground') {
        bottom.push({ name, block: terminalBlock(net, 'down') });
      } else {
        const boardLeg = netLegs[net]!.length === 2 ? hubLegOn(net) : undefined;
        if (direct && boardLeg && !visited.has(net)) {
          visited.add(net);
          left.push({ name, hubPin: boardLeg.pin, net });
        } else {
          right.push({ name, block: legBlock(component, name, 'right') });
        }
      }
    }

    const rightY: number[] = [];
    right.forEach((leg, i) => {
      const previous = right[i - 1];
      rightY.push(
        i === 0
          ? 0
          : Math.max(
              rightY[i - 1]! + LANE,
              rightY[i - 1]! + previous!.block.down + 6 + leg.block.up,
            ),
      );
    });
    const boxTop = -LANE;
    const boxBottom = Math.max(
      Math.max(LANE * (left.length - 1), rightY.at(-1) ?? 0, 0) + LANE,
      component.type === 'logic' ? boxTop + LOGIC_BOX_HEIGHT : 0,
    );
    const gates = gatesInUse(component, (name) => netOfLeg(component, name) !== null).length;
    const width = Math.max(
      96,
      (Math.max(top.length, bottom.length) + 1) * BOX_PIN_SPACING,
      logicBoxWidth(gates),
    );
    const topRoom = top.length > 0 ? BOX_LEG + 34 : 6;
    const bottomRoom = bottom.some((leg) => leg.block !== EMPTY) ? BOX_LEG + 34 : BOX_LEG + 6;
    const lastRight = right.at(-1);
    return {
      up: Math.max(-boxTop + topRoom, right[0]?.block.up ?? 0),
      down: Math.max(boxBottom + bottomRoom, lastRight ? rightY.at(-1)! + lastRight.block.down : 0),
      width: BOX_LEG + width + BOX_LEG + Math.max(0, ...right.map((leg) => leg.block.width)),
      emit(x, y) {
        const boxX = x + BOX_LEG;
        const tipX = boxX + width + BOX_LEG;
        const spread = (i: number, count: number) =>
          boxX + Math.round((width * (i + 1)) / (count + 1));
        parts.push({
          id: component.id,
          component,
          x: boxX,
          y,
          width,
          flipped: false,
          box: { width, height: boxBottom - boxTop, top: boxTop },
          pins: [
            ...left.map((leg, i) => pinAt(component, leg.name, x, y + LANE * i, 'left')),
            ...right.map((leg, i) => pinAt(component, leg.name, tipX, y + rightY[i]!, 'right')),
            ...top.map((leg, i) =>
              pinAt(component, leg.name, spread(i, top.length), y + boxTop - BOX_LEG, 'up'),
            ),
            ...bottom.map((leg, i) =>
              pinAt(component, leg.name, spread(i, bottom.length), y + boxBottom + BOX_LEG, 'down'),
            ),
          ],
        });
        left.forEach((leg, i) => {
          if (leg.hubPin === null || leg.net === null) return;
          // A straight line from the board pin to this leg.
          hubPinY.set(leg.hubPin, y + LANE * i);
          anchor.set(leg.net, { x: hubTipX, y: y + LANE * i });
          wire(leg.net, [hubTipX, y + LANE * i], [x, y + LANE * i]);
        });
        right.forEach((leg, i) => leg.block.emit(tipX, y + rightY[i]!));
        top.forEach((leg, i) => leg.block.emit(spread(i, top.length), y + boxTop - BOX_LEG));
        bottom.forEach((leg, i) =>
          leg.block.emit(spread(i, bottom.length), y + boxBottom + BOX_LEG),
        );
      },
    };
  }

  /** A part nothing leads to from the board, drawn on its own with every leg leading off it. */
  function islandBlock(component: CircuitComponent): Block {
    if (component.type === 'battery') {
      const plus = legBlock(component, 'pos', 'up');
      const minus = legBlock(component, 'neg', 'down');
      return {
        up: 30 + Math.max(plus.up, 8),
        down: 30 + Math.max(minus.down, 8),
        width: 50 + 40 + 30,
        emit(x, y) {
          const sx = x + 50;
          parts.push({
            id: component.id,
            component,
            x: sx,
            y,
            width: 40,
            flipped: false,
            box: null,
            pins: [
              pinAt(component, 'pos', sx + 20, y - 30, 'up'),
              pinAt(component, 'neg', sx + 20, y + 30, 'down'),
            ],
          });
          plus.emit(sx + 20, y - 30);
          minus.emit(sx + 20, y + 30);
        },
      };
    }
    if (BOX_TYPES.has(component.type)) return boxBlock(component, null, false);

    // Put on the left the leg that leads nowhere further, so the rest can lead off to the right.
    const names = pinNames(component);
    const leadsOn = (name: string) => {
      const net = netOfLeg(component, name);
      return net !== null && kinds[net] === 'signal' && !visited.has(net);
    };
    const entry =
      component.type === 'transistor'
        ? 'base'
        : (names.filter((name) => name !== 'wiper').find((name) => !leadsOn(name)) ?? names[0]!);
    const lead = legBlock(component, entry, 'left');
    const body = naturalBlock(component, entry, { direct: false, bare: false })!;
    return {
      up: Math.max(body.up, lead.up),
      down: Math.max(body.down, lead.down),
      width: 50 + body.width,
      emit(x, y) {
        lead.emit(x + 50, y);
        body.emit(x + 50, y);
      },
    };
  }

  // --- the board's pins, top to bottom, each with everything that hangs off it ---
  let cursor = MARGIN + 52;
  for (const pin of isProgrammable(hub) ? boardTerminals(hub.type) : []) {
    if (isSupplyLeg(hub, pin) || isGroundLeg(hub, pin)) continue;
    const net = netOfLeg(hub, pin);
    if (net === null || hubPinY.has(pin)) continue; // unused, or already a parallel line into a module
    let block: Block;
    if (kinds[net] !== 'signal') block = terminalBlock(net, 'right');
    else if (visited.has(net)) block = flagBlock(net, 'right');
    else {
      visited.add(net);
      block = netBlock(net, keyOf(hub, pin));
    }
    const y = cursor + block.up;
    block.emit(hubTipX, y);
    hubPinY.set(pin, y);
    cursor = y + block.down + GAP_Y;
  }

  const pinYs = [...hubPinY.values()];
  const hubTop = (pinYs.length > 0 ? Math.min(...pinYs) : cursor + 22) - 22;
  const hubBottom = (pinYs.length > 0 ? Math.max(...pinYs) : cursor + 22) + 22;
  const hubPins: DiagramPin[] = [...hubPinY.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([pin, y]) => pinAt(hub, pin, hubTipX, y, 'right'));
  const power = (pin: string, x: number, y: number, side: Side) => {
    const net = netOfLeg(hub, pin);
    if (net === null) return;
    hubPins.push(pinAt(hub, pin, x, y, side));
    terminalBlock(net, side).emit(x, y);
  };
  // The board's supply sockets along its top (one, or the ESP32's two) and its ground below.
  const { supplies, ground } = boardPowerPins(hub.type === 'esp32' ? 'esp32' : 'uno');
  supplies.forEach((pin, i) =>
    power(pin, MARGIN + (HUB_WIDTH * (i + 1)) / (supplies.length + 1), hubTop - BOX_LEG, 'up'),
  );
  power(ground, MARGIN + HUB_WIDTH / 2, hubBottom + BOX_LEG, 'down');
  parts.unshift({
    id: hub.id,
    component: hub,
    x: MARGIN,
    y: (hubTop + hubBottom) / 2,
    width: HUB_WIDTH,
    flipped: false,
    box: { width: HUB_WIDTH, height: hubBottom - hubTop, top: -(hubBottom - hubTop) / 2 },
    pins: hubPins,
  });
  cursor = Math.max(cursor, hubBottom + BOX_LEG + 34 + GAP_Y);

  // --- parts the board does not lead to: batteries first, then the rest, in rows underneath ---
  const widest = Math.max(
    640,
    ...parts.map((part) => part.x + part.width),
    ...terminals.map((terminal) => terminal.x + 40),
  );
  const leftover = [
    ...circuit.components.filter((component) => component.type === 'battery'),
    ...circuit.components.filter((component) => component.type !== 'battery'),
  ];
  let islandX = MARGIN;
  let rowTop = cursor + 6;
  let rowBottom = rowTop;
  for (const component of leftover) {
    if (placed.has(component.id)) continue;
    placed.add(component.id);
    const block = islandBlock(component);
    if (islandX > MARGIN && islandX + block.width > widest) {
      islandX = MARGIN;
      rowTop = rowBottom + GAP_Y * 2;
    }
    block.emit(islandX, rowTop + block.up);
    islandX += block.width + 46;
    rowBottom = Math.max(rowBottom, rowTop + block.up + block.down);
  }

  // A net with a flag at one of its legs carries the same flag on its wires.
  for (const net of flagged) {
    const at = anchor.get(net);
    if (at)
      terminals.push({ kind: 'flag', net, x: at.x + 8, y: at.y, side: 'up', text: flagName(net) });
  }

  // --- size: everything drawn, plus a margin ---
  const xs: number[] = [];
  const ys: number[] = [];
  for (const part of parts) {
    xs.push(part.x - 12, part.x + part.width + 12);
    ys.push(
      part.y + (part.box ? part.box.top : -HALF),
      part.y + (part.box ? part.box.top + part.box.height : HALF),
    );
    for (const leg of part.pins) {
      xs.push(leg.x);
      ys.push(leg.y);
    }
  }
  for (const net of segments) {
    for (const s of net) {
      xs.push(s.x1, s.x2);
      ys.push(s.y1, s.y2);
    }
  }
  for (const terminal of terminals) {
    xs.push(terminal.x - 34, terminal.x + 46);
    ys.push(terminal.y - 30, terminal.y + 30);
  }
  const shiftX = MARGIN - Math.min(...xs);
  const shiftY = MARGIN - Math.min(...ys);
  const move = <T extends Point>(point: T): T => ({
    ...point,
    x: point.x + shiftX,
    y: point.y + shiftY,
  });
  return {
    width: Math.max(...xs) + shiftX + MARGIN,
    height: Math.max(...ys) + shiftY + MARGIN,
    parts: parts.map((part) => ({ ...move(part), pins: part.pins.map(move) })),
    nets: netLegs.map((_, net) => ({
      ...analysis.describe(net),
      segments: segments[net]!.map((s) => ({
        x1: s.x1 + shiftX,
        y1: s.y1 + shiftY,
        x2: s.x2 + shiftX,
        y2: s.y2 + shiftY,
      })),
      dots: dots[net]!.map(move),
      labelAt: null,
      groundAt: null,
    })),
    terminals: terminals.map(move),
  };
}
