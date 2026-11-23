import {
  addWire,
  emptyCircuit,
  flipPart,
  ledCircuitExample,
  LED_COLORS,
  movePin,
  moveWireEnd,
  placePart,
  removeItem,
  unoCircuitExample,
  updateProps,
  type CircuitDocument,
  type EditResult,
  FIRST_BREADBOARD,
} from '@banglalab/shared';
import { describe, expect, it } from 'vitest';
import { LED_FORWARD_VOLTAGE, LED_RATED_CURRENT } from './library';
import { buildNetlist, netName } from './netlist';
import { simulate } from './simulate';

function ok(result: EditResult): CircuitDocument {
  if (!result.ok) throw new Error(`edit refused: ${result.error}`);
  return result.circuit;
}
const codes = (document: CircuitDocument) => simulate(document).diagnostics.map((d) => d.code);

describe('the first LED circuit', () => {
  const result = simulate(ledCircuitExample());

  it('lights the LED with the current a student would calculate by hand', () => {
    const led = result.readings.LED1!;
    expect(led.led).toMatchObject({ state: 'on' });
    expect(led.led!.brightness).toBe(1);
    // Hand calculation: (9 V − 1.8 V) / 330 Ω = 21.8 mA. The model's forward voltage rises
    // slightly above 1.8 V at this current, so allow 2 %.
    const handCalculated = (9 - 1.8) / 330;
    expect(Math.abs(led.current - handCalculated) / handCalculated).toBeLessThan(0.02);
    expect(led.voltage).toBeGreaterThan(1.78);
    expect(led.voltage).toBeLessThan(1.84);
    expect(result.diagnostics).toEqual([]);
  });

  it('carries the same current through every part of the single loop', () => {
    const current = result.readings.LED1!.current;
    expect(result.readings.R1!.current).toBeCloseTo(current, 9);
    expect(result.readings.BAT1!.current).toBeCloseTo(current, 9);
    for (const wire of ['W1', 'W3']) expect(result.wireCurrents[wire]).toBeCloseTo(current, 9);
    // W2 runs battery − to rail and W4 runs strip to rail: both carry the return current.
    expect(result.wireCurrents.W2).toBeCloseTo(-current, 9);
    expect(result.wireCurrents.W4).toBeCloseTo(current, 9);
  });

  it('conserves energy: battery output equals what the parts dissipate', () => {
    const { BAT1, R1, LED1 } = result.readings;
    const wireLoss = Object.values(result.wireCurrents).reduce((sum, i) => sum + i * i * 0.01, 0);
    expect(BAT1!.power).toBeCloseTo(R1!.power + LED1!.power + wireLoss, 9);
  });

  it("obeys Ohm's law at the resistor", () => {
    const { R1 } = result.readings;
    expect(R1!.voltage / R1!.current).toBeCloseTo(330, 6);
  });
});

describe('what a probe and a current arrow can read', () => {
  const circuit = ledCircuitExample();
  const result = simulate(circuit);
  const current = result.readings.LED1!.current;

  it('reports the voltage at every net something is connected to', () => {
    const at = (endpoint: string) => result.nodeVoltages[netName(endpoint)];
    expect(at('BAT1.neg')).toBe(0);
    expect(at('BAT1.pos')).toBeCloseTo(9, 1);
    // Along the loop: nearly 9 V before the resistor, the LED's 1.8 V after it, 0 V at the end.
    expect(at('BB1.c5')).toBeCloseTo(9, 1);
    expect(at('BB1.c9')! - at('BB1.d10')!).toBeCloseTo(result.readings.LED1!.voltage, 6);
    expect(at('BB1.c5')! - at('BB1.c9')!).toBeCloseTo(result.readings.R1!.voltage, 6);
    // A hole in the same strip reads the same; a strip nothing touches has no reading.
    expect(at('BB1.e9')).toBe(at('BB1.c9'));
    expect(at('BB1.h20')).toBeUndefined();
  });

  it('reports the current into each leg, and every part passes on what it takes in', () => {
    const legs = result.legCurrents;
    expect(legs['R1.a']).toBeCloseTo(current, 9);
    expect(legs['R1.b']).toBeCloseTo(-current, 9);
    expect(legs['LED1.anode']).toBeCloseTo(current, 9);
    expect(legs['LED1.cathode']).toBeCloseTo(-current, 9);
    // The battery pushes current out of + and takes it back in at −.
    expect(legs['BAT1.pos']).toBeCloseTo(-current, 9);
    expect(legs['BAT1.neg']).toBeCloseTo(current, 9);
  });

  it('balances the legs of three-leg parts and of the board', () => {
    let board = unoCircuitExample();
    board = ok(placePart(board, 'transistor', 'BB1.h8')); // C h8, B h9, E h10
    board = ok(placePart(board, 'resistor', 'BB1.j1')); // R2: j1 to j5
    board = ok(addWire(board, 'UNO1.d5', 'BB1.i1'));
    board = ok(addWire(board, 'BB1.i5', 'BB1.i9')); // resistor to the base
    board = ok(addWire(board, 'BB1.tp2', 'BB1.i8')); // 5 V straight to the collector
    board = ok(addWire(board, 'BB1.i10', 'BB1.tn2')); // emitter to ground
    const drives = Array<'input' | 'high'>(20).fill('input');
    drives[5] = 'high';
    const on = simulate(board, { pressed: [], boards: { UNO1: drives } });
    const legs = on.legCurrents;
    const sum = (...names: string[]) => names.reduce((total, name) => total + legs[name]!, 0);

    expect(legs['Q1.base']).toBeGreaterThan(1e-3);
    expect(legs['Q1.collector']).toBeGreaterThan(legs['Q1.base']!);
    expect(sum('Q1.collector', 'Q1.base', 'Q1.emitter')).toBeCloseTo(0, 9);
    expect(sum('POT1.a', 'POT1.wiper', 'POT1.b')).toBeCloseTo(0, 9);
    expect(legs['POT1.a']).toBeGreaterThan(0);
    // Pin 5 drives the base through the resistor: the same current leaves the pin and enters R2.
    expect(legs['UNO1.d5']).toBeCloseTo(-legs['R2.a']!, 9);
    const boardLegs = Object.keys(legs).filter((leg) => leg.startsWith('UNO1.'));
    expect(sum(...boardLegs)).toBeCloseTo(0, 9);
  });
});

