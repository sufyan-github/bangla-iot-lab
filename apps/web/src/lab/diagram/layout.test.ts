import {
  addBattery,
  addEsp32,
  addMotorDriver,
  addWire,
  attachError,
  emptyCircuit,
  ledCircuitExample,
  placePart,
  unoCircuitExample,
  type BoardPartType,
  type CircuitDocument,
  type EditResult,
} from '@banglalab/shared';
import { describe, expect, it } from 'vitest';
import {
  LOGIC_BOX_HEIGHT,
  findNets,
  gatesInUse,
  layoutDiagram,
  logicBoxWidth,
  type DiagramLayout,
} from './layout';

function ok(result: EditResult): CircuitDocument {
  if (!result.ok) throw new Error(`edit refused: ${result.error}`);
  return result.circuit;
}
const netWith = (layout: DiagramLayout, leg: string) =>
  layout.nets.find((net) => net.legs.includes(leg))!;

/** Every drawn segment must be horizontal or vertical: a schematic has right-angle wires only. */
function expectRightAngles(layout: DiagramLayout) {
  for (const net of layout.nets) {
    for (const s of net.segments) expect(s.x1 === s.x2 || s.y1 === s.y2).toBe(true);
  }
}

/** Vertical wires of different nets must never lie on top of one another. */
function expectNoSharedColumns(layout: DiagramLayout) {
  const seen: { net: number; x: number; top: number; bottom: number }[] = [];
  layout.nets.forEach((net, index) => {
    for (const s of net.segments) {
      if (s.x1 !== s.x2) continue;
      const run = { net: index, x: s.x1, top: Math.min(s.y1, s.y2), bottom: Math.max(s.y1, s.y2) };
      for (const other of seen) {
        const overlaps =
          other.net !== index &&
          other.x === run.x &&
          other.top < run.bottom &&
          run.top < other.bottom;
        expect(overlaps).toBe(false);
      }
      seen.push(run);
    }
  });
}

describe('nets', () => {
  it('joins legs through breadboard strips and wires', () => {
    const nets = findNets(ledCircuitExample()).map((legs) =>
      legs.map((leg) => `${leg.component.id}.${leg.pin}`).sort(),
    );
    expect(nets).toContainEqual(['BAT1.pos', 'R1.a']);
    expect(nets).toContainEqual(['LED1.anode', 'R1.b']);
    expect(nets).toContainEqual(['BAT1.neg', 'LED1.cathode']);
    expect(nets).toHaveLength(3);
  });

  it('leaves out legs that are joined to nothing', () => {
    const circuit = ok(placePart(ledCircuitExample(), 'resistor', 'h20'));
    expect(findNets(circuit)).toHaveLength(3);
    const layout = layoutDiagram(circuit);
    expect(layout.parts.find((part) => part.id === 'R2')!.pins.map((pin) => pin.net)).toEqual([
      null,
      null,
    ]);
  });
});

