import { describe, expect, it } from 'vitest';
import { allHoles, holeAt, holeCoordinates, parseHole, stripOf } from './breadboard';
import {
  emptyCircuit,
  isCircuitDocument,
  migrateCircuit,
  unoPinNumber,
  type CircuitDocument,
} from './circuit';
import {
  addBattery,
  addUno,
  addWire,
  flipPart,
  moveOffBoardPart,
  movePart,
  movePin,
  setWireBends,
  moveWireEnd,
  PART_SHAPES,
  placePart,
  removeItem,
  updateProps,
  type BoardPartType,
  type EditResult,
} from './editing';
import { PART_DEFINITIONS } from '@banglalab/parts';
import { ledCircuitExample, unoCircuitExample } from './examples';

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
    expect(isCircuitDocument({ ...example, schemaVersion: 7 })).toBe(false);
    expect(isCircuitDocument({ ...example, wires: [{ id: 'W1', from: 'a1' }] })).toBe(false);
    expect(
      isCircuitDocument({
        ...example,
        components: [
          { id: 'R1', type: 'resistor', pins: { a: 'z9', b: 'a1' }, props: { resistance: 1 } },
        ],
      }),
    ).toBe(false);
    expect(isCircuitDocument(null)).toBe(false);
  });
});

describe('document versions', () => {
  it('opens documents from every earlier version as the current version', () => {
    const v1 = { ...ledCircuitExample(), schemaVersion: 1 };
    expect(isCircuitDocument(v1)).toBe(false);
    expect(migrateCircuit(v1)).toEqual(ledCircuitExample());
    expect(migrateCircuit({ ...unoCircuitExample(), schemaVersion: 2 })).toEqual(
      unoCircuitExample(),
    );
    expect(migrateCircuit(ledCircuitExample())).toEqual(ledCircuitExample());
  });

  it('refuses unknown versions and non-documents', () => {
    expect(migrateCircuit({ ...ledCircuitExample(), schemaVersion: 99 })).toBeNull();
    expect(migrateCircuit({ schemaVersion: 1, components: 'x', wires: [] })).toBeNull();
    expect(migrateCircuit('circuit')).toBeNull();
    expect(migrateCircuit(null)).toBeNull();
  });
});

describe('UNO board, button and potentiometer', () => {
  it('accepts the UNO example', () => {
    expect(isCircuitDocument(unoCircuitExample())).toBe(true);
  });

  it('maps sockets to Arduino pin numbers', () => {
    expect(unoPinNumber('d13')).toBe(13);
    expect(unoPinNumber('a0')).toBe(14);
    expect(unoPinNumber('a5')).toBe(19);
    expect(unoPinNumber('5v')).toBeNull();
    expect(unoPinNumber('gnd')).toBeNull();
  });

  it('allows one board, with one wire per socket', () => {
    const circuit = ok(addUno(emptyCircuit()));
    expect(addUno(circuit)).toEqual({ ok: false, error: 'board-limit' });
    const wired = ok(addWire(circuit, 'UNO1.d13', 'a1'));
    expect(addWire(wired, 'UNO1.d13', 'a2')).toEqual({ ok: false, error: 'hole-occupied' });
    expect(addWire(wired, 'UNO1.d99', 'a2')).toEqual({ ok: false, error: 'unknown-endpoint' });
    expect(addWire(wired, 'UNO1.gnd', 'UNO1.gnd2').ok).toBe(true);
    // Removing the board unplugs its wires.
    expect(ok(removeItem(wired, 'UNO1')).wires).toEqual([]);
  });

  it('places a potentiometer on three neighbouring columns and keeps it rigid', () => {
    let circuit = ok(placePart(emptyCircuit(), 'potentiometer', 'c20'));
    expect(circuit.components[0]).toMatchObject({
      id: 'POT1',
      pins: { a: 'c20', wiper: 'c21', b: 'c22' },
      props: { resistance: 10_000, position: 0.5 },
    });
    expect(movePin(circuit, 'POT1', 'wiper', 'c25')).toEqual({ ok: false, error: 'unknown-item' });
    circuit = ok(movePart(circuit, 'POT1', 3, 1));
    expect(circuit.components[0]).toMatchObject({ pins: { a: 'd23', wiper: 'd24', b: 'd25' } });
    circuit = ok(flipPart(circuit, 'POT1'));
    expect(circuit.components[0]).toMatchObject({ pins: { a: 'd25', wiper: 'd24', b: 'd23' } });
    expect(ok(updateProps(circuit, 'POT1', { position: 1 })).components[0]).toMatchObject({
      props: { position: 1 },
    });
    expect(updateProps(circuit, 'POT1', { position: 1.2 })).toEqual({
      ok: false,
      error: 'invalid-value',
    });
  });

  it('places the other leads to the left when there is no room on the right', () => {
    const circuit = ok(placePart(emptyCircuit(), 'potentiometer', 'a30'));
    expect(circuit.components[0]).toMatchObject({ pins: { a: 'a30', wiper: 'a29', b: 'a28' } });
    const button = ok(placePart(emptyCircuit(), 'button', 'e7'));
    expect(button.components[0]).toMatchObject({ id: 'SW1', pins: { a: 'e7', b: 'e9' } });
  });
});

