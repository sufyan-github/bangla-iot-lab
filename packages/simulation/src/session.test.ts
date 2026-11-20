import { readFileSync } from 'node:fs';
import {
  addWire,
  emptyCircuit,
  removeItem,
  unoCircuitExample,
  updateProps,
  type CircuitDocument,
  type EditResult,
} from '@banglalab/shared';
import { describe, expect, it } from 'vitest';
import { SimulationSession } from './session';
import { simulate } from './simulate';

/** Firmware compiled from the starter sketches (kept in sync by the compile-worker tests). */
const firmware = (name: string) =>
  readFileSync(
    new URL(`../../board-emulators/fixtures/starters/${name}.hex`, import.meta.url),
    'utf8',
  );

function ok(result: EditResult): CircuitDocument {
  if (!result.ok) throw new Error(`edit refused: ${result.error}`);
  return result.circuit;
}

function run(session: SimulationSession, milliseconds: number, frameMs = 50) {
  const frames = [];
  for (let t = 0; t < milliseconds; t += frameMs) {
    session.advance(frameMs);
    frames.push(session.frame());
  }
  return frames;
}

/** Expected LED current with the pin HIGH: (5 V − Vf) / (220 Ω + 25 Ω pin + wires). */
const LED_ON_CURRENT = (5 - 1.79) / 245.02;

describe('UNO circuit before any program is uploaded', () => {
  it('is powered but every pin is an input, so the LED is dark', () => {
    const result = simulate(unoCircuitExample());
    expect(result.readings.LED1!.led!.state).toBe('off');
    // The potentiometer sits across the 5 V rail: 5 V / 10 kΩ = 0.5 mA.
    expect(result.readings.POT1!.current).toBeCloseTo(0.0005, 5);
    expect(result.sockets['UNO1.a0']!.voltage).toBeCloseTo(2.5, 2);
    expect(result.readings.UNO1!.current).toBeCloseTo(0.0005, 5);
  });
});

describe('Blink on pin 13', () => {
  const session = new SimulationSession(unoCircuitExample());
  session.loadFirmware('UNO1', firmware('blink'));
  const frames = run(session, 2000);

  it('lights the LED half the time with the current the pin model predicts', () => {
    const lit = frames.filter((f) => f.result.readings.LED1!.led!.state === 'on');
    expect(lit.length).toBeGreaterThanOrEqual(19);
    expect(lit.length).toBeLessThanOrEqual(21);
    const steady = lit.map((f) => f.result.readings.LED1!.current).sort((a, b) => b - a)[0]!;
    expect(Math.abs(steady - LED_ON_CURRENT) / LED_ON_CURRENT).toBeLessThan(0.02);
  });

  it('reports the pin voltage sagging under load and the same current through the pin and LED', () => {
    // A frame in which the pin was high the whole time (not one that straddles a toggle).
    const lit = frames.find((f) => f.boards.UNO1!.highFraction[13] === 1)!;
    const socket = lit.result.sockets['UNO1.d13']!;
    expect(socket.current).toBeCloseTo(lit.result.readings.LED1!.current, 6);
    expect(socket.voltage).toBeCloseTo(5 - socket.current * 25, 3);
    expect(lit.boards.UNO1!.drives[13]).toBe('high');
    expect(lit.result.diagnostics).toEqual([]);
  });

  it('does not call a dark LED a fault while a program is running', () => {
    const dark = frames.find((f) => f.result.readings.LED1!.led!.state === 'off')!;
    expect(dark.boards.UNO1!.drives[13]).toBe('low');
    expect(dark.result.diagnostics).toEqual([]);
  });

  it('solves each distinct pin state only once', () => {
    expect(session.solveCount).toBeLessThanOrEqual(4);
    expect(session.timeMs).toBeCloseTo(2000, 6);
  });
});

describe('Button on pin 2', () => {
  it('reads the pull-up when released and ground when pressed', () => {
    const document = unoCircuitExample();
    const session = new SimulationSession(document);
    session.loadFirmware('UNO1', firmware('button'));

    let frame = run(session, 100).at(-1)!;
    expect(frame.boards.UNO1!.drives[2]).toBe('pullup');
    expect(frame.result.sockets['UNO1.d2']!.voltage).toBeCloseTo(5, 3);
    expect(frame.result.readings.LED1!.led!.state).toBe('off');

    session.update(document, ['SW1']);
    frame = run(session, 100).at(-1)!;
    expect(frame.result.sockets['UNO1.d2']!.voltage).toBeLessThan(0.01);
    // The pull-up now feeds 5 V / 35 kΩ through the button.
    expect(frame.result.readings.SW1!.current).toBeCloseTo(5 / 35_000, 6);
    expect(frame.result.readings.LED1!.led!.state).toBe('on');

    session.update(document, []);
    frame = run(session, 100).at(-1)!;
    expect(frame.result.readings.LED1!.led!.state).toBe('off');
  });
});