describe('diagram of the LED circuit', () => {
  const layout = layoutDiagram(ledCircuitExample());

  it('draws a rail for + and for ground, and joins the series parts directly', () => {
    expect(netWith(layout, 'BAT1.pos').kind).toBe('supply');
    expect(netWith(layout, 'BAT1.pos').source).toEqual({ type: 'battery', voltage: 9 });
    expect(netWith(layout, 'BAT1.neg').kind).toBe('ground');
    expect(netWith(layout, 'BAT1.neg').groundAt).not.toBeNull();
    // Resistor to LED: one straight wire along the baseline, no track.
    const series = netWith(layout, 'R1.b');
    expect(series.segments).toHaveLength(1);
    const line = layout.parts.find((part) => part.id === 'R1')!.y;
    expect(series.segments[0]!.y1).toBe(line);
    expect(series.segments[0]!.y2).toBe(line);
  });

  it('puts the battery first and the parts in the order the current meets them', () => {
    expect(layout.parts.map((part) => part.id)).toEqual(['BAT1', 'R1', 'LED1']);
    // The LED's anode faces the resistor.
    const led = layout.parts[2]!;
    expect(led.pins[0]).toMatchObject({ name: 'anode', side: 'left' });
    expect(led.flipped).toBe(false);
  });

  it('uses right-angle wires only, inside the drawing', () => {
    expectRightAngles(layout);
    expectNoSharedColumns(layout);
    for (const net of layout.nets) {
      for (const s of net.segments) {
        for (const [x, y] of [
          [s.x1, s.y1],
          [s.x2, s.y2],
        ] as const) {
          expect(x).toBeGreaterThan(0);
          expect(x).toBeLessThan(layout.width);
          expect(y).toBeGreaterThan(0);
          expect(y).toBeLessThan(layout.height);
        }
      }
    }
  });

  it('mirrors an LED that was put in the other way round', () => {
    let circuit = ok(addBattery(emptyCircuit()));
    circuit = ok(placePart(circuit, 'led', 'd9')); // anode d9, cathode d10
    circuit = ok(addWire(circuit, 'BAT1.pos', 'a10')); // + to the cathode
    circuit = ok(addWire(circuit, 'BAT1.neg', 'a9'));
    const reversed = layoutDiagram(circuit);
    const led = reversed.parts.find((part) => part.id === 'LED1')!;
    expect(led.flipped).toBe(true);
    expect(led.pins[0]).toMatchObject({ name: 'cathode', side: 'left' });
  });
});

describe('rails layout, a leg pointing away from its net', () => {
  it('turns a transistor leg round through a free column', () => {
    let circuit = ok(addBattery(emptyCircuit()));
    circuit = ok(placePart(circuit, 'transistor', 'h24')); // C h24, B h25, E h26
    circuit = ok(placePart(circuit, 'resistor', 'i10')); // i10 to i14
    circuit = ok(placePart(circuit, 'led', 'h16')); // anode h16, cathode h17
    circuit = wired(circuit, [
      ['Q1.collector', 'R1.a'], // the collector's net is neither supply nor ground
      ['R1.b', 'LED1.anode'],
      ['LED1.cathode', 'BAT1.neg'],
      ['Q1.emitter', 'BAT1.neg'],
      ['Q1.base', 'BAT1.pos'],
    ]);
    const layout = layoutDiagram(circuit);
    const net = netWith(layout, 'Q1.collector');
    expect(net.kind).toBe('signal');
    expect(layout.terminals).toHaveLength(0);
    expectSound(layout);
  });
});

/** A hole in the same strip as an endpoint that a wire can still go into. */
function tapInto(circuit: CircuitDocument, endpoint: string): string {
  const [id, pin] = endpoint.split('.');
  const part = circuit.components.find((c) => c.id === id);
  if (!part || !('pins' in part)) {
    // A battery clip takes any number of wires; a board socket only one, so share it through a rail.
    if (part?.type !== 'uno') return endpoint;
    const rail = pin === '5v' ? 'bp' : pin === 'gnd' ? 'bn' : null;
    if (!rail) return endpoint;
    for (let column = 1; column <= 29; column++) {
      if (attachError(circuit, `${rail}${column}`) === null) return `${rail}${column}`;
    }
    throw new Error('rail is full');
  }
  const hole = (part.pins as Record<string, string>)[pin!]!;
  const column = hole.slice(1);
  const rows = 'abcde'.includes(hole[0]!) ? 'abcde' : 'fghij';
  for (const row of rows) {
    if (attachError(circuit, `${row}${column}`) === null) return `${row}${column}`;
  }
  throw new Error(`no free hole beside ${endpoint}`);
}

