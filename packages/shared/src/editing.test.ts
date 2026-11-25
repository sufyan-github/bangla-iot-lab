import { describe, expect, it } from 'vitest';
import {
  CIRCUIT_SCHEMA_VERSION,
  addWire,
  isCircuitDocument,
  ledCircuitExample,
  migrateCircuit,
  setWireBends,
  setWireStyle,
} from './index';

describe('the style of a wire (D-109)', () => {
  it('a wire is a jumper wire unless it is drawn square, and either can become the other', () => {
    const circuit = ledCircuitExample();
    const jumper = addWire(circuit, 'BB1.e20', 'BB1.e24');
    if (!jumper.ok) throw new Error(jumper.error);
    expect(jumper.circuit.wires.at(-1)).not.toHaveProperty('style');

    const square = addWire(circuit, 'BB1.e20', 'BB1.e24', undefined, 'square');
    if (!square.ok) throw new Error(square.error);
    const id = square.id;
    expect(square.circuit.wires.find((w) => w.id === id)).toMatchObject({ style: 'square' });
    expect(isCircuitDocument(square.circuit)).toBe(true);

    // Its route is kept when it changes style, and when its bends change.
    const routed = setWireBends(square.circuit, id, [{ x: 5, y: 3 }]);
    if (!routed.ok) throw new Error(routed.error);
    expect(routed.circuit.wires.find((w) => w.id === id)).toMatchObject({ style: 'square' });
    const back = setWireStyle(routed.circuit, id, 'jumper');
    if (!back.ok) throw new Error(back.error);
    const wire = back.circuit.wires.find((w) => w.id === id)!;
    expect(wire).not.toHaveProperty('style');
    expect(wire.bends).toEqual([{ x: 5, y: 3 }]);
    expect(setWireStyle(circuit, 'W99', 'square')).toEqual({ ok: false, error: 'unknown-item' });
  });

  it('a circuit saved before wires had a style opens as it was', () => {
    const older = { ...ledCircuitExample(), schemaVersion: 25 };
    const opened = migrateCircuit(older);
    expect(opened?.schemaVersion).toBe(CIRCUIT_SCHEMA_VERSION);
    expect(opened?.wires).toEqual(older.wires);
  });
});