/** The example with the LED moved from pin 13 to PWM pin 9. */
function ledOnPin9(): CircuitDocument {
  const document = ok(removeItem(unoCircuitExample(), 'W3'));
  return ok(addWire(document, 'UNO1.d9', 'a5'));
}

describe('PWM on pin 9', () => {
  it('Fade: brightness follows the duty cycle up and down', () => {
    const session = new SimulationSession(ledOnPin9());
    session.loadFirmware('UNO1', firmware('fade'));
    const frames = run(session, 3200, 40);
    const currents = frames.map((f) => f.result.readings.LED1!.current);
    const duty = frames.map((f) => f.boards.UNO1!.highFraction[9]!);

    expect(Math.max(...currents)).toBeGreaterThan(LED_ON_CURRENT * 0.9);
    expect(Math.min(...currents)).toBeLessThan(LED_ON_CURRENT * 0.1);
    // Average current is proportional to the time the pin spends high.
    for (let i = 0; i < frames.length; i++) {
      expect(Math.abs(currents[i]! - duty[i]! * LED_ON_CURRENT)).toBeLessThan(
        LED_ON_CURRENT * 0.03,
      );
    }
    // It rises, then falls: the brightest frame is not at either end.
    const peak = currents.indexOf(Math.max(...currents));
    expect(peak).toBeGreaterThan(5);
    expect(peak).toBeLessThan(frames.length - 5);
    // A half-bright LED is "on", never "overcurrent" or "off".
    const half = frames.find((f) => Math.abs(f.boards.UNO1!.highFraction[9]! - 0.5) < 0.1)!;
    expect(half.result.readings.LED1!.led!.state).toBe('on');
  });
});

describe('Potentiometer on A0', () => {
  it('Knob: the program reads the wiper voltage and prints it', () => {
    let document = ledOnPin9();
    document = ok(updateProps(document, 'POT1', { position: 0.25 }));
    const session = new SimulationSession(document);
    session.loadFirmware('UNO1', firmware('knob'));
    let frames = run(session, 500);

    // Lead a is on 5 V and position 0.25 puts a quarter of the track above the wiper.
    expect(frames.at(-1)!.result.sockets['UNO1.a0']!.voltage).toBeCloseTo(3.75, 2);
    const printed = frames
      .map((f) => f.boards.UNO1!.serial)
      .join('')
      .trim()
      .split(/\r?\n/)
      .map(Number);
    expect(printed.length).toBeGreaterThanOrEqual(3);
    for (const value of printed) expect(Math.abs(value - 767)).toBeLessThanOrEqual(2);
    expect(frames.at(-1)!.boards.UNO1!.highFraction[9]).toBeCloseTo(191 / 255, 1);

    // Turning the knob while the program runs changes what it reads; the program is not restarted.
    const before = session.timeMs;
    session.update(ok(updateProps(document, 'POT1', { position: 1 })));
    frames = run(session, 300);
    const later = frames
      .map((f) => f.boards.UNO1!.serial)
      .join('')
      .trim()
      .split(/\r?\n/)
      .map(Number);
    expect(later.at(-1)).toBeLessThanOrEqual(1);
    expect(frames.at(-1)!.boards.UNO1!.timeMs).toBeCloseTo(before + 300, 3);
  });
});

describe('mistakes with a board', () => {
  it('LED straight on a pin with no resistor: pin overloaded and LED burned', () => {
    let document: CircuitDocument = {
      ...emptyCircuit(),
      components: [
        { id: 'UNO1', type: 'uno', props: {} },
        { id: 'LED1', type: 'led', pins: { anode: 'd9', cathode: 'd10' }, props: { color: 'red' } },
      ],
    };
    document = ok(addWire(document, 'UNO1.d13', 'a9'));
    document = ok(addWire(document, 'a10', 'UNO1.gnd'));
    const session = new SimulationSession(document);
    session.loadFirmware('UNO1', firmware('blink'));
    const frame = run(session, 300).find((f) => f.boards.UNO1!.drives[13] === 'high')!;
    expect(frame.result.diagnostics).toEqual([
      { code: 'pin-overcurrent', severity: 'error', componentId: 'UNO1', socket: 'd13' },
      { code: 'led-burned', severity: 'error', componentId: 'LED1' },
    ]);
  });

  it('5 V wired straight to GND is a short circuit', () => {
    const document = ok(addWire(unoCircuitExample(), 'tp10', 'tn10'));
    expect(simulate(document).diagnostics.map((d) => d.code)).toContain('supply-short');
  });

  it('rejects firmware that is not valid', () => {
    const session = new SimulationSession(unoCircuitExample());
    expect(() => session.loadFirmware('UNO1', 'not a hex file')).toThrow(/Intel HEX/);
  });

  it('drops a board that is removed from the circuit', () => {
    const session = new SimulationSession(unoCircuitExample());
    session.loadFirmware('UNO1', firmware('blink'));
    session.update(ok(removeItem(unoCircuitExample(), 'UNO1')));
    const frame = run(session, 50).at(-1)!;
    expect(frame.boards).toEqual({});
    expect(frame.result.diagnostics.map((d) => d.code)).toEqual(['no-battery']);
  });
});

