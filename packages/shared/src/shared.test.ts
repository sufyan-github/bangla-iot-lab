import { describe, expect, it } from 'vitest';
import { allHoles, holeAt, holeCoordinates, parseHole, stripOf } from './breadboard';
import { emptyCircuit, isCircuitDocument, type CircuitDocument } from './circuit';
import {
  addBattery,
  addWire,
  flipPart,
  movePart,
  movePin,
  moveWireEnd,
  placePart,
  removeItem,
  updateProps,
  type EditResult,
} from './editing';
import { ledCircuitExample } from './examples';

function ok(result: EditResult): CircuitDocument {
  if (!result.ok) throw new Error(`edit refused: ${result.error}`);
  return result.circuit;
}

describe('breadboard', () => {
  it('has 300 terminal holes and 100 rail holes', () => {
    expect(allHoles()).toHaveLength(30 * 10 + 4 * 25);
  });

  it('joins five holes per column on each side of the trench', () => {
    expect(stripOf('a7')).toBe(stripOf('e7'));
    expect(stripOf('f7')).toBe(stripOf('j7'));
    expect(stripOf('e7')).not.toBe(stripOf('f7'));
    expect(stripOf('a7')).not.toBe(stripOf('a8'));
  });

  it('joins a whole power rail and keeps the four rails separate', () => {
    expect(stripOf('tp1')).toBe(stripOf('tp29'));
    expect(new Set(['tp1', 'tn1', 'bp1', 'bn1'].map(stripOf)).size).toBe(4);
  });

  it('rejects names that are not holes', () => {
    for (const bad of ['k1', 'a0', 'a31', 'tp6', 'tp30', 'a', '', 'a1x', 'A1']) {
      expect(parseHole(bad), bad).toBeNull();
    }
  });

  it('maps coordinates back to holes', () => {
    for (const hole of allHoles()) {
      const { x, y } = holeCoordinates(hole);
      expect(holeAt(x, y)).toBe(hole);
    }
    expect(holeAt(6, 1)).toBeUndefined(); // gap in the rail
    expect(holeAt(3, 9)).toBeUndefined(); // centre trench
  });
});

describe('circuit document', () => {
  it('accepts the example and an empty circuit', () => {
    expect(isCircuitDocument(ledCircuitExample())).toBe(true);
    expect(isCircuitDocument(emptyCircuit())).toBe(true);
  });

  it('rejects malformed documents', () => {
    const example = ledCircuitExample();
    expect(isCircuitDocument({ ...example, schemaVersion: 2 })).toBe(false);
    expect(isCircuitDocument({ ...example, wires: [{ id: 'W1', from: 'a1' }] })).toBe(false);
    expect(
      isCircuitDocument({
        ...example,
        components: [{ id: 'R1', type: 'resistor', pins: { a: 'z9', b: 'a1' }, props: { resistance: 1 } }],
      }),
    ).toBe(false);
    expect(isCircuitDocument(null)).toBe(false);
  });
});

describe('editing rules', () => {
  it('builds the LED circuit step by step', () => {
    let circuit = ok(addBattery(emptyCircuit()));
    circuit = ok(placePart(circuit, 'resistor', 'c5'));
    circuit = ok(placePart(circuit, 'led', 'd9'));
    circuit = ok(addWire(circuit, 'BAT1.pos', 'tp1'));
    circuit = ok(addWire(circuit, 'BAT1.neg', 'tn1'));
    circuit = ok(addWire(circuit, 'tp4', 'a5'));
    circuit = ok(addWire(circuit, 'a10', 'tn8'));
    expect(circuit).toEqual(ledCircuitExample());
  });

  it('allows one lead per hole', () => {
    const circuit = ledCircuitExample();
    expect(placePart(circuit, 'led', 'c5')).toEqual({ ok: false, error: 'hole-occupied' });
    expect(addWire(circuit, 'a5', 'b1')).toEqual({ ok: false, error: 'hole-occupied' });
    expect(movePin(circuit, 'LED1', 'cathode', 'c9')).toEqual({ ok: false, error: 'hole-occupied' });
  });

  it('places the second lead to the left at the right-hand edge', () => {
    const circuit = ok(placePart(emptyCircuit(), 'resistor', 'a29'));
    expect(circuit.components[0]).toMatchObject({ pins: { a: 'a29', b: 'a25' } });
  });

  it('limits how far leads can stretch', () => {
    const circuit = ledCircuitExample();
    expect(movePin(circuit, 'LED1', 'cathode', 'd20')).toEqual({ ok: false, error: 'lead-too-long' });
    expect(ok(movePin(circuit, 'LED1', 'cathode', 'd11')).components[2]).toMatchObject({
      pins: { anode: 'd9', cathode: 'd11' },
    });
  });

  it('moves a part as a whole and refuses to push it off the board', () => {
    const circuit = ledCircuitExample();
    expect(ok(movePart(circuit, 'R1', 2, 1)).components[1]).toMatchObject({
      pins: { a: 'd7', b: 'd11' },
    });
    expect(movePart(circuit, 'R1', 30, 0)).toEqual({ ok: false, error: 'no-room' });
    expect(movePart(circuit, 'R1', 0, 3)).toEqual({ ok: false, error: 'no-room' }); // trench
  });

  it('flips an LED to reverse its polarity', () => {
    expect(ok(flipPart(ledCircuitExample(), 'LED1')).components[2]).toMatchObject({
      pins: { anode: 'd10', cathode: 'd9' },
    });
  });

  it('validates wires', () => {
    const circuit = ledCircuitExample();
    expect(addWire(circuit, 'b1', 'b1')).toEqual({ ok: false, error: 'same-point' });
    expect(addWire(circuit, 'BAT9.pos', 'b1')).toEqual({ ok: false, error: 'unknown-endpoint' });
    expect(addWire(circuit, 'R1.a', 'b1')).toEqual({ ok: false, error: 'unknown-endpoint' });
    expect(ok(moveWireEnd(circuit, 'W4', 'to', 'tn9')).wires[3]).toMatchObject({ to: 'tn9' });
    // A battery terminal can hold several wires.
    expect(addWire(circuit, 'BAT1.pos', 'bp1').ok).toBe(true);
  });

  it('validates property changes', () => {
    const circuit = ledCircuitExample();
    expect(ok(updateProps(circuit, 'R1', { resistance: 330 })).components[1]).toMatchObject({
      props: { resistance: 330 },
    });
    expect(updateProps(circuit, 'R1', { resistance: -5 })).toEqual({ ok: false, error: 'invalid-value' });
    expect(updateProps(circuit, 'LED1', { color: 'pink' })).toEqual({ ok: false, error: 'invalid-value' });
  });

  it('removes the wires clipped to a removed battery', () => {
    const circuit = ok(removeItem(ledCircuitExample(), 'BAT1'));
    expect(circuit.wires.map((w) => w.id)).toEqual(['W3', 'W4']);
    expect(addBattery(ok(addBattery(circuit))).ok).toBe(true);
    expect(addBattery(ok(addBattery(ok(addBattery(circuit)))))).toEqual({
      ok: false,
      error: 'battery-limit',
    });
  });

  it('never mutates the document it was given', () => {
    const circuit = ledCircuitExample();
    const snapshot = structuredClone(circuit);
    placePart(circuit, 'led', 'h3');
    addWire(circuit, 'g1', 'g2');
    removeItem(circuit, 'R1');
    updateProps(circuit, 'R1', { resistance: 1000 });
    expect(circuit).toEqual(snapshot);
  });
});
