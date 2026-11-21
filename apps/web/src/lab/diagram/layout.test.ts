import {
  addBattery,
  addWire,
  emptyCircuit,
  ledCircuitExample,
  placePart,
  unoCircuitExample,
  type CircuitDocument,
  type EditResult,
} from '@banglalab/shared';
import { describe, expect, it } from 'vitest';
import { findNets, layoutDiagram, type DiagramLayout } from './layout';

function ok(result: EditResult): CircuitDocument {
  if (!result.ok) throw new Error(`edit refused: ${result.error}`);
  return result.circuit;
}
const legsOf = (layout: DiagramLayout) => layout.nets.map((net) => [...net.legs].sort());
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
    expect(series.segments[0]!.y1).toBe(layout.baseline);
    expect(series.segments[0]!.y2).toBe(layout.baseline);
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

describe('diagram of the UNO circuit', () => {
  const layout = layoutDiagram(unoCircuitExample());

  it('shows the board as a box with only the sockets in use', () => {
    const board = layout.parts.find((part) => part.id === 'UNO1')!;
    expect(board.box).not.toBeNull();
    expect(board.pins.map((pin) => pin.label).sort()).toEqual(['5V', 'A0', 'D13', 'D2', 'GND']);
    // The 5 V socket leaves from the top, towards the supply rail; the rest from the bottom.
    expect(board.pins.find((pin) => pin.label === '5V')!.side).toBe('up');
    expect(board.pins.find((pin) => pin.label === 'D13')!.side).toBe('down');
  });

  it('connects every leg of every net, with a dot where three meet', () => {
    expect(legsOf(layout)).toContainEqual(['LED1.anode', 'R1.b']);
    const ground = netWith(layout, 'UNO1.gnd');
    expect(ground.kind).toBe('ground');
    expect(ground.legs.length).toBeGreaterThanOrEqual(3);
    expect(ground.dots.length).toBe(ground.legs.length - 2);
    expectRightAngles(layout);
    expectNoSharedColumns(layout);
  });

  it('turns a transistor leg round when its net lies the other way', () => {
    let circuit = ok(placePart(unoCircuitExample(), 'transistor', 'h24')); // C h24, B h25, E h26
    circuit = ok(addWire(circuit, 'j24', 'bn20')); // collector to an unused rail
    circuit = ok(addWire(circuit, 'bn21', 'j10')); // … and on to another free strip
    circuit = ok(placePart(circuit, 'resistor', 'i10'));
    const withTransistor = layoutDiagram(circuit);
    const net = netWith(withTransistor, 'Q1.collector');
    expect(net.kind).toBe('signal');
    // Up from the collector, across to a free column, then down to the track: three wires at least.
    expect(net.segments.length).toBeGreaterThanOrEqual(4);
    expectRightAngles(withTransistor);
    expectNoSharedColumns(withTransistor);
  });
});