describe('a circuit with no board', () => {
  it('gives the same answer through a session as through simulate()', () => {
    const document: CircuitDocument = ok(removeItem(unoCircuitExample(), 'UNO1'));
    const session = new SimulationSession(document);
    session.advance(100);
    expect(session.frame().result).toEqual(simulate(document));
    expect(session.frame().result).toEqual(simulate(document)); // a second frame with no time passed
  });
});

describe('capacitors charge and discharge over time', () => {
  /** 9 V battery → 1 kΩ → 100 µF → back to the battery: time constant 100 ms. */
  const rcCircuit = (): CircuitDocument => ({
    ...emptyCircuit(),
    components: [
      { id: 'BAT1', type: 'battery', props: { voltage: 9 } },
      { id: 'R1', type: 'resistor', pins: { a: 'a1', b: 'a5' }, props: { resistance: 1000 } },
      { id: 'C1', type: 'capacitor', pins: { a: 'b5', b: 'b7' }, props: { capacitance: 100e-6 } },
    ],
    wires: [
      { id: 'W1', from: 'BAT1.pos', to: 'b1', color: '#000000' },
      { id: 'W2', from: 'c7', to: 'BAT1.neg', color: '#000000' },
    ],
  });

  it('follows the charging curve in real time, with no program involved', () => {
    const session = new SimulationSession(rcCircuit());
    expect(session.isTimeDependent).toBe(true);
    session.advance(100);
    session.frame(); // start a fresh observation, so the next frame is an instant, not an average
    session.advance(1);
    let frame = session.frame();
    // After one time constant: 63 % of 9 V.
    expect(frame.result.readings.C1!.voltage).toBeCloseTo(9 * (1 - Math.exp(-1)), 1);
    expect(frame.result.readings.C1!.current).toBeCloseTo(frame.result.readings.R1!.current, 9);
    expect(frame.result.readings.R1!.current).toBeGreaterThan(0.003);

    session.advance(900);
    session.frame();
    session.advance(1);
    frame = session.frame();
    expect(frame.result.readings.C1!.voltage).toBeCloseTo(9, 2);
    expect(Math.abs(frame.result.readings.R1!.current)).toBeLessThan(1e-5);
    // A full capacitor stopping the current is normal, not an open circuit.
    expect(frame.result.diagnostics).toEqual([]);
  });

  it('keeps its charge when the circuit is edited, and empties through a new path', () => {
    const session = new SimulationSession(rcCircuit());
    session.advance(1000);
    session.frame();
    // Unplug the battery and bridge the capacitor with a 330 Ω resistor and an LED.
    let document = ok(removeItem(rcCircuit(), 'BAT1'));
    document = {
      ...document,
      components: [
        ...document.components,
        { id: 'R2', type: 'resistor', pins: { a: 'c5', b: 'c12' }, props: { resistance: 330 } },
        {
          id: 'LED1',
          type: 'led',
          pins: { anode: 'd12', cathode: 'd13' },
          props: { color: 'red' },
        },
      ],
    };
    document = ok(addWire(document, 'e13', 'd7'));
    session.update(document);

    session.advance(5);
    const early = session.frame().result;
    expect(early.readings.C1!.voltage).toBeGreaterThan(7);
    expect(early.readings.LED1!.led!.state).toBe('on');
    expect(early.readings.C1!.current).toBeLessThan(0); // discharging

    session.advance(2000);
    session.frame();
    session.advance(1);
    const late = session.frame().result;
    expect(late.readings.LED1!.led!.state).toBe('off');
    expect(late.readings.C1!.voltage).toBeLessThan(1.5); // the LED stops conducting before it is empty
  });

  it('smooths a blinking pin into a slowly rising and falling voltage', () => {
    let document: CircuitDocument = {
      ...emptyCircuit(),
      components: [
        { id: 'UNO1', type: 'uno', props: {} },
        { id: 'R1', type: 'resistor', pins: { a: 'a1', b: 'a5' }, props: { resistance: 1000 } },
        { id: 'C1', type: 'capacitor', pins: { a: 'b5', b: 'b7' }, props: { capacitance: 100e-6 } },
      ],
    };
    document = ok(addWire(document, 'UNO1.d13', 'b1'));
    document = ok(addWire(document, 'c7', 'UNO1.gnd'));
    const session = new SimulationSession(document);
    session.loadFirmware('UNO1', firmware('blink'));
    const voltages = run(session, 2000, 20).map((f) => f.result.readings.C1!.voltage);
    // Pin high for 500 ms (five time constants): nearly 5 V. Then low for 500 ms: nearly 0 V.
    expect(Math.max(...voltages)).toBeGreaterThan(4.8);
    expect(Math.min(...voltages.slice(40))).toBeLessThan(0.2);
    // It never jumps: neighbouring frames differ by a small step.
    for (let i = 1; i < voltages.length; i++) {
      expect(Math.abs(voltages[i]! - voltages[i - 1]!)).toBeLessThan(1.1);
    }
  });

  it('the settled answer treats a capacitor as fully charged', () => {
    const settled = simulate(rcCircuit());
    expect(settled.readings.C1!.voltage).toBeCloseTo(9, 6);
    expect(settled.readings.R1!.current).toBeCloseTo(0, 9);
    expect(settled.diagnostics).toEqual([]);
  });
});