/** Joins legs by name, through free holes in their strips, as a student would. */
function wired(circuit: CircuitDocument, pairs: [string, string][]): CircuitDocument {
  let next = circuit;
  // The board's power sockets take one wire each; bring them out to the bottom rails once.
  if (next.components.some((c) => c.id === 'UNO1') && attachError(next, 'bp29') === null) {
    next = ok(addWire(next, 'tp25', 'bp29'));
    next = ok(addWire(next, 'tn25', 'bn29'));
  }
  for (const [from, to] of pairs) {
    const a = tapInto(next, from);
    next = ok(addWire(next, a, tapInto(ok(addWire(next, a, 'j30')), to)));
  }
  return next;
}

function placed(circuit: CircuitDocument, parts: [BoardPartType, string][]): CircuitDocument {
  return parts.reduce((next, [type, hole]) => ok(placePart(next, type, hole)), circuit);
}

/**
 * What every diagram must get right, whatever the circuit:
 * wires are horizontal or vertical; every leg of a net is joined to the others,
 * by wire or by a shared terminal or flag; wires of different nets never lie on
 * top of one another; and no wire runs through a symbol.
 */
function expectSound(layout: DiagramLayout) {
  expectRightAngles(layout);
  const on = (
    p: { x: number; y: number },
    s: { x1: number; y1: number; x2: number; y2: number },
  ) =>
    s.x1 === s.x2
      ? p.x === s.x1 && p.y >= Math.min(s.y1, s.y2) && p.y <= Math.max(s.y1, s.y2)
      : p.y === s.y1 && p.x >= Math.min(s.x1, s.x2) && p.x <= Math.max(s.x1, s.x2);

  layout.nets.forEach((net, index) => {
    const tips = layout.parts.flatMap((part) =>
      part.pins.filter((pin) => pin.net === index).map((pin) => ({ x: pin.x, y: pin.y })),
    );
    expect(tips.length, `legs drawn for net ${net.legs.join(' ')}`).toBe(net.legs.length);
    const ends = layout.terminals.filter((t) => t.net === index).map((t) => ({ x: t.x, y: t.y }));
    // Group points joined by this net's wires; terminals and flags of one net count as joined.
    const points = [
      ...tips,
      ...ends,
      ...net.segments.flatMap((s) => [
        { x: s.x1, y: s.y1 },
        { x: s.x2, y: s.y2 },
      ]),
    ];
    const group = points.map((_, i) => i);
    const find = (i: number): number => (group[i] === i ? i : (group[i] = find(group[i]!)));
    const join = (a: number, b: number) => (group[find(a)] = find(b));
    for (const segment of net.segments) {
      const touching = points.map((p, i) => (on(p, segment) ? i : -1)).filter((i) => i >= 0);
      touching.forEach((i) => join(i, touching[0]!));
    }
    points.forEach((p, i) => points.forEach((q, j) => p.x === q.x && p.y === q.y && join(i, j)));
    ends.forEach((_, i) => join(tips.length + i, tips.length));
    const groups = new Set(tips.map((_, i) => find(i)));
    expect(groups.size, `net ${net.legs.join(' ')} is drawn in ${groups.size} pieces`).toBe(1);
  });

  // Wires of different nets may cross, but never run along each other.
  const runs = layout.nets.flatMap((net, index) => net.segments.map((s) => ({ ...s, net: index })));
  for (const a of runs) {
    for (const b of runs) {
      if (a.net >= b.net) continue;
      const vertical = a.x1 === a.x2 && b.x1 === b.x2 && a.x1 === b.x1;
      const horizontal = a.y1 === a.y2 && b.y1 === b.y2 && a.y1 === b.y1;
      const overlap = vertical
        ? Math.min(Math.max(a.y1, a.y2), Math.max(b.y1, b.y2)) -
          Math.max(Math.min(a.y1, a.y2), Math.min(b.y1, b.y2))
        : horizontal
          ? Math.min(Math.max(a.x1, a.x2), Math.max(b.x1, b.x2)) -
            Math.max(Math.min(a.x1, a.x2), Math.min(b.x1, b.x2))
          : -1;
      expect(overlap, `wires of two nets overlap near ${a.x1},${a.y1}`).toBeLessThanOrEqual(0);
    }
  }

  // No wire through the body of a symbol.
  for (const part of layout.parts) {
    const body = part.box
      ? {
          left: part.x,
          right: part.x + part.box.width,
          top: part.y + part.box.top,
          bottom: part.y + part.box.top + part.box.height,
        }
      : {
          left: part.x + 10,
          right: part.x + part.width - 10,
          top: part.y - 10,
          bottom: part.y + 10,
        };
    for (const s of runs) {
      const crosses =
        Math.max(s.x1, s.x2) > body.left &&
        Math.min(s.x1, s.x2) < body.right &&
        Math.max(s.y1, s.y2) > body.top &&
        Math.min(s.y1, s.y2) < body.bottom;
      expect(crosses, `a wire runs through ${part.id}`).toBe(false);
    }
  }

  // Symbols do not overlap one another.
  const boxes = layout.parts.map((part) =>
    part.box
      ? {
          id: part.id,
          left: part.x,
          right: part.x + part.box.width,
          top: part.y + part.box.top,
          bottom: part.y + part.box.top + part.box.height,
        }
      : {
          id: part.id,
          left: part.x,
          right: part.x + part.width,
          top: part.y - 14,
          bottom: part.y + 14,
        },
  );
  for (const a of boxes) {
    for (const b of boxes) {
      if (a.id >= b.id) continue;
      const apart =
        a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top;
      expect(apart, `${a.id} and ${b.id} overlap`).toBe(true);
    }
  }
}