describe('the rest of the parts library', () => {
  it('places every kind of part with sensible leads, ids and starting values', () => {
    const placed = (type: Parameters<typeof placePart>[1]) =>
      ok(placePart(emptyCircuit(), type, 'c10')).components[0];
    expect(placed('switch')).toEqual({
      id: 'S1',
      type: 'switch',
      pins: { a: 'c10', b: 'c12' },
      props: { closed: false },
    });
    expect(placed('diode')).toEqual({
      id: 'D1',
      type: 'diode',
      pins: { anode: 'c10', cathode: 'c13' },
      props: {},
    });
    expect(placed('ldr')).toMatchObject({
      id: 'LDR1',
      pins: { a: 'c10', b: 'c12' },
      props: { light: 0.5 },
    });
    expect(placed('buzzer')).toMatchObject({ id: 'BZ1', pins: { pos: 'c10', neg: 'c12' } });
    expect(placed('motor')).toMatchObject({ id: 'M1', pins: { a: 'c10', b: 'c13' } });
    expect(placed('transistor')).toMatchObject({
      id: 'Q1',
      pins: { collector: 'c10', base: 'c11', emitter: 'c12' },
    });
    expect(placed('temperature')).toMatchObject({
      id: 'TMP1',
      pins: { vcc: 'c10', out: 'c11', gnd: 'c12' },
      props: { celsius: 25 },
    });
    expect(placed('soil')).toMatchObject({ id: 'SOIL1', props: { moisture: 0.3 } });
    expect(placed('ir')).toMatchObject({ id: 'IR1', props: { detected: false } });
    expect(placed('servo')).toMatchObject({
      id: 'SRV1',
      pins: { gnd: 'c10', vcc: 'c11', signal: 'c12' },
    });
    expect(placed('ultrasonic')).toMatchObject({
      id: 'US1',
      pins: { vcc: 'c10', trig: 'c11', echo: 'c12', gnd: 'c13' },
      props: { distance: 50 },
    });
    const lcd = placed('lcd');
    expect(lcd).toMatchObject({
      id: 'LCD1',
      pins: { vss: 'c10', rs: 'c13', e: 'c15', d4: 'c20', d7: 'c23', k: 'c25' },
    });
    expect(Object.keys((lcd as { pins: object }).pins)).toHaveLength(16);
    // Sixteen pins need sixteen free columns: near the right edge it goes leftwards instead.
    expect(ok(placePart(emptyCircuit(), 'lcd', 'c20')).components[0]).toMatchObject({
      pins: { vss: 'c20', k: 'c5' },
    });
  });

  it('keeps three-lead parts rigid and validates their settings', () => {
    let circuit = ok(placePart(emptyCircuit(), 'transistor', 'c10'));
    expect(movePin(circuit, 'Q1', 'base', 'c14')).toEqual({ ok: false, error: 'unknown-item' });
    circuit = ok(flipPart(circuit, 'Q1'));
    expect(circuit.components[0]).toMatchObject({
      pins: { collector: 'c12', base: 'c11', emitter: 'c10' },
    });

    circuit = ok(placePart(circuit, 'temperature', 'h10'));
    expect(ok(updateProps(circuit, 'TMP1', { celsius: 40 })).components[1]).toMatchObject({
      props: { celsius: 40 },
    });
    expect(updateProps(circuit, 'TMP1', { celsius: 300 })).toEqual({
      ok: false,
      error: 'invalid-value',
    });
    circuit = ok(placePart(circuit, 'switch', 'h20'));
    expect(updateProps(circuit, 'S1', { closed: 'yes' })).toEqual({
      ok: false,
      error: 'invalid-value',
    });
    expect(isCircuitDocument(circuit)).toBe(true);
  });
});