describe('LED models', () => {
  it.each(LED_COLORS)('%s LED has its datasheet forward voltage at 20 mA', (color) => {
    // Choose the resistor that should give exactly 20 mA at the nominal forward voltage.
    const resistance =
      (9 - 0.5 * LED_RATED_CURRENT - 4 * 0.01 * LED_RATED_CURRENT - LED_FORWARD_VOLTAGE[color]) /
      LED_RATED_CURRENT;
    let document = ok(updateProps(ledCircuitExample(), 'LED1', { color }));
    document = ok(updateProps(document, 'R1', { resistance }));
    const led = simulate(document).readings.LED1!;
    expect(led.current).toBeCloseTo(LED_RATED_CURRENT, 6);
    expect(led.voltage).toBeCloseTo(LED_FORWARD_VOLTAGE[color], 6);
  });

  it('on a 3 V battery a blue LED is much dimmer than a red one', () => {
    const at3V = (document: CircuitDocument) =>
      simulate(ok(updateProps(document, 'BAT1', { voltage: 3 }))).readings.LED1!;
    const red = at3V(ledCircuitExample());
    const blue = at3V(ok(updateProps(ledCircuitExample(), 'LED1', { color: 'blue' })));
    expect(red.current).toBeGreaterThan(0.003);
    expect(blue.current).toBeLessThan(0.001);
    expect(blue.led!.brightness).toBeLessThan(red.led!.brightness / 2);
  });
});