describe('diagram of a circuit built round the board', () => {
  const layout = layoutDiagram(unoCircuitExample());
  const partNamed = (drawn: DiagramLayout, id: string) =>
    drawn.parts.find((part) => part.id === id)!;

  it('puts the board on the left with a line leading off each pin in use', () => {
    const board = partNamed(layout, 'UNO1');
    expect(board.box).not.toBeNull();
    expect(Math.min(...layout.parts.map((part) => part.x))).toBe(board.x);
    const lines = board.pins.filter((pin) => pin.side === 'right');
    expect(lines.map((pin) => pin.label)).toEqual(['D2', 'D13', 'A0']);
    expect(board.pins.find((pin) => pin.label === '5V')!.side).toBe('up');
    expect(board.pins.find((pin) => pin.label === 'GND')!.side).toBe('down');
  });

  it("draws each pin's parts along its own line", () => {
    const d13 = partNamed(layout, 'UNO1').pins.find((pin) => pin.label === 'D13')!;
    expect(partNamed(layout, 'R1').y).toBe(d13.y);
    expect(partNamed(layout, 'LED1').y).toBe(d13.y);
    expect(partNamed(layout, 'LED1').x).toBeGreaterThan(partNamed(layout, 'R1').x);
    // The LED's anode faces the resistor, as the current flows.
    expect(partNamed(layout, 'LED1').pins[0]).toMatchObject({ name: 'anode', side: 'left' });
  });

  it('ends supply and ground legs in their own symbols instead of wiring them across', () => {
    const ground = netWith(layout, 'UNO1.gnd');
    expect(ground.kind).toBe('ground');
    const grounds = layout.terminals.filter((terminal) => terminal.kind === 'ground');
    expect(grounds).toHaveLength(ground.legs.length);
    expect(layout.terminals.filter((terminal) => terminal.kind === 'supply')).toHaveLength(2);
    expect(layout.terminals.filter((terminal) => terminal.kind === 'flag')).toHaveLength(0);
    expectSound(layout);
  });

  it("brings a potentiometer's wiper in from the pin, with its ends on supply and ground", () => {
    const pot = partNamed(layout, 'POT1');
    const a0 = partNamed(layout, 'UNO1').pins.find((pin) => pin.label === 'A0')!;
    expect(pot.pins.find((pin) => pin.name === 'wiper')!.side).toBe('down');
    expect(pot.y).toBeLessThan(a0.y);
  });
});

