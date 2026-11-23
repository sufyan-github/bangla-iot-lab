import { describe, expect, it } from 'vitest';
import {
  BREADBOARD_SIZES,
  BREADBOARD_SPECS,
  holesOf,
  isRailHole,
  parseHole,
  stripOf,
} from './breadboard';
import { layoutOf } from './layout';
import {
  CIRCUIT_SCHEMA_VERSION,
  ESP32_TERMINALS,
  L298N_TERMINALS,
  emptyCircuit,
  esp32GpioNumber,
  esp32TerminalOfGpio,
  isCircuitDocument,
  migrateCircuit,
  terminalsOf,
  unoPinNumber,
  type CircuitDocument,
} from './circuit';
import {
  addBattery,
  addBreadboard,
  attachError,
  onBreadboard,
  addEsp32,
  addMotorDriver,
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

/** A circuit as an app before version 21 saved it: one fixed breadboard, holes without its name. */
function beforeBreadboards(circuit: CircuitDocument, schemaVersion: number) {
  const old = (end: string) => end.replace(/^BB1\./, '');
  return {
    schemaVersion,
    components: circuit.components
      .filter((c) => c.type !== 'breadboard')
      .map((c) =>
        'pins' in c
          ? { ...c, pins: Object.fromEntries(Object.entries(c.pins).map(([p, h]) => [p, old(h)])) }
          : c,
      ),
    wires: circuit.wires.map((w) => ({ ...w, from: old(w.from), to: old(w.to) })),
  };
}

function ok(result: EditResult): CircuitDocument {
  if (!result.ok) throw new Error(`edit refused: ${result.error}`);
  return result.circuit;
}

describe('breadboard', () => {
  const half = layoutOf(emptyCircuit());

  it('comes in three sizes, with the holes each is sold with', () => {
    for (const size of BREADBOARD_SIZES) {
      expect(holesOf('BB1', size), size).toHaveLength(BREADBOARD_SPECS[size].holes);
    }
    expect(half.holes()).toHaveLength(30 * 10 + 4 * 25);
    // A full board's rails have ten groups of five; a mini board has no rails at all.
    expect(holesOf('BB1', 'full').filter((h) => isRailHole(h, 'plus'))).toHaveLength(100);
    expect(holesOf('BB1', 'mini').some((h) => isRailHole(h))).toBe(false);
  });

  it('joins five holes per column on each side of the trench', () => {
    expect(stripOf('BB1.a7')).toBe(stripOf('BB1.e7'));
    expect(stripOf('BB1.f7')).toBe(stripOf('BB1.j7'));
    expect(stripOf('BB1.e7')).not.toBe(stripOf('BB1.f7'));
    expect(stripOf('BB1.a7')).not.toBe(stripOf('BB1.a8'));
  });

  it('joins a whole power rail and keeps the four rails separate', () => {
    expect(stripOf('BB1.tp1')).toBe(stripOf('BB1.tp29'));
    expect(new Set(['BB1.tp1', 'BB1.tn1', 'BB1.bp1', 'BB1.bn1'].map(stripOf)).size).toBe(4);
  });

  it('never joins the holes of two breadboards', () => {
    expect(stripOf('BB1.a7')).not.toBe(stripOf('BB2.a7'));
    expect(stripOf('BB1.tp1')).not.toBe(stripOf('BB2.tp1'));
  });

  it('rejects names that are not holes', () => {
    for (const bad of ['k1', 'a1', 'a0', 'BB1.a0', 'BB0.a1', 'XX1.a1', 'BB1.k1', 'BB1.', '']) {
      expect(parseHole(bad), bad).toBeNull();
    }
    // Written as a hole, but not on a half board: column 34, a rail's gap.
    for (const missing of ['BB1.a31', 'BB1.tp6', 'BB1.tp30', 'BB2.a1']) {
      expect(half.has(missing), missing).toBe(false);
    }
  });

  it('maps coordinates back to holes, on every board of a circuit', () => {
    const two = ok(addBreadboard(emptyCircuit(), 'mini', { x: 40, y: 0 }));
    const layout = layoutOf(two);
    for (const hole of layout.holes()) {
      const { x, y } = layout.coordinates(hole)!;
      expect(layout.holeAt(x, y)).toBe(hole);
    }
    expect(layout.holeAt(6, 1)).toBeUndefined(); // gap in the rail
    expect(layout.holeAt(3, 9)).toBeUndefined(); // centre trench
    // The mini board's first hole is 40 pitches to the right of its corner's column 1.
    expect(layout.coordinates('BB2.a1')).toEqual({ x: 41, y: 2 });
  });
});

describe('circuit document', () => {
  it('accepts the example and an empty circuit', () => {
    expect(isCircuitDocument(ledCircuitExample())).toBe(true);
    expect(isCircuitDocument(emptyCircuit())).toBe(true);
  });

  it('rejects malformed documents', () => {
    const example = ledCircuitExample();
    // A version newer than this build knows is not opened.
    expect(isCircuitDocument({ ...example, schemaVersion: CIRCUIT_SCHEMA_VERSION + 1 })).toBe(
      false,
    );
    expect(isCircuitDocument({ ...example, wires: [{ id: 'W1', from: 'BB1.a1' }] })).toBe(false);
    // A hole whose name looks right but which the board does not have: column 34, a rail's gap.
    const wire = { id: 'W9', color: '#000000' };
    expect(
      isCircuitDocument({ ...example, wires: [{ ...wire, from: 'BB1.a1', to: 'BB1.c34' }] }),
    ).toBe(false);
    expect(
      isCircuitDocument({ ...example, wires: [{ ...wire, from: 'BB1.tp6', to: 'BB1.a1' }] }),
    ).toBe(false);
    expect(
      isCircuitDocument({
        ...example,
        components: [
          {
            id: 'R9',
            type: 'resistor',
            pins: { a: 'BB1.c30', b: 'BB1.c34' },
            props: { resistance: 220 },
          },
        ],
      }),
    ).toBe(false);
    expect(
      isCircuitDocument({
        ...example,
        components: [
          { id: 'R1', type: 'resistor', pins: { a: 'z9', b: 'BB1.a1' }, props: { resistance: 1 } },
        ],
      }),
    ).toBe(false);
    expect(isCircuitDocument(null)).toBe(false);
  });
});

describe('document versions', () => {
  it('opens documents from every earlier version as the current version', () => {
    const v1 = beforeBreadboards(ledCircuitExample(), 1);
    expect(isCircuitDocument(v1)).toBe(false);
    expect(migrateCircuit(v1)).toEqual(ledCircuitExample());
    expect(migrateCircuit(beforeBreadboards(unoCircuitExample(), 2))).toEqual(unoCircuitExample());
    expect(migrateCircuit(beforeBreadboards(ledCircuitExample(), 20))).toEqual(ledCircuitExample());
    expect(migrateCircuit(ledCircuitExample())).toEqual(ledCircuitExample());
  });

  it('refuses unknown versions and non-documents', () => {
    expect(migrateCircuit({ ...ledCircuitExample(), schemaVersion: 99 })).toBeNull();
    expect(migrateCircuit({ schemaVersion: 1, components: 'x', wires: [] })).toBeNull();
    expect(migrateCircuit('circuit')).toBeNull();
    expect(migrateCircuit(null)).toBeNull();
  });
});

describe('ESP32 development board', () => {
  it('has 30 pins, each named once', () => {
    expect(ESP32_TERMINALS).toHaveLength(30);
    expect(new Set(ESP32_TERMINALS).size).toBe(30);
  });

  it('knows the GPIO number behind each printed name', () => {
    expect(esp32GpioNumber('d23')).toBe(23);
    expect(esp32GpioNumber('vp')).toBe(36);
    expect(esp32GpioNumber('vn')).toBe(39);
    expect(esp32GpioNumber('rx2')).toBe(16);
    expect(esp32GpioNumber('tx2')).toBe(17);
    expect(esp32GpioNumber('tx0')).toBe(1);
    expect(esp32GpioNumber('rx0')).toBe(3);
    for (const power of ['3v3', 'vin', 'gnd1', 'gnd2', 'en'])
      expect(esp32GpioNumber(power)).toBeNull();
    expect(esp32TerminalOfGpio(36)).toBe('vp');
    expect(esp32TerminalOfGpio(2)).toBe('d2');
    // GPIO 0 and the flash pins are not on the 30-pin headers.
    expect(esp32TerminalOfGpio(0)).toBeNull();
    expect(esp32TerminalOfGpio(6)).toBeNull();
  });

  it('is added beside the breadboard and takes one wire per pin', () => {
    const added = addEsp32(emptyCircuit());
    const circuit = ok(added);
    expect(circuit.components.slice(1)).toEqual([{ id: 'ESP1', type: 'esp32', props: {} }]);
    expect(isCircuitDocument(circuit)).toBe(true);
    const wired = ok(addWire(circuit, 'ESP1.d2', 'BB1.a1'));
    expect(addWire(wired, 'ESP1.d2', 'BB1.a2')).toEqual({ ok: false, error: 'hole-occupied' });
    expect(addWire(wired, 'ESP1.d6', 'BB1.a2')).toEqual({ ok: false, error: 'unknown-endpoint' });
    expect(addWire(wired, 'ESP1.3v3', 'BB1.tp1').ok).toBe(true);
    expect(ok(removeItem(wired, 'ESP1')).wires).toEqual([]);
  });

  it('shares the two-board limit with the UNO-compatible board, and mixes the kinds', () => {
    const mixed = ok(addUno(ok(addEsp32(emptyCircuit()))));
    expect(mixed.components.map((c) => c.id)).toEqual(['BB1', 'ESP1', 'UNO1']);
    expect(addUno(mixed)).toEqual({ ok: false, error: 'board-limit' });
    expect(addEsp32(mixed)).toEqual({ ok: false, error: 'board-limit' });
    const two = ok(addEsp32(ok(addEsp32(emptyCircuit()))));
    expect(two.components.map((c) => c.id)).toEqual(['BB1', 'ESP1', 'ESP2']);
    expect(addUno(two)).toEqual({ ok: false, error: 'board-limit' });
  });

  it('can be moved, like the other parts beside the breadboard', () => {
    const circuit = ok(moveOffBoardPart(ok(addEsp32(emptyCircuit())), 'ESP1', { x: 4, y: 20 }));
    expect(circuit.components[1]).toMatchObject({ id: 'ESP1', at: { x: 4, y: 20 } });
  });

  it('opens a circuit saved before the board existed', () => {
    expect(migrateCircuit(beforeBreadboards(unoCircuitExample(), 6))).toEqual(unoCircuitExample());
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

  it('allows two boards, with one wire per socket', () => {
    const circuit = ok(addUno(emptyCircuit()));
    expect(addUno(ok(addUno(circuit)))).toEqual({ ok: false, error: 'board-limit' });
    const wired = ok(addWire(circuit, 'UNO1.d13', 'BB1.a1'));
    expect(addWire(wired, 'UNO1.d13', 'BB1.a2')).toEqual({ ok: false, error: 'hole-occupied' });
    expect(addWire(wired, 'UNO1.d99', 'BB1.a2')).toEqual({ ok: false, error: 'unknown-endpoint' });
    expect(addWire(wired, 'UNO1.gnd', 'UNO1.gnd2').ok).toBe(true);
    // Removing the board unplugs its wires.
    expect(ok(removeItem(wired, 'UNO1')).wires).toEqual([]);
  });

  it('places a potentiometer on three neighbouring columns and keeps it rigid', () => {
    let circuit = ok(placePart(emptyCircuit(), 'potentiometer', 'BB1.c20'));
    expect(circuit.components[1]).toMatchObject({
      id: 'POT1',
      pins: { a: 'BB1.c20', wiper: 'BB1.c21', b: 'BB1.c22' },
      props: { resistance: 10_000, position: 0.5 },
    });
    expect(movePin(circuit, 'POT1', 'wiper', 'BB1.c25')).toEqual({
      ok: false,
      error: 'unknown-item',
    });
    circuit = ok(movePart(circuit, 'POT1', 3, 1));
    expect(circuit.components[1]).toMatchObject({
      pins: { a: 'BB1.d23', wiper: 'BB1.d24', b: 'BB1.d25' },
    });
    circuit = ok(flipPart(circuit, 'POT1'));
    expect(circuit.components[1]).toMatchObject({
      pins: { a: 'BB1.d25', wiper: 'BB1.d24', b: 'BB1.d23' },
    });
    expect(ok(updateProps(circuit, 'POT1', { position: 1 })).components[1]).toMatchObject({
      props: { position: 1 },
    });
    expect(updateProps(circuit, 'POT1', { position: 1.2 })).toEqual({
      ok: false,
      error: 'invalid-value',
    });
  });

  it('places the other leads to the left when there is no room on the right', () => {
    const circuit = ok(placePart(emptyCircuit(), 'potentiometer', 'BB1.a30'));
    expect(circuit.components[1]).toMatchObject({
      pins: { a: 'BB1.a30', wiper: 'BB1.a29', b: 'BB1.a28' },
    });
    const button = ok(placePart(emptyCircuit(), 'button', 'BB1.e7'));
    expect(button.components[1]).toMatchObject({ id: 'SW1', pins: { a: 'BB1.e7', b: 'BB1.e9' } });
  });
});

describe('the rest of the parts library', () => {
  it('places every kind of part with sensible leads, ids and starting values', () => {
    const placed = (type: Parameters<typeof placePart>[1]) =>
      ok(placePart(emptyCircuit(), type, 'BB1.c10')).components[1];
    expect(placed('switch')).toEqual({
      id: 'S1',
      type: 'switch',
      pins: { a: 'BB1.c10', b: 'BB1.c12' },
      props: { closed: false },
    });
    expect(placed('diode')).toEqual({
      id: 'D1',
      type: 'diode',
      pins: { anode: 'BB1.c10', cathode: 'BB1.c13' },
      props: {},
    });
    expect(placed('ldr')).toMatchObject({
      id: 'LDR1',
      pins: { a: 'BB1.c10', b: 'BB1.c12' },
      props: { light: 0.5 },
    });
    expect(placed('buzzer')).toMatchObject({ id: 'BZ1', pins: { pos: 'BB1.c10', neg: 'BB1.c12' } });
    expect(placed('motor')).toMatchObject({ id: 'M1', pins: { a: 'BB1.c10', b: 'BB1.c13' } });
    expect(placed('transistor')).toMatchObject({
      id: 'Q1',
      pins: { collector: 'BB1.c10', base: 'BB1.c11', emitter: 'BB1.c12' },
    });
    expect(placed('temperature')).toMatchObject({
      id: 'TMP1',
      pins: { vcc: 'BB1.c10', out: 'BB1.c11', gnd: 'BB1.c12' },
      props: { celsius: 25 },
    });
    expect(placed('soil')).toMatchObject({ id: 'SOIL1', props: { moisture: 0.3 } });
    expect(placed('ir')).toMatchObject({ id: 'IR1', props: { detected: false } });
    // The school kit's modules, with their legs in the order printed on them.
    expect(placed('ldrmodule')).toMatchObject({
      id: 'LDM1',
      pins: { vcc: 'BB1.c10', gnd: 'BB1.c11', do: 'BB1.c12', ao: 'BB1.c13' },
      props: { light: 0.5, threshold: 0.5 },
    });
    expect(placed('rain')).toMatchObject({ id: 'RAIN1', props: { wetness: 0, threshold: 0.5 } });
    expect(placed('mq135')).toMatchObject({ id: 'MQ1', props: { gas: 0.1, threshold: 0.5 } });
    expect(placed('pir')).toMatchObject({
      id: 'PIR1',
      pins: { vcc: 'BB1.c10', out: 'BB1.c11', gnd: 'BB1.c12' },
      props: { motion: false, hold: 3 },
    });
    expect(placed('oled')).toMatchObject({
      id: 'OLED1',
      pins: { gnd: 'BB1.c10', vcc: 'BB1.c11', scl: 'BB1.c12', sda: 'BB1.c13' },
    });
    expect(placed('rgbled')).toMatchObject({
      id: 'RGB1',
      pins: { r: 'BB1.c10', g: 'BB1.c11', b: 'BB1.c12', gnd: 'BB1.c13' },
    });
    expect(placed('servo')).toMatchObject({
      id: 'SRV1',
      pins: { gnd: 'BB1.c10', vcc: 'BB1.c11', signal: 'BB1.c12' },
    });
    expect(placed('ultrasonic')).toMatchObject({
      id: 'US1',
      pins: { vcc: 'BB1.c10', trig: 'BB1.c11', echo: 'BB1.c12', gnd: 'BB1.c13' },
      props: { distance: 50 },
    });
    const lcd = placed('lcd');
    expect(lcd).toMatchObject({
      id: 'LCD1',
      pins: {
        vss: 'BB1.c10',
        rs: 'BB1.c13',
        e: 'BB1.c15',
        d4: 'BB1.c20',
        d7: 'BB1.c23',
        k: 'BB1.c25',
      },
    });
    expect(Object.keys((lcd as { pins: object }).pins)).toHaveLength(16);
    // Sixteen pins need sixteen free columns: near the right edge it goes leftwards instead.
    expect(ok(placePart(emptyCircuit(), 'lcd', 'BB1.c20')).components[1]).toMatchObject({
      pins: { vss: 'BB1.c20', k: 'BB1.c5' },
    });
  });

  it('keeps three-lead parts rigid and validates their settings', () => {
    let circuit = ok(placePart(emptyCircuit(), 'transistor', 'BB1.c10'));
    expect(movePin(circuit, 'Q1', 'base', 'BB1.c14')).toEqual({ ok: false, error: 'unknown-item' });
    circuit = ok(flipPart(circuit, 'Q1'));
    expect(circuit.components[1]).toMatchObject({
      pins: { collector: 'BB1.c12', base: 'BB1.c11', emitter: 'BB1.c10' },
    });

    circuit = ok(placePart(circuit, 'temperature', 'BB1.h10'));
    expect(ok(updateProps(circuit, 'TMP1', { celsius: 40 })).components[2]).toMatchObject({
      props: { celsius: 40 },
    });
    expect(updateProps(circuit, 'TMP1', { celsius: 300 })).toEqual({
      ok: false,
      error: 'invalid-value',
    });
    circuit = ok(placePart(circuit, 'switch', 'BB1.h20'));
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
    // Several chips share one part type and one shape.
    expect(new Set(modelled.map((definition) => definition.simulates)).size).toBe(
      Object.keys(PART_SHAPES).length,
    );
    for (const definition of modelled) {
      const shape = PART_SHAPES[definition.simulates as BoardPartType];
      expect(shape, definition.id).toBeDefined();
      expect(
        {
          idPrefix: definition.placement!.idPrefix,
          pins: definition.pins.map((pin) => pin.id),
          offsets: definition.placement!.offsets,
          maxSpan: definition.placement!.maxSpan,
          rows: definition.placement!.rows,
        },
        definition.id,
      ).toEqual({
        ...shape,
        pins: [...shape.pins],
        offsets: [...shape.offsets],
        maxSpan: shape.maxSpan,
        rows: shape.rows && [...shape.rows],
      });
    }
  });
});

describe('editing rules', () => {
  it('builds the LED circuit step by step', () => {
    let circuit = ok(addBattery(emptyCircuit()));
    circuit = ok(placePart(circuit, 'resistor', 'BB1.c5'));
    circuit = ok(placePart(circuit, 'led', 'BB1.d9'));
    circuit = ok(addWire(circuit, 'BAT1.pos', 'BB1.tp1'));
    circuit = ok(addWire(circuit, 'BAT1.neg', 'BB1.tn1'));
    circuit = ok(addWire(circuit, 'BB1.tp4', 'BB1.a5'));
    circuit = ok(addWire(circuit, 'BB1.a10', 'BB1.tn8'));
    expect(circuit).toEqual(ledCircuitExample());
  });

  it('allows one lead per hole', () => {
    const circuit = ledCircuitExample();
    expect(placePart(circuit, 'led', 'BB1.c5')).toEqual({ ok: false, error: 'hole-occupied' });
    expect(addWire(circuit, 'BB1.a5', 'BB1.b1')).toEqual({ ok: false, error: 'hole-occupied' });
    expect(movePin(circuit, 'LED1', 'cathode', 'BB1.c9')).toEqual({
      ok: false,
      error: 'hole-occupied',
    });
  });

  it('places the second lead to the left at the right-hand edge', () => {
    const circuit = ok(placePart(emptyCircuit(), 'resistor', 'BB1.a29'));
    expect(circuit.components[1]).toMatchObject({ pins: { a: 'BB1.a29', b: 'BB1.a25' } });
  });

  it('limits how far leads can stretch', () => {
    const circuit = ledCircuitExample();
    expect(movePin(circuit, 'LED1', 'cathode', 'BB1.d20')).toEqual({
      ok: false,
      error: 'lead-too-long',
    });
    expect(ok(movePin(circuit, 'LED1', 'cathode', 'BB1.d11')).components[3]).toMatchObject({
      pins: { anode: 'BB1.d9', cathode: 'BB1.d11' },
    });
  });

  it('moves a part as a whole and refuses to push it off the board', () => {
    const circuit = ledCircuitExample();
    expect(ok(movePart(circuit, 'R1', 2, 1)).components[2]).toMatchObject({
      pins: { a: 'BB1.d7', b: 'BB1.d11' },
    });
    expect(movePart(circuit, 'R1', 30, 0)).toEqual({ ok: false, error: 'no-room' });
    expect(movePart(circuit, 'R1', 0, 3)).toEqual({ ok: false, error: 'no-room' }); // trench
  });

  it('flips an LED to reverse its polarity', () => {
    expect(ok(flipPart(ledCircuitExample(), 'LED1')).components[3]).toMatchObject({
      pins: { anode: 'BB1.d10', cathode: 'BB1.d9' },
    });
  });

  it('validates wires', () => {
    const circuit = ledCircuitExample();
    expect(addWire(circuit, 'BB1.b1', 'BB1.b1')).toEqual({ ok: false, error: 'same-point' });
    expect(addWire(circuit, 'BAT9.pos', 'BB1.b1')).toEqual({
      ok: false,
      error: 'unknown-endpoint',
    });
    expect(addWire(circuit, 'R1.a', 'BB1.b1')).toEqual({ ok: false, error: 'unknown-endpoint' });
    expect(ok(moveWireEnd(circuit, 'W4', 'to', 'BB1.tn9')).wires[3]).toMatchObject({
      to: 'BB1.tn9',
    });
    // A battery terminal can hold several wires.
    expect(addWire(circuit, 'BAT1.pos', 'BB1.bp1').ok).toBe(true);
  });

  it('validates property changes', () => {
    const circuit = ledCircuitExample();
    expect(ok(updateProps(circuit, 'R1', { resistance: 330 })).components[2]).toMatchObject({
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
    expect(battery.components[1]).toMatchObject({ id: 'BAT1', at: { x: -6, y: 4 } });
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
    const opened = migrateCircuit(beforeBreadboards(unoCircuitExample(), 4));
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
    const moved = ok(moveWireEnd(bent, 'W3', 'to', 'BB1.b5'));
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
    placePart(circuit, 'led', 'BB1.h3');
    addWire(circuit, 'BB1.g1', 'BB1.g2');
    removeItem(circuit, 'R1');
    updateProps(circuit, 'R1', { resistance: 1000 });
    expect(circuit).toEqual(snapshot);
  });
});

describe('motor driver module', () => {
  it('is added beside the board with both jumpers in place, and only once', () => {
    const added = addMotorDriver(emptyCircuit());
    if (!added.ok) throw new Error(added.error);
    expect(added.circuit.components.slice(1)).toEqual([
      { id: 'DRV1', type: 'l298n', props: { enaJumper: true, enbJumper: true } },
    ]);
    expect(addMotorDriver(added.circuit)).toEqual({ ok: false, error: 'driver-limit' });
    expect(isCircuitDocument(added.circuit)).toBe(true);
  });

  it('takes wires at its thirteen terminals and nowhere else', () => {
    const added = addMotorDriver(emptyCircuit());
    if (!added.ok) throw new Error(added.error);
    expect(L298N_TERMINALS).toHaveLength(13);
    expect(terminalsOf(added.circuit.components[1]!)).toEqual(L298N_TERMINALS);
    const wired = addWire(added.circuit, 'DRV1.out1', 'BB1.a1', '#000000');
    expect(wired.ok).toBe(true);
    expect(addWire(added.circuit, 'DRV1.out5', 'BB1.a1', '#000000')).toEqual({
      ok: false,
      error: 'unknown-endpoint',
    });
    // Taking a jumper off is a setting of the part; removing the part takes its wires with it.
    if (!wired.ok) throw new Error(wired.error);
    const open = updateProps(wired.circuit, 'DRV1', { enaJumper: false });
    expect(open.ok && open.circuit.components[1]).toMatchObject({ props: { enaJumper: false } });
    const removed = removeItem(wired.circuit, 'DRV1');
    expect(removed.ok && removed.circuit.wires).toEqual([]);
  });
});

describe('breadboards as parts', () => {
  const twoBoards = () => ok(addBreadboard(emptyCircuit(), 'half', { x: 0, y: 24 }));

  it('adds a breadboard, up to four', () => {
    let circuit = twoBoards();
    expect(circuit.components.map((c) => c.id)).toEqual(['BB1', 'BB2']);
    expect(isCircuitDocument(circuit)).toBe(true);
    circuit = ok(addBreadboard(circuit, 'mini', { x: 40, y: 0 }));
    circuit = ok(addBreadboard(circuit, 'full', { x: 0, y: 50 }));
    expect(addBreadboard(circuit, 'half', { x: 0, y: 80 })).toEqual({
      ok: false,
      error: 'breadboard-limit',
    });
  });

  it('places parts on any breadboard, and keeps the two apart electrically', () => {
    let circuit = ok(placePart(twoBoards(), 'resistor', 'BB2.c5'));
    expect(circuit.components.at(-1)).toMatchObject({ pins: { a: 'BB2.c5', b: 'BB2.c9' } });
    // A wire into BB1's c5 is not joined to BB2's c5.
    expect(attachError(circuit, 'BB1.c5')).toBeNull();
    circuit = ok(addWire(circuit, 'BB1.a1', 'BB2.a1'));
    expect(isCircuitDocument(circuit)).toBe(true);
  });

  it('refuses holes a breadboard does not have, and a part with legs on two boards', () => {
    const circuit = ok(addBreadboard(emptyCircuit(), 'mini', { x: 40, y: 0 }));
    expect(placePart(circuit, 'resistor', 'BB2.c30').ok).toBe(false);
    expect(addWire(circuit, 'BB2.tp1', 'BB1.a1')).toEqual({
      ok: false,
      error: 'unknown-endpoint',
    });
    // The mini board's corner is at column 40, so BB1's c30 and BB2's c1 are 11 pitches apart.
    const led = ok(placePart(circuit, 'resistor', 'BB1.c26'));
    expect(movePin(led, 'R1', 'b', 'BB2.c1')).toEqual({ ok: false, error: 'no-room' });
  });

  it('slides a whole part from one breadboard on to the next', () => {
    // A mini board right beside BB1: BB1's column 30 is at 30, BB2's column 1 at 32.
    let circuit = ok(addBreadboard(emptyCircuit(), 'mini', { x: 31, y: 0 }));
    circuit = ok(placePart(circuit, 'led', 'BB1.c28'));
    const moved = ok(movePart(circuit, 'LED1', 4, -2));
    expect(moved.components.at(-1)).toMatchObject({
      pins: { anode: 'BB2.c1', cathode: 'BB2.c2' },
    });
  });

  it('removing a breadboard removes the parts and wires in it', () => {
    let circuit = ok(placePart(twoBoards(), 'led', 'BB2.d9'));
    circuit = ok(addWire(circuit, 'BB2.a9', 'BB1.a1'));
    circuit = ok(placePart(circuit, 'resistor', 'BB1.c3'));
    expect(onBreadboard(circuit, 'BB2')).toEqual({ parts: ['LED1'], wires: ['W1'] });
    const removed = ok(removeItem(circuit, 'BB2'));
    expect(removed.components.map((c) => c.id)).toEqual(['BB1', 'R1']);
    expect(removed.wires).toEqual([]);
    expect(isCircuitDocument(removed)).toBe(true);
  });

  it('changes size only when every leg still has its hole', () => {
    const circuit = ok(placePart(emptyCircuit(), 'led', 'BB1.c25'));
    expect(updateProps(circuit, 'BB1', { size: 'mini' })).toEqual({ ok: false, error: 'no-room' });
    expect(ok(updateProps(circuit, 'BB1', { size: 'full' })).components[0]).toMatchObject({
      props: { size: 'full' },
    });
    const near = ok(placePart(emptyCircuit(), 'led', 'BB1.c3'));
    expect(updateProps(near, 'BB1', { size: 'mini' }).ok).toBe(true);
    // Mini boards have no power rails.
    const railed = ok(addWire(emptyCircuit(), 'BB1.tp1', 'BB1.a1'));
    expect(updateProps(railed, 'BB1', { size: 'mini' }).ok).toBe(false);
  });

  it('moves a breadboard a whole hole at a time; its parts and wires go with it', () => {
    const circuit = ok(placePart(twoBoards(), 'led', 'BB2.d9'));
    const moved = ok(moveOffBoardPart(circuit, 'BB2', { x: 5, y: 30 }));
    expect(layoutOf(moved).coordinates('BB2.d9')).toEqual({ x: 14, y: 37 });
    // The part's legs name the same holes: nothing about the part itself changed.
    expect(moved.components.at(-1)).toEqual(circuit.components.at(-1));
    expect(moveOffBoardPart(circuit, 'BB2', { x: 5.5, y: 30 })).toEqual({
      ok: false,
      error: 'no-room',
    });
  });
});
