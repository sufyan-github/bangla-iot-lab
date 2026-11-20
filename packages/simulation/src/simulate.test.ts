import {
  addWire,
  emptyCircuit,
  flipPart,
  ledCircuitExample,
  LED_COLORS,
  movePin,
  removeItem,
  updateProps,
  type CircuitDocument,
  type EditResult,
} from '@banglalab/shared';
import { describe, expect, it } from 'vitest';
import { LED_FORWARD_VOLTAGE, LED_RATED_CURRENT } from './library';
import { buildNetlist } from './netlist';
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

describe('LED models', () => {
  it.each(LED_COLORS)('%s LED has its datasheet forward voltage at 20 mA', (color) => {
    // Choose the resistor that should give exactly 20 mA at the nominal forward voltage.
    const resistance = (9 - 0.5 * LED_RATED_CURRENT - 4 * 0.01 * LED_RATED_CURRENT - LED_FORWARD_VOLTAGE[color]) / LED_RATED_CURRENT;
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
    const document = ok(addWire(ledCircuitExample(), 'tp10', 'tn10'));
    const result = simulate(document);
    expect(result.diagnostics.map((d) => d.code)).toContain('short-circuit');
    expect(result.readings.BAT1!.current).toBeGreaterThan(10);
    expect(result.readings.LED1!.led!.state).toBe('off'); // the short starves the LED
  });

  it('both legs in the same strip', () => {
    // Column 9 already holds R1.b (c9) and LED1.anode (d9); put the cathode there too.
    const document = ok(movePin(ledCircuitExample(), 'LED1', 'cathode', 'e9'));
    expect(buildNetlist(document).bridgedParts).toEqual(['LED1']);
    expect(codes(document)).toEqual(['legs-in-same-strip', 'open-circuit']);
  });

  it('no battery', () => {
    expect(codes(ok(removeItem(ledCircuitExample(), 'BAT1')))).toEqual(['no-battery']);
  });

  it('nothing to report for an empty board or a lone battery', () => {
    expect(simulate(emptyCircuit())).toMatchObject({ ok: true, diagnostics: [], readings: {} });
    const lone: CircuitDocument = {
      ...emptyCircuit(),
      components: [{ id: 'BAT1', type: 'battery', props: { voltage: 9 } }],
    };
    expect(simulate(lone).diagnostics).toEqual([]);
    expect(simulate(lone).readings.BAT1!.voltage).toBeCloseTo(9, 6);
  });
});

describe('breadboard connectivity', () => {
  it('does not connect across the centre trench', () => {
    // Move the return wire from the top half of column 10 to the bottom half.
    const document = ok(
      addWire(ok(removeItem(ledCircuitExample(), 'W4')), 'f10', 'tn8'),
    );
    expect(codes(document)).toEqual(['open-circuit']);
  });

  it('two batteries in series add their voltages', () => {
    const document: CircuitDocument = {
      ...emptyCircuit(),
      components: [
        { id: 'BAT1', type: 'battery', props: { voltage: 1.5 } },
        { id: 'BAT2', type: 'battery', props: { voltage: 1.5 } },
        { id: 'R1', type: 'resistor', pins: { a: 'a1', b: 'a5' }, props: { resistance: 1000 } },
      ],
      wires: [
        { id: 'W1', from: 'BAT1.pos', to: 'BAT2.neg', color: '#000000' },
        { id: 'W2', from: 'BAT2.pos', to: 'b1', color: '#000000' },
        { id: 'W3', from: 'b5', to: 'BAT1.neg', color: '#000000' },
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
        { id: 'R2', type: 'resistor', pins: { a: 'h5', b: 'h9' }, props: { resistance: 1000 } },
        { id: 'LED2', type: 'led', pins: { anode: 'i9', cathode: 'i10' }, props: { color: 'green' } },
      ],
    };
    document = ok(addWire(document, 'tp5', 'j5'));
    document = ok(addWire(document, 'j10', 'tn9'));
    const { readings, diagnostics } = simulate(document);
    expect(diagnostics).toEqual([]);
    expect(readings.LED1!.current).toBeGreaterThan(0.02);
    expect(readings.LED2!.current).toBeGreaterThan(0.006);
    expect(readings.LED2!.current).toBeLessThan(0.008);
    expect(readings.BAT1!.current).toBeCloseTo(readings.LED1!.current + readings.LED2!.current, 9);
  });
});