describe('diagrams of busier board circuits', () => {
  it('runs parallel lines from the board to a module wired to several pins', () => {
    let circuit = placed(unoCircuitExample(), [['ultrasonic', 'h3']]);
    circuit = wired(circuit, [
      ['US1.vcc', 'UNO1.5v'],
      ['US1.trig', 'UNO1.d9'],
      ['US1.echo', 'UNO1.d10'],
      ['US1.gnd', 'UNO1.gnd'],
    ]);
    const layout = layoutDiagram(circuit);
    const sensor = layout.parts.find((part) => part.id === 'US1')!;
    const board = layout.parts.find((part) => part.id === 'UNO1')!;
    const leg = (name: string) => sensor.pins.find((pin) => pin.name === name)!;
    const socket = (label: string) => board.pins.find((pin) => pin.label === label)!;
    expect(leg('trig').side).toBe('left');
    expect(leg('echo').side).toBe('left');
    expect(leg('trig').y).toBe(socket('D9').y);
    expect(leg('echo').y).toBe(socket('D10').y);
    expect(leg('vcc').side).toBe('up');
    expect(leg('gnd').side).toBe('down');
    // Each is one straight wire.
    expect(netWith(layout, 'US1.echo').segments).toHaveLength(1);
    expectSound(layout);
  });

  it('draws a transistor switching a motor, with its diode in parallel', () => {
    let circuit = placed(unoCircuitExample(), [
      ['resistor', 'h1'], // R2: h1 to h5
      ['transistor', 'h8'], // Q1: C h8, B h9, E h10
      ['motor', 'h13'], // M1: h13 to h16
      ['diode', 'h19'], // D1: h19 to h22
    ]);
    circuit = wired(circuit, [
      ['UNO1.d5', 'R2.a'],
      ['R2.b', 'Q1.base'],
      ['Q1.emitter', 'UNO1.gnd'],
      ['Q1.collector', 'M1.a'],
      ['M1.b', 'UNO1.5v'],
      ['D1.anode', 'Q1.collector'],
      ['D1.cathode', 'UNO1.5v'],
    ]);
    const layout = layoutDiagram(circuit);
    const part = (id: string) => layout.parts.find((p) => p.id === id)!;
    // Pin, resistor, base along one line; the motor and diode lead off the collector, above.
    expect(part('Q1').y).toBe(part('R2').y);
    expect(part('Q1').pins.find((pin) => pin.name === 'base')!.side).toBe('left');
    expect(part('M1').y).toBeLessThan(part('Q1').y);
    expect(part('D1').y).toBeLessThan(part('Q1').y);
    expect(layout.terminals.filter((terminal) => terminal.kind === 'flag')).toHaveLength(0);
    expectSound(layout);
  });

  it('closes two parts in parallel with a short wire instead of a flag', () => {
    let circuit = placed(unoCircuitExample(), [
      ['resistor', 'g1'], // R2
      ['resistor', 'i1'], // R3, in the same strips as R2: in parallel with it
      ['led', 'h8'], // LED2: anode h8, cathode h9
    ]);
    circuit = wired(circuit, [
      ['UNO1.d7', 'R2.a'],
      ['R2.b', 'LED2.anode'],
      ['LED2.cathode', 'UNO1.gnd'],
    ]);
    const layout = layoutDiagram(circuit);
    const part = (id: string) => layout.parts.find((p) => p.id === id)!;
    expect(part('R3').x).toBe(part('R2').x);
    expect(part('R3').y).toBeGreaterThan(part('R2').y);
    expect(layout.terminals.filter((terminal) => terminal.kind === 'flag')).toHaveLength(0);
    expectSound(layout);
  });

  it('draws a battery the board does not lead to on its own, between its two terminals', () => {
    let circuit = ok(addBattery(unoCircuitExample()));
    circuit = placed(circuit, [['motor', 'h13']]);
    circuit = wired(circuit, [
      ['BAT1.pos', 'M1.a'],
      ['M1.b', 'UNO1.gnd'],
      ['BAT1.neg', 'UNO1.gnd'],
    ]);
    const layout = layoutDiagram(circuit);
    const battery = layout.parts.find((part) => part.id === 'BAT1')!;
    const board = layout.parts.find((part) => part.id === 'UNO1')!;
    expect(battery.y).toBeGreaterThan(board.y);
    expect(netWith(layout, 'BAT1.pos').source).toEqual({ type: 'battery', voltage: 9 });
    expectSound(layout);
  });

  it('names a connection it cannot draw, at both ends', () => {
    // The button's far leg goes back to another board pin: a loop the tree cannot close.
    let circuit = placed(unoCircuitExample(), [['button', 'h3']]); // SW2: h3, h5
    circuit = wired(circuit, [
      ['UNO1.d4', 'SW2.a'],
      ['SW2.b', 'UNO1.d7'],
    ]);
    const layout = layoutDiagram(circuit);
    const flags = layout.terminals.filter((terminal) => terminal.kind === 'flag');
    expect(flags.map((flag) => flag.text)).toEqual(['D7', 'D7']);
    expectSound(layout);
  });

  it('keeps every kind of part sound in one crowded circuit', () => {
    let circuit = placed(unoCircuitExample(), [
      ['lcd', 'h1'], // 16 legs, h1 to h16
      ['potentiometer', 'h19'], // POT2 for the contrast
      ['temperature', 'h24'],
      ['servo', 'c26'],
      ['ldr', 'b1'], // LDR1: b1 to b3
      ['relay', 'e24'],
    ]);
    circuit = wired(circuit, [
      ['LCD1.vss', 'UNO1.gnd'],
      ['LCD1.vdd', 'UNO1.5v'],
      ['LCD1.v0', 'POT2.wiper'],
      ['POT2.a', 'UNO1.5v'],
      ['POT2.b', 'UNO1.gnd'],
      ['LCD1.rs', 'UNO1.d12'],
      ['LCD1.rw', 'UNO1.gnd'],
      ['LCD1.e', 'UNO1.d11'],
      ['LCD1.d4', 'UNO1.d6'],
      ['LCD1.d5', 'UNO1.d5'],
      ['LCD1.d6', 'UNO1.d4'],
      ['LCD1.d7', 'UNO1.d3'],
      ['LCD1.a', 'UNO1.5v'],
      ['LCD1.k', 'UNO1.gnd'],
      ['TMP1.vcc', 'UNO1.5v'],
      ['TMP1.out', 'UNO1.a1'],
      ['TMP1.gnd', 'UNO1.gnd'],
      ['SRV1.signal', 'UNO1.d9'],
      ['SRV1.vcc', 'UNO1.5v'],
      ['SRV1.gnd', 'UNO1.gnd'],
      ['LDR1.a', 'UNO1.5v'],
      ['LDR1.b', 'UNO1.a2'],
      ['K1.coil1', 'UNO1.d8'],
      ['K1.coil2', 'UNO1.gnd'],
    ]);
    const layout = layoutDiagram(circuit);
    expect(layout.parts).toHaveLength(circuit.components.length);
    // The display's six data lines run side by side from the board.
    const display = layout.parts.find((part) => part.id === 'LCD1')!;
    expect(display.pins.filter((pin) => pin.side === 'left')).toHaveLength(6);
    expectSound(layout);
  });
});

