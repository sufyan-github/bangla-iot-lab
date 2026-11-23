import {
  addWire,
  ledCircuitExample,
  placePart,
  removeItem,
  unoCircuitExample,
  type CircuitDocument,
  type EditResult,
} from '@banglalab/shared';
import { simulate } from '@banglalab/simulation';
import { describe, expect, it } from 'vitest';
import { currentFlows, type Flow } from './flow';
import { layoutDiagram, type DiagramLayout } from './layout';

function ok(result: EditResult): CircuitDocument {
  if (!result.ok) throw new Error(`edit refused: ${result.error}`);
  return result.circuit;
}
const tip = (layout: DiagramLayout, leg: string) => {
  const [id, name] = leg.split('.');
  const pin = layout.parts.find((part) => part.id === id)!.pins.find((p) => p.name === name)!;
  return { x: pin.x, y: pin.y };
};
const leaving = (flows: Flow[], at: { x: number; y: number }) =>
  flows.filter((flow) => flow.from.x === at.x && flow.from.y === at.y);
const arriving = (flows: Flow[], at: { x: number; y: number }) =>
  flows.filter((flow) => flow.to.x === at.x && flow.to.y === at.y);

describe('current flow in the battery loop', () => {
  const circuit = ledCircuitExample();
  const layout = layoutDiagram(circuit);
  const result = simulate(circuit);
  const flows = currentFlows(layout, result.legCurrents);
  const current = result.readings.LED1!.current;

  it('runs out of the battery +, through the resistor and LED, and back into −', () => {
    // At every leg one piece of wire brings the current and the part carries it on, or the reverse.
    for (const leg of ['BAT1.pos', 'R1.a', 'R1.b', 'LED1.anode', 'LED1.cathode', 'BAT1.neg']) {
      expect(arriving(flows, tip(layout, leg)), `into ${leg}`).toHaveLength(1);
      expect(leaving(flows, tip(layout, leg)), `out of ${leg}`).toHaveLength(1);
    }
    // Through the resistor from a to b, and up through the battery from − to +.
    const through = (from: string, to: string) =>
      flows.some(
        (flow) =>
          flow.from.x === tip(layout, from).x &&
          flow.from.y === tip(layout, from).y &&
          flow.to.x === tip(layout, to).x &&
          flow.to.y === tip(layout, to).y,
      );
    expect(through('R1.a', 'R1.b')).toBe(true);
    expect(through('LED1.anode', 'LED1.cathode')).toBe(true);
    expect(through('BAT1.neg', 'BAT1.pos')).toBe(true);
  });

  it('carries the same current in every piece of the single loop', () => {
    expect(flows.length).toBeGreaterThan(4);
    for (const flow of flows) expect(flow.amperes).toBeCloseTo(current, 9);
  });

  it('shows nothing when the loop is broken or the circuit is off', () => {
    const open = ok(removeItem(circuit, 'W4'));
    expect(currentFlows(layoutDiagram(open), simulate(open).legCurrents)).toEqual([]);
    expect(currentFlows(layout, {})).toEqual([]);
  });
});

describe('current flow in a board circuit', () => {
  const circuit = unoCircuitExample();
  const layout = layoutDiagram(circuit);
  const high = Array<'input' | 'high'>(20).fill('input');
  high[13] = 'high';
  const result = simulate(circuit, { pressed: [], boards: { UNO1: high } });
  const flows = currentFlows(layout, result.legCurrents);

  it('runs from pin 13 through the resistor and LED to the ground symbol', () => {
    const led = result.readings.LED1!.current;
    expect(led).toBeGreaterThan(5e-3);
    const fromPin = leaving(flows, tip(layout, 'UNO1.d13'));
    expect(fromPin).toHaveLength(1);
    expect(fromPin[0]!.amperes).toBeCloseTo(led, 6);
    expect(arriving(flows, tip(layout, 'R1.a'))).toHaveLength(1);
    // After the LED the wire ends in a ground symbol, and the current runs into it.
    const ground = layout.terminals.find(
      (terminal) => terminal.kind === 'ground' && terminal.x > tip(layout, 'LED1.cathode').x,
    )!;
    expect(arriving(flows, ground)).toHaveLength(1);
  });

  it('shows the small current through the potentiometer but none into an input pin', () => {
    // Its track carries half a milliamp from 5 V to ground; the wiper feeds a high-impedance input.
    expect(arriving(flows, tip(layout, 'POT1.a')).length).toBeGreaterThanOrEqual(1);
    expect(leaving(flows, tip(layout, 'POT1.b')).length).toBeGreaterThanOrEqual(1);
    expect(arriving(flows, tip(layout, 'UNO1.a0'))).toHaveLength(0);
    expect(leaving(flows, tip(layout, 'UNO1.a0'))).toHaveLength(0);
    // The button is open: nothing flows on its line.
    expect(leaving(flows, tip(layout, 'UNO1.d2'))).toHaveLength(0);
  });

  it('splits at a branch so that what goes in comes out', () => {
    // A second resistor and LED from the same pin: the pin's wire carries both branches.
    let two = ok(placePart(circuit, 'resistor', 'BB1.h1')); // R2: h1 to h5
    two = ok(placePart(two, 'led', 'BB1.g8')); // LED2: anode g8, cathode g9
    two = ok(addWire(two, 'BB1.b5', 'BB1.j1')); // pin 13's strip to R2
    two = ok(addWire(two, 'BB1.j5', 'BB1.j8'));
    two = ok(addWire(two, 'BB1.j9', 'BB1.tn3'));
    const drawn = layoutDiagram(two);
    const solved = simulate(two, { pressed: [], boards: { UNO1: high } });
    const split = currentFlows(drawn, solved.legCurrents);
    const out = leaving(split, tip(drawn, 'UNO1.d13'))[0]!.amperes;
    const first = arriving(split, tip(drawn, 'R1.a'))[0]!.amperes;
    const second = arriving(split, tip(drawn, 'R2.a'))[0]!.amperes;
    expect(first).toBeGreaterThan(1e-3);
    expect(second).toBeGreaterThan(1e-3);
    expect(first + second).toBeCloseTo(out, 9);
  });
});