describe('diagnostics for common mistakes', () => {
  it('reversed LED', () => {
    const document = ok(flipPart(ledCircuitExample(), 'LED1'));
    const result = simulate(document);
    expect(result.readings.LED1!.led).toEqual({ state: 'reversed', brightness: 0 });
    expect(Math.abs(result.readings.LED1!.current)).toBeLessThan(1e-9);
    expect(result.diagnostics).toEqual([
      { code: 'led-reversed', severity: 'warning', componentId: 'LED1' },
    ]);
  });

  it('open circuit when a wire is missing', () => {
    const document = ok(removeItem(ledCircuitExample(), 'W4'));
    const result = simulate(document);
    expect(result.readings.LED1!.led!.state).toBe('off');
    // An unconnected LED must read 0 V, not a voltage invented by the solver.
    expect(result.readings.LED1!.voltage).toBeCloseTo(0, 9);
    expect(result.readings.R1!.voltage).toBeCloseTo(0, 9);
    expect(result.diagnostics).toEqual([{ code: 'open-circuit', severity: 'info' }]);
  });

  it('resistor too small: overcurrent warning, then burn-out', () => {
    const at = (resistance: number) =>
      simulate(ok(updateProps(ledCircuitExample(), 'R1', { resistance })));
    expect(at(220).readings.LED1!.led!.state).toBe('overcurrent');
    expect(at(220).diagnostics.map((d) => d.code)).toEqual(['led-overcurrent']);
    expect(at(47).readings.LED1!.led).toEqual({ state: 'burned', brightness: 0 });
    expect(at(47).diagnostics.map((d) => d.code)).toEqual(['led-burned']);
  });

  it('short circuit across the power rails', () => {
    const document = ok(addWire(ledCircuitExample(), 'BB1.tp10', 'BB1.tn10'));
    const result = simulate(document);
    expect(result.diagnostics.map((d) => d.code)).toContain('short-circuit');
    expect(result.readings.BAT1!.current).toBeGreaterThan(10);
    expect(result.readings.LED1!.led!.state).toBe('off'); // the short starves the LED
  });

  it('both legs in the same strip', () => {
    // Column 9 already holds R1.b (c9) and LED1.anode (d9); put the cathode there too.
    const document = ok(movePin(ledCircuitExample(), 'LED1', 'cathode', 'BB1.e9'));
    expect(buildNetlist(document).bridgedParts).toEqual(['LED1']);
    expect(codes(document)).toEqual(['legs-in-same-strip', 'open-circuit']);
  });

  it('LED bypassed by a wire that returns from the wrong column', () => {
    // The return wire leaves column 9 (before the LED) instead of column 10 (after it).
    const document = ok(moveWireEnd(ledCircuitExample(), 'W4', 'from', 'BB1.a9'));
    const result = simulate(document);
    expect(result.readings.R1!.current).toBeGreaterThan(0.025);
    expect(result.readings.LED1!.led!.state).toBe('off');
    expect(result.diagnostics).toEqual([
      { code: 'led-bypassed', severity: 'warning', componentId: 'LED1' },
    ]);
  });

  it('battery voltage too low for the LED colour', () => {
    let document = ok(updateProps(ledCircuitExample(), 'LED1', { color: 'blue' }));
    document = ok(updateProps(document, 'BAT1', { voltage: 1.5 }));
    const result = simulate(document);
    expect(result.readings.LED1!.led!.state).toBe('off');
    // The loop is complete, so this is not an open circuit: the LED sees 1.5 V and needs 3 V.
    expect(result.readings.LED1!.voltage).toBeCloseTo(1.5, 3);
    expect(result.diagnostics.map((d) => d.code)).toEqual(['led-low-voltage']);

    // 3 V reaches a red LED but only barely moves a white one.
    document = ok(updateProps(ledCircuitExample(), 'LED1', { color: 'white' }));
    document = ok(updateProps(document, 'BAT1', { voltage: 3 }));
    document = ok(updateProps(document, 'R1', { resistance: 100_000 }));
    expect(simulate(document).diagnostics).toEqual([
      { code: 'led-low-voltage', severity: 'warning', componentId: 'LED1' },
    ]);
  });

  it('no battery', () => {
    expect(codes(ok(removeItem(ledCircuitExample(), 'BAT1')))).toEqual(['no-battery']);
  });

  it('nothing to report for an empty board or a lone battery', () => {
    expect(simulate(emptyCircuit())).toMatchObject({ ok: true, diagnostics: [], readings: {} });
    const lone: CircuitDocument = {
      ...emptyCircuit(),
      components: [FIRST_BREADBOARD, { id: 'BAT1', type: 'battery', props: { voltage: 9 } }],
    };
    expect(simulate(lone).diagnostics).toEqual([]);
    expect(simulate(lone).readings.BAT1!.voltage).toBeCloseTo(9, 6);
  });
});

describe('breadboard connectivity', () => {
  it('does not connect across the centre trench', () => {
    // Move the return wire from the top half of column 10 to the bottom half.
    const document = ok(addWire(ok(removeItem(ledCircuitExample(), 'W4')), 'BB1.f10', 'BB1.tn8'));
    expect(codes(document)).toEqual(['open-circuit']);
  });

  it('two batteries in series add their voltages', () => {
    const document: CircuitDocument = {
      ...emptyCircuit(),
      components: [
        FIRST_BREADBOARD,
        { id: 'BAT1', type: 'battery', props: { voltage: 1.5 } },
        { id: 'BAT2', type: 'battery', props: { voltage: 1.5 } },
        {
          id: 'R1',
          type: 'resistor',
          pins: { a: 'BB1.a1', b: 'BB1.a5' },
          props: { resistance: 1000 },
        },
      ],
      wires: [
        { id: 'W1', from: 'BAT1.pos', to: 'BAT2.neg', color: '#000000' },
        { id: 'W2', from: 'BAT2.pos', to: 'BB1.b1', color: '#000000' },
        { id: 'W3', from: 'BB1.b5', to: 'BAT1.neg', color: '#000000' },
      ],
    };
    const result = simulate(document);
    expect(result.readings.R1!.voltage).toBeCloseTo(3 * (1000 / 1001.03), 6);
    expect(result.diagnostics).toEqual([]);
  });

  it('two LED branches in parallel each get their own current', () => {
    let document = ledCircuitExample();
    document = {
      ...document,
      components: [
        ...document.components,
        {
          id: 'R2',
          type: 'resistor',
          pins: { a: 'BB1.h5', b: 'BB1.h9' },
          props: { resistance: 1000 },
        },
        {
          id: 'LED2',
          type: 'led',
          pins: { anode: 'BB1.i9', cathode: 'BB1.i10' },
          props: { color: 'green' },
        },
      ],
    };
    document = ok(addWire(document, 'BB1.tp5', 'BB1.j5'));
    document = ok(addWire(document, 'BB1.j10', 'BB1.tn9'));
    const { readings, diagnostics } = simulate(document);
    expect(diagnostics).toEqual([]);
    expect(readings.LED1!.current).toBeGreaterThan(0.02);
    expect(readings.LED2!.current).toBeGreaterThan(0.006);
    expect(readings.LED2!.current).toBeLessThan(0.008);
    expect(readings.BAT1!.current).toBeCloseTo(readings.LED1!.current + readings.LED2!.current, 9);
  });
});