describe('diagram of a motor driver circuit', () => {
  it('draws the driver as a box with the terminals in use, joined soundly to the rest', () => {
    let circuit = ok(addMotorDriver(ok(addBattery(ok(addEsp32(emptyCircuit())), 7.2))));
    circuit = ok(placePart(circuit, 'motor', 'c10')); // M1: c10 to c13
    for (const [from, to] of [
      ['BAT1.pos', 'DRV1.vs'],
      ['BAT1.neg', 'DRV1.gnd'],
      ['ESP1.gnd1', 'DRV1.gnd'],
      ['ESP1.d26', 'DRV1.in1'],
      ['ESP1.d27', 'DRV1.in2'],
      ['DRV1.out1', 'a10'],
      ['DRV1.out2', 'a13'],
    ] as const) {
      circuit = ok(addWire(circuit, from, to));
    }
    const layout = layoutDiagram(circuit);
    const driver = layout.parts.find((part) => part.id === 'DRV1')!;
    // Only the terminals with something on them are drawn, under the names printed on the module.
    expect(driver.pins.map((pin) => pin.name).sort()).toEqual(
      ['gnd', 'in1', 'in2', 'out1', 'out2', 'vs'].sort(),
    );
    expect(netWith(layout, 'DRV1.out1').legs).toContain('M1.a');
    expect(netWith(layout, 'DRV1.in1').legs).toContain('ESP1.d26');
    expectSound(layout);
  });
});