describe('signal recording for the oscilloscope and logic analyser', () => {
  it('records the exact moments a pin changes', () => {
    const session = new SimulationSession(unoCircuitExample());
    session.setProbes(['socket:UNO1.d13', 'part:LED1']);
    session.loadFirmware('UNO1', firmware('blink'));
    const times: number[] = [];
    const pin: number[] = [];
    const ledVolts: number[] = [];
    for (const frame of run(session, 1600)) {
      times.push(...frame.trace!.times);
      pin.push(...frame.trace!.values[0]!);
      ledVolts.push(...frame.trace!.values[1]!);
    }
    // Each frame opens with one sample; beyond that there is one per change and nothing in
    // between: input at reset, then high, low, high, low.
    const changes = pin.filter((v, i) => i === 0 || Math.abs(v - pin[i - 1]!) > 1e-6);
    expect(changes.length).toBeLessThanOrEqual(6);
    expect(pin.length).toBeLessThanOrEqual(32 + 6);
    const rises = times.filter((_, i) => i > 0 && pin[i]! > 4 && pin[i - 1]! < 4);
    const falls = times.filter((_, i) => i > 0 && pin[i]! < 1 && pin[i - 1]! > 4);
    expect(rises[1]! - rises[0]!).toBeCloseTo(1000, 0);
    expect(falls[0]! - rises[0]!).toBeCloseTo(500, 0);
    expect(Math.max(...ledVolts)).toBeCloseTo(1.78, 1);
  });

  it('samples a PWM pin at its real frequency and duty cycle', () => {
    const session = new SimulationSession(ledOnPin9());
    session.setProbes(['socket:UNO1.d9']);
    session.loadFirmware('UNO1', firmware('knob')); // knob at half: analogWrite(9, 127)
    run(session, 300);
    const { times, values } = (session.advance(100), session.frame()).trace!;
    const rising = times.filter((_, i) => i > 0 && values[0]![i]! > 4 && values[0]![i - 1]! < 1);
    const period = (rising.at(-1)! - rising[0]!) / (rising.length - 1);
    expect(1000 / period).toBeCloseTo(490, -1); // Arduino PWM on pin 9 is about 490 Hz
  });

  it('records a capacitor charging as a smooth curve', () => {
    const document: CircuitDocument = {
      ...emptyCircuit(),
      components: [
        { id: 'BAT1', type: 'battery', props: { voltage: 9 } },
        { id: 'R1', type: 'resistor', pins: { a: 'a1', b: 'a5' }, props: { resistance: 1000 } },
        { id: 'C1', type: 'capacitor', pins: { a: 'b5', b: 'b7' }, props: { capacitance: 100e-6 } },
      ],
      wires: [
        { id: 'W1', from: 'BAT1.pos', to: 'b1', color: '#000000' },
        { id: 'W2', from: 'c7', to: 'BAT1.neg', color: '#000000' },
      ],
    };
    const session = new SimulationSession(document);
    session.setProbes(['part:C1']);
    session.advance(100);
    const { times, values } = session.frame().trace!;
    expect(times.length).toBeGreaterThan(500);
    for (let i = 1; i < times.length; i++)
      expect(values[0]![i]!).toBeGreaterThan(values[0]![i - 1]!);
    expect(values[0]!.at(-1)).toBeCloseTo(9 * (1 - Math.exp(-1)), 1);
  });

  it('adds no trace when no probes are set', () => {
    const session = new SimulationSession(unoCircuitExample());
    session.advance(10);
    expect(session.frame().trace).toBeUndefined();
  });
});