describe('part shapes and part definitions', () => {
  it('agree for every part that plugs into the board', () => {
    // Parts move from the PART_SHAPES table to JSON definitions one at a time.
    // Until all have moved, this keeps the two descriptions of a part identical.
    const modelled = PART_DEFINITIONS.filter(
      (definition) =>
        definition.placement &&
        definition.simulates !== null &&
        (definition.status === 'simulated' ||
          // A stand-in definition describes the generic part it borrows, not its own legs.
          (definition.status === 'generic' && definition.model.level !== 'none')),
    );
    expect(modelled.length).toBe(Object.keys(PART_SHAPES).length);
    for (const definition of modelled) {
      const shape = PART_SHAPES[definition.simulates as BoardPartType];
      expect(shape, definition.id).toBeDefined();
      expect(
        {
          idPrefix: definition.placement!.idPrefix,
          pins: definition.pins.map((pin) => pin.id),
          offsets: definition.placement!.offsets,
          maxSpan: definition.placement!.maxSpan,
        },
        definition.id,
      ).toEqual({
        ...shape,
        pins: [...shape.pins],
        offsets: [...shape.offsets],
        maxSpan: shape.maxSpan,
      });
    }
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
    expect(movePin(circuit, 'LED1', 'cathode', 'c9')).toEqual({
      ok: false,
      error: 'hole-occupied',
    });
  });

  it('places the second lead to the left at the right-hand edge', () => {
    const circuit = ok(placePart(emptyCircuit(), 'resistor', 'a29'));
    expect(circuit.components[0]).toMatchObject({ pins: { a: 'a29', b: 'a25' } });
  });

  it('limits how far leads can stretch', () => {
    const circuit = ledCircuitExample();
    expect(movePin(circuit, 'LED1', 'cathode', 'd20')).toEqual({
      ok: false,
      error: 'lead-too-long',
    });
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
    expect(updateProps(circuit, 'R1', { resistance: -5 })).toEqual({
      ok: false,
      error: 'invalid-value',
    });
    expect(updateProps(circuit, 'LED1', { color: 'pink' })).toEqual({
      ok: false,
      error: 'invalid-value',
    });
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

  it('moves batteries and the board, and keeps their wires', () => {
    const circuit = ok(moveOffBoardPart(unoCircuitExample(), 'UNO1', { x: 3.5, y: 22 }));
    expect(circuit.components.find((c) => c.id === 'UNO1')).toMatchObject({
      at: { x: 3.5, y: 22 },
    });
    expect(circuit.wires).toEqual(unoCircuitExample().wires);
    expect(isCircuitDocument(circuit)).toBe(true);

    const battery = ok(moveOffBoardPart(ledCircuitExample(), 'BAT1', { x: -6, y: 4 }));
    expect(battery.components[0]).toMatchObject({ id: 'BAT1', at: { x: -6, y: 4 } });
  });

  it('refuses to move a board part, an unknown part or to a place off the work surface', () => {
    const circuit = ledCircuitExample();
    expect(moveOffBoardPart(circuit, 'R1', { x: 0, y: 0 })).toEqual({
      ok: false,
      error: 'unknown-item',
    });
    expect(moveOffBoardPart(circuit, 'nope', { x: 0, y: 0 }).ok).toBe(false);
    expect(moveOffBoardPart(circuit, 'BAT1', { x: 5000, y: 0 })).toEqual({
      ok: false,
      error: 'no-room',
    });
    expect(moveOffBoardPart(circuit, 'BAT1', { x: Number.NaN, y: 0 }).ok).toBe(false);
  });

  it('opens a version 4 document, which has no stored positions', () => {
    const opened = migrateCircuit({ ...unoCircuitExample(), schemaVersion: 4 });
    expect(opened).toEqual(unoCircuitExample());
  });

  it('routes a wire through bend points and straightens it again', () => {
    const bent = ok(
      setWireBends(ledCircuitExample(), 'W3', [
        { x: 2, y: 3 },
        { x: 4.5, y: 3 },
      ]),
    );
    expect(bent.wires.find((w) => w.id === 'W3')!.bends).toHaveLength(2);
    expect(isCircuitDocument(bent)).toBe(true);
    // Moving an end keeps the route.
    const moved = ok(moveWireEnd(bent, 'W3', 'to', 'b5'));
    expect(moved.wires.find((w) => w.id === 'W3')!.bends).toHaveLength(2);

    const straight = ok(setWireBends(bent, 'W3', []));
    expect(straight).toEqual(ledCircuitExample());
    expect('bends' in straight.wires.find((w) => w.id === 'W3')!).toBe(false);

    const tooMany = Array.from({ length: 9 }, (_, i) => ({ x: i, y: 1 }));
    expect(setWireBends(bent, 'W3', tooMany)).toEqual({ ok: false, error: 'invalid-value' });
    expect(setWireBends(bent, 'nope', []).ok).toBe(false);
  });

  it('never mutates the document it was given', () => {
    const circuit = ledCircuitExample();
    const snapshot = JSON.parse(JSON.stringify(circuit));
    placePart(circuit, 'led', 'h3');
    addWire(circuit, 'g1', 'g2');
    removeItem(circuit, 'R1');
    updateProps(circuit, 'R1', { resistance: 1000 });
    expect(circuit).toEqual(snapshot);
  });
});