describe('diagram of a logic chip', () => {
  // A 74HC08 placed at e10 has legs 1 to 7 along row f, columns 10 to 16, and 8 to 14
  // back along row e, so leg 14 (supply) is at e10 and leg 7 (ground) at f16.
  const chip = (circuit: CircuitDocument) => ok(placePart(circuit, 'logic', 'e10'));
  const wire = (circuit: CircuitDocument, pairs: [string, string][]) =>
    pairs.reduce((c, [from, to]) => ok(addWire(c, from, to)), circuit);
  const expectGateBox = (layout: DiagramLayout, gates: number) => {
    const part = layout.parts.find((p) => p.component.type === 'logic')!;
    const connected = new Set(part.pins.filter((pin) => pin.net !== null).map((pin) => pin.name));
    expect(gatesInUse(part.component, (name) => connected.has(name))).toHaveLength(gates);
    expect(part.box!.height).toBeGreaterThanOrEqual(LOGIC_BOX_HEIGHT);
    expect(part.box!.width).toBeGreaterThanOrEqual(logicBoxWidth(gates));
    return part;
  };

  it('makes room in the box for the gates in use when the board drives it', () => {
    let circuit = chip(ok(addEsp32(emptyCircuit())));
    circuit = ok(placePart(circuit, 'led', 'c20'));
    circuit = wire(circuit, [
      ['ESP1.3v3', 'a10'],
      ['ESP1.gnd1', 'j16'],
      ['ESP1.d26', 'g10'], // 1A
      ['ESP1.d27', 'g11'], // 1B
      ['h12', 'a20'], // 1Y to the LED
      ['a21', 'ESP1.gnd2'],
      ['ESP1.d25', 'g13'], // 2A: a second gate in use
    ]);
    const layout = layoutDiagram(circuit);
    const part = expectGateBox(layout, 2);
    expect(part.pins.map((pin) => pin.label).sort()).toEqual(
      ['1A', '1B', '1Y', '2A', 'GND', 'VCC'].sort(),
    );
    expectSound(layout);
  });

  it('makes room for the gates in a circuit with no board', () => {
    let circuit = chip(ok(addBattery(emptyCircuit(), 5)));
    circuit = ok(placePart(circuit, 'led', 'c20'));
    circuit = wire(circuit, [
      ['BAT1.pos', 'a10'],
      ['BAT1.neg', 'j16'],
      ['g10', 'b10'], // 1A tied high
      ['g11', 'c10'], // 1B tied high
      ['h12', 'a20'],
      ['a21', 'BAT1.neg'],
    ]);
    const layout = layoutDiagram(circuit);
    expectGateBox(layout, 1);
    expectSound(layout);
  });
});
