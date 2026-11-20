import { readFileSync } from 'node:fs';
import {
  CIRCUIT_SCHEMA_VERSION,
  updateProps,
  type CircuitComponent,
  type CircuitDocument,
  type Wire,
} from '@banglalab/shared';
import { describe, expect, it } from 'vitest';
import { SimulationSession } from './session';
import { simulate } from './simulate';

/** Builds a document from parts and [from, to] wire pairs. */
function circuit(components: CircuitComponent[], wires: [string, string][]): CircuitDocument {
  return {
    schemaVersion: CIRCUIT_SCHEMA_VERSION,
    components,
    wires: wires.map(([from, to], i): Wire => ({ id: `W${i + 1}`, from, to, color: '#000000' })),
  };
}
const battery = (voltage = 9): CircuitComponent => ({
  id: 'BAT1',
  type: 'battery',
  props: { voltage },
});
const uno: CircuitComponent = { id: 'UNO1', type: 'uno', props: {} };
const resistor = (id: string, a: string, b: string, resistance: number): CircuitComponent => ({
  id,
  type: 'resistor',
  pins: { a, b },
  props: { resistance },
});
const led = (anode: string, cathode: string): CircuitComponent => ({
  id: 'LED1',
  type: 'led',
  pins: { anode, cathode },
  props: { color: 'red' },
});
function withProps(document: CircuitDocument, id: string, props: Record<string, unknown>) {
  const result = updateProps(document, id, props);
  if (!result.ok) throw new Error(result.error);
  return result.circuit;
}
const firmware = (name: string) =>
  readFileSync(
    new URL(`../../board-emulators/fixtures/starters/${name}.hex`, import.meta.url),
    'utf8',
  );

describe('switch', () => {
  // Battery → switch → 330 Ω → LED → battery.
  const document = circuit(
    [
      battery(),
      { id: 'S1', type: 'switch', pins: { a: 'a1', b: 'a3' }, props: { closed: false } },
      resistor('R1', 'b3', 'b7', 330),
      led('c7', 'c8'),
    ],
    [
      ['BAT1.pos', 'b1'],
      ['d8', 'BAT1.neg'],
    ],
  );

  it('open: no current, and the full battery voltage appears across it', () => {
    const result = simulate(document);
    expect(result.readings.LED1!.led!.state).toBe('off');
    expect(result.readings.S1!.voltage).toBeCloseTo(9, 3);
    expect(result.readings.S1!.current).toBe(0);
  });

  it('closed: the LED lights and almost nothing drops across the switch', () => {
    const result = simulate(withProps(document, 'S1', { closed: true }));
    expect(result.readings.LED1!.led!.state).toBe('on');
    expect(result.readings.S1!.voltage).toBeLessThan(0.01);
    expect(result.readings.S1!.current).toBeCloseTo(result.readings.LED1!.current, 9);
    expect(result.diagnostics).toEqual([]);
  });
});

describe('diode', () => {
  it('forward: drops about 0.7 V and passes the rest to the resistor', () => {
    const { readings } = simulate(
      circuit(
        [
          battery(),
          { id: 'D1', type: 'diode', pins: { anode: 'a1', cathode: 'a5' }, props: {} },
          resistor('R1', 'b5', 'b9', 330),
        ],
        [
          ['BAT1.pos', 'b1'],
          ['c9', 'BAT1.neg'],
        ],
      ),
    );
    expect(readings.D1!.voltage).toBeGreaterThan(0.6);
    expect(readings.D1!.voltage).toBeLessThan(0.8);
    expect(readings.R1!.current).toBeCloseTo((9 - readings.D1!.voltage) / 330.52, 4);
  });

  it('reverse: blocks the current and takes the whole voltage', () => {
    const { readings } = simulate(
      circuit(
        [
          battery(),
          { id: 'D1', type: 'diode', pins: { anode: 'a5', cathode: 'a1' }, props: {} },
          resistor('R1', 'b5', 'b9', 330),
        ],
        [
          ['BAT1.pos', 'b1'],
          ['c9', 'BAT1.neg'],
        ],
      ),
    );
    expect(Math.abs(readings.R1!.current)).toBeLessThan(1e-7);
    expect(readings.D1!.voltage).toBeCloseTo(-9, 2);
  });
});

describe('light-dependent resistor', () => {
  // 5 V → LDR → A0 → 10 kΩ → GND: more light, higher reading.
  const document = circuit(
    [
      uno,
      { id: 'LDR1', type: 'ldr', pins: { a: 'a1', b: 'a3' }, props: { light: 0.5 } },
      resistor('R1', 'b3', 'b7', 10_000),
    ],
    [
      ['UNO1.5v', 'b1'],
      ['c7', 'UNO1.gnd'],
      ['UNO1.a0', 'c3'],
    ],
  );
  const a0 = (light: number) =>
    simulate(withProps(document, 'LDR1', { light })).sockets['UNO1.a0']!.voltage;

  it('runs from 1 MΩ in the dark to 1 kΩ in bright light', () => {
    expect(a0(0)).toBeCloseTo(5 * (10_000 / 1_010_000), 3);
    expect(a0(1)).toBeCloseTo(5 * (10_000 / 11_000), 2);
    expect(a0(0.5)).toBeGreaterThan(a0(0.25));
  });
});

describe('buzzer', () => {
  const document = (voltage: number) =>
    circuit(
      [battery(voltage), { id: 'BZ1', type: 'buzzer', pins: { pos: 'a1', neg: 'a3' }, props: {} }],
      [
        ['BAT1.pos', 'b1'],
        ['b3', 'BAT1.neg'],
      ],
    );

  it('sounds at 4.5 V, stays silent at 1.5 V, and draws about 25 mA at 5 V', () => {
    expect(simulate(document(4.5)).readings.BZ1!.activity).toBe(1);
    expect(simulate(document(1.5)).readings.BZ1!.activity).toBe(0);
    expect(simulate(document(4.5)).readings.BZ1!.current).toBeCloseTo(4.5 / 200.52, 4);
  });

  it('beeps in step with a blinking pin', () => {
    const session = new SimulationSession(
      circuit(
        [uno, { id: 'BZ1', type: 'buzzer', pins: { pos: 'a1', neg: 'a3' }, props: {} }],
        [
          ['UNO1.d13', 'b1'],
          ['b3', 'UNO1.gnd'],
        ],
      ),
    );
    session.loadFirmware('UNO1', firmware('blink'));
    const heard: number[] = [];
    for (let i = 0; i < 40; i++) {
      session.advance(50);
      heard.push(session.frame().result.readings.BZ1!.activity!);
    }
    expect(heard.filter((a) => a === 1).length).toBeGreaterThanOrEqual(18);
    expect(heard.filter((a) => a === 0).length).toBeGreaterThanOrEqual(18);
  });
});

describe('motor and transistor', () => {
  it('a motor straight on a pin overloads the pin and barely turns', () => {
    const session = new SimulationSession(
      circuit(
        [uno, { id: 'M1', type: 'motor', pins: { a: 'a1', b: 'a4' }, props: {} }],
        [
          ['UNO1.d13', 'b1'],
          ['b4', 'UNO1.gnd'],
        ],
      ),
    );
    session.loadFirmware('UNO1', firmware('blink'));
    let frame = session.frame();
    for (let i = 0; i < 20 && frame.boards.UNO1?.highFraction[13] !== 1; i++) {
      session.advance(50);
      frame = session.frame();
    }
    // 5 V across 25 Ω pin resistance + 25 Ω winding: 100 mA, far above the 40 mA limit.
    expect(frame.result.sockets['UNO1.d13']!.current).toBeCloseTo(0.1, 2);
    expect(frame.result.diagnostics).toContainEqual({
      code: 'pin-overcurrent',
      severity: 'error',
      componentId: 'UNO1',
      socket: 'd13',
    });
    expect(frame.result.readings.M1!.activity).toBeCloseTo(2.5 / 6, 1);
  });

  /** Pin 13 → 1 kΩ → base; motor from the battery to the collector; emitter to ground. */
  const driven = circuit(
    [
      uno,
      battery(6),
      { id: 'M1', type: 'motor', pins: { a: 'a1', b: 'a4' }, props: {} },
      {
        id: 'Q1',
        type: 'transistor',
        pins: { collector: 'c4', base: 'c5', emitter: 'c6' },
        props: {},
      },
      resistor('R1', 'd5', 'd10', 1000),
    ],
    [
      ['BAT1.pos', 'b1'],
      ['UNO1.d13', 'e10'],
      ['e6', 'UNO1.gnd'],
      ['BAT1.neg', 'UNO1.gnd2'],
    ],
  );

  it('a transistor lets the pin switch the motor from a separate battery', () => {
    const session = new SimulationSession(driven);
    session.loadFirmware('UNO1', firmware('blink'));
    const speeds: number[] = [];
    let onFrame;
    for (let i = 0; i < 40; i++) {
      session.advance(50);
      const frame = session.frame();
      speeds.push(frame.result.readings.M1!.activity!);
      if (frame.boards.UNO1!.highFraction[13] === 1) onFrame = frame;
    }
    const on = onFrame!.result;
    expect(on.diagnostics).toEqual([]);
    // The pin supplies only the base current; the battery supplies the motor.
    expect(on.sockets['UNO1.d13']!.current).toBeLessThan(0.005);
    expect(on.readings.M1!.current).toBeGreaterThan(0.2);
    expect(on.readings.Q1!.voltage).toBeLessThan(0.3); // saturated
    expect(on.readings.M1!.activity).toBeGreaterThan(0.9);
    expect(Math.min(...speeds)).toBe(0); // stops when the pin goes LOW
  });
});

describe('three-pin sensor modules', () => {
  const module = (component: CircuitComponent) =>
    circuit(
      [uno, component],
      [
        ['UNO1.5v', 'a10'],
        ['UNO1.a0', 'a11'],
        ['UNO1.gnd', 'a12'],
      ],
    );
  const pins = { vcc: 'c10', out: 'c11', gnd: 'c12' };

  it('temperature sensor gives 10 mV per degree', () => {
    const at = (celsius: number) =>
      simulate(module({ id: 'TMP1', type: 'temperature', pins, props: { celsius } })).readings.TMP1!
        .voltage;
    expect(at(25)).toBeCloseTo(0.25, 3);
    expect(at(37)).toBeCloseTo(0.37, 3);
    expect(at(0)).toBeLessThan(0.01);
  });

  it('a program reads the temperature through analogRead', () => {
    const session = new SimulationSession(
      module({ id: 'TMP1', type: 'temperature', pins, props: { celsius: 30 } }),
    );
    session.loadFirmware('UNO1', firmware('knob')); // prints analogRead(A0)
    let printed = '';
    for (let i = 0; i < 8; i++) {
      session.advance(50);
      printed += session.frame().boards.UNO1!.serial;
    }
    const value = Number(printed.trim().split(/\r?\n/).at(-1));
    // 0.30 V of 5 V on a 10-bit converter: 61. Converting back gives the temperature.
    expect(Math.abs(value - 61)).toBeLessThanOrEqual(1);
    expect((value * 5 * 100) / 1023).toBeCloseTo(30, 0);
  });

  it('soil sensor reads high when dry and low when wet', () => {
    const at = (moisture: number) =>
      simulate(module({ id: 'SOIL1', type: 'soil', pins, props: { moisture } })).readings.SOIL1!
        .voltage;
    expect(at(0)).toBeCloseTo(4.5, 2);
    expect(at(1)).toBeCloseTo(1.5, 2);
    expect(at(0.5)).toBeCloseTo(3.0, 2);
  });

  it('IR sensor output goes LOW when it sees an obstacle', () => {
    const at = (detected: boolean) =>
      simulate(module({ id: 'IR1', type: 'ir', pins, props: { detected } })).readings.IR1!.voltage;
    expect(at(false)).toBeGreaterThan(4.9);
    expect(at(true)).toBeLessThan(0.1);
  });

  it('gives no output when it is not powered', () => {
    const unpowered = circuit(
      [uno, { id: 'TMP1', type: 'temperature', pins, props: { celsius: 60 } }],
      [
        ['UNO1.a0', 'a11'],
        ['UNO1.gnd', 'a12'],
      ],
    );
    expect(simulate(unpowered).readings.TMP1!.voltage).toBeCloseTo(0, 6);
  });
});

describe('relay', () => {
  const relay: CircuitComponent = {
    id: 'K1',
    type: 'relay',
    pins: { coil1: 'a20', coil2: 'a21', com: 'a23', no: 'a24' },
    props: {},
  };

  /** A 6 V battery lights an LED through the relay contact; the coil has its own battery. */
  const withCoilBattery = (coilVolts: number) =>
    circuit(
      [
        { id: 'BAT1', type: 'battery', props: { voltage: coilVolts } },
        { id: 'BAT2', type: 'battery', props: { voltage: 6 } },
        relay,
        resistor('R1', 'b24', 'b28', 220),
        led('c28', 'c29'),
      ],
      [
        ['BAT1.pos', 'b20'],
        ['b21', 'BAT1.neg'],
        ['BAT2.pos', 'b23'],
        ['d29', 'BAT2.neg'],
      ],
    );

  it('closes its contact when the coil gets enough current, switching a separate circuit', () => {
    const on = simulate(withCoilBattery(6)); // 6 V / 70.5 Ω = 85 mA
    expect(on.readings.K1!.current).toBeCloseTo(6 / 70.52, 3);
    expect(on.readings.K1!.activity).toBe(1);
    expect(on.readings.LED1!.led!.state).toBe('on');

    const off = simulate(withCoilBattery(3)); // 43 mA: below the 50 mA it needs
    expect(off.readings.K1!.activity).toBe(0);
    expect(off.readings.LED1!.led!.state).toBe('off');
  });

  it('holds on with less current than it needs to pull in', () => {
    const session = new SimulationSession(withCoilBattery(6));
    session.advance(10);
    expect(session.frame().result.readings.K1!.activity).toBe(1);
    // 3 V is not enough to close the contact, but is enough to keep it closed.
    session.update(withCoilBattery(3));
    session.advance(10);
    expect(session.frame().result.readings.K1!.activity).toBe(1);
    // 1.5 V (21 mA) is above the drop-out level too; below it the contact opens.
    session.update(circuit([relay, resistor('R1', 'b24', 'b28', 220)], []));
    session.advance(10);
    expect(session.frame().result.readings.K1!.activity).toBe(0);
  });

  it('driven straight from a pin it overloads the pin; through a transistor it does not', () => {
    const direct = new SimulationSession(
      circuit(
        [uno, relay],
        [
          ['UNO1.d13', 'b20'],
          ['b21', 'UNO1.gnd'],
        ],
      ),
    );
    direct.loadFirmware('UNO1', firmware('blink'));
    let overloaded = false;
    for (let i = 0; i < 20; i++) {
      direct.advance(50);
      overloaded ||= direct.frame().result.diagnostics.some((d) => d.code === 'pin-overcurrent');
    }
    expect(overloaded).toBe(true);

    // 5 V → coil → collector; pin 13 → 1 kΩ → base; emitter → GND.
    const session = new SimulationSession(
      circuit(
        [
          uno,
          relay,
          {
            id: 'Q1',
            type: 'transistor',
            pins: { collector: 'c21', base: 'c22', emitter: 'c23' },
            props: {},
          },
          resistor('R1', 'd22', 'h22', 1000),
        ],
        [
          ['UNO1.5v', 'b20'],
          ['UNO1.d13', 'i22'],
          ['d23', 'UNO1.gnd'],
        ],
      ),
    );
    session.loadFirmware('UNO1', firmware('blink'));
    const states: number[] = [];
    const problems = new Set<string>();
    for (let i = 0; i < 40; i++) {
      session.advance(50);
      const { result } = session.frame();
      states.push(result.readings.K1!.activity!);
      result.diagnostics.forEach((d) => problems.add(d.code));
    }
    expect(states).toContain(1);
    expect(states).toContain(0);
    expect([...problems]).toEqual([]);
  });
});

describe('servo', () => {
  const servo: CircuitComponent = {
    id: 'SRV1',
    type: 'servo',
    pins: { gnd: 'c10', vcc: 'c11', signal: 'c12' },
    props: {},
  };
  const wired = circuit(
    [uno, servo],
    [
      ['UNO1.gnd', 'a10'],
      ['UNO1.5v', 'a11'],
      ['UNO1.d9', 'a12'],
    ],
  );

  it('sweeps from 0° to 180° and back under the Servo library', () => {
    const session = new SimulationSession(wired);
    session.loadFirmware('UNO1', firmware('servo'));
    const angles: number[] = [];
    for (let i = 0; i < 80; i++) {
      session.advance(50);
      const angle = session.frame().result.readings.SRV1!.angle;
      if (angle !== undefined) angles.push(angle);
    }
    expect(Math.min(...angles)).toBeLessThan(2);
    expect(Math.max(...angles)).toBeGreaterThan(178);
    // The sketch moves in 10° steps: every reported angle is close to a multiple of ten.
    for (const angle of angles)
      expect(Math.abs(angle - Math.round(angle / 10) * 10)).toBeLessThan(1.5);
    // It goes up and then comes back down.
    const peak = angles.indexOf(Math.max(...angles));
    expect(angles.at(-1)!).toBeLessThan(angles[peak]!);
  });

  it('does not move without power, and ignores a pin that is merely blinking', () => {
    const unpowered = new SimulationSession(circuit([uno, servo], [['UNO1.d9', 'a12']]));
    unpowered.loadFirmware('UNO1', firmware('servo'));
    unpowered.advance(500);
    expect(unpowered.frame().result.readings.SRV1!.angle).toBeUndefined();

    const blinking = new SimulationSession(
      circuit(
        [uno, servo],
        [
          ['UNO1.gnd', 'a10'],
          ['UNO1.5v', 'a11'],
          ['UNO1.d13', 'a12'],
        ],
      ),
    );
    blinking.loadFirmware('UNO1', firmware('blink'));
    blinking.advance(2500);
    expect(blinking.frame().result.readings.SRV1!.angle).toBeUndefined();
  });
});

describe('ultrasonic distance sensor', () => {
  const sensor = (distance: number): CircuitComponent => ({
    id: 'US1',
    type: 'ultrasonic',
    pins: { vcc: 'c10', trig: 'c11', echo: 'c12', gnd: 'c13' },
    props: { distance },
  });
  const wired = (distance: number) =>
    circuit(
      [uno, sensor(distance)],
      [
        ['UNO1.5v', 'a10'],
        ['UNO1.d7', 'a11'],
        ['UNO1.d6', 'a12'],
        ['UNO1.gnd', 'a13'],
      ],
    );
  /** Runs the distance sketch and returns the numbers it prints. */
  function measure(session: SimulationSession, milliseconds: number): number[] {
    let printed = '';
    for (let t = 0; t < milliseconds; t += 50) {
      session.advance(50);
      printed += session.frame().boards.UNO1!.serial;
    }
    return printed.trim().split(/\r?\n/).filter(Boolean).map(Number);
  }

  it.each([5, 50, 123, 300])('pulseIn() measures %i cm', (distance) => {
    const session = new SimulationSession(wired(distance));
    session.loadFirmware('UNO1', firmware('distance'));
    const readings = measure(session, 700);
    expect(readings.length).toBeGreaterThanOrEqual(2);
    // The echo delivered is exact (checked below). Arduino's pulseIn() itself reads about
    // 0.7 % short, as it does on a real board, so allow 1 cm or 1 %.
    const allowed = Math.max(1, distance * 0.01);
    for (const reading of readings)
      expect(Math.abs(reading - distance)).toBeLessThanOrEqual(allowed);
  });

  it('follows the obstacle when it is moved while the program runs', () => {
    const session = new SimulationSession(wired(40));
    session.loadFirmware('UNO1', firmware('distance'));
    expect(Math.abs(measure(session, 500).at(-1)! - 40)).toBeLessThanOrEqual(1);
    session.update(wired(150));
    expect(Math.abs(measure(session, 600).at(-1)! - 150)).toBeLessThanOrEqual(1);
  });

  it('shows the trigger and echo pulses on the recorded signals', () => {
    const session = new SimulationSession(wired(100));
    session.setProbes(['socket:UNO1.d7', 'socket:UNO1.d6']);
    session.loadFirmware('UNO1', firmware('distance'));
    const times: number[] = [];
    const echo: number[] = [];
    for (let i = 0; i < 6; i++) {
      session.advance(50);
      const { trace } = session.frame();
      times.push(...trace!.times);
      echo.push(...trace!.values[1]!);
    }
    const rise = times.find((_, i) => i > 0 && echo[i]! > 4 && echo[i - 1]! < 1)!;
    const fall = times.find((t, i) => t > rise && echo[i]! < 1)!;
    expect(fall - rise).toBeCloseTo(100 * 0.058, 2); // 5.8 ms for one metre
  });

  it('gives no echo when unpowered, so the program reads zero', () => {
    const session = new SimulationSession(
      circuit(
        [uno, sensor(50)],
        [
          ['UNO1.d7', 'a11'],
          ['UNO1.d6', 'a12'],
        ],
      ),
    );
    session.loadFirmware('UNO1', firmware('distance'));
    // pulseIn gives up after one second and returns 0.
    expect(measure(session, 2600)).toContain(0);
  });
});

describe('character LCD', () => {
  const pins = Object.fromEntries(
    [
      'vss',
      'vdd',
      'v0',
      'rs',
      'rw',
      'e',
      'd0',
      'd1',
      'd2',
      'd3',
      'd4',
      'd5',
      'd6',
      'd7',
      'a',
      'k',
    ].map((pin, i) => [pin, `h${i + 5}`]),
  );
  const lcd = { id: 'LCD1', type: 'lcd', pins, props: {} } as CircuitComponent;
  /** The wiring from the LiquidCrystal tutorial: RS 12, E 11, D4-D7 on 5, 4, 3, 2. */
  const signalWires: [string, string][] = [
    ['UNO1.d12', 'j8'],
    ['UNO1.d11', 'j10'],
    ['UNO1.d5', 'j15'],
    ['UNO1.d4', 'j16'],
    ['UNO1.d3', 'j17'],
    ['UNO1.d2', 'j18'],
  ];
  const powerWires: [string, string][] = [
    ['UNO1.gnd', 'j5'],
    ['UNO1.5v', 'j6'],
  ];

  it('shows what the LiquidCrystal library prints, and keeps updating', () => {
    const session = new SimulationSession(circuit([uno, lcd], [...powerWires, ...signalWires]));
    session.loadFirmware('UNO1', firmware('lcd'));
    session.advance(600);
    let shown = session.frame().result.readings.LCD1!.lcd!;
    expect(shown.lines[0]).toBe('Hello, Bangla!  ');
    expect(shown.lines[1].trim()).toBe('0 s');

    session.advance(2600);
    shown = session.frame().result.readings.LCD1!.lcd!;
    expect(shown.lines[1].trim()).toBe('3 s');
    expect(session.frame().result.diagnostics).toEqual([]);
  });

  it('shows nothing without power or with a data wire missing', () => {
    const unpowered = new SimulationSession(circuit([uno, lcd], signalWires));
    unpowered.loadFirmware('UNO1', firmware('lcd'));
    unpowered.advance(600);
    expect(unpowered.frame().result.readings.LCD1!.lcd).toBeUndefined();

    // Without D4 the handshake still passes, but the text comes out wrong.
    const miswired = new SimulationSession(
      circuit([uno, lcd], [...powerWires, ...signalWires.filter(([from]) => from !== 'UNO1.d5')]),
    );
    miswired.loadFirmware('UNO1', firmware('lcd'));
    miswired.advance(600);
    expect(miswired.frame().result.readings.LCD1?.lcd?.lines[0]).not.toBe('Hello, Bangla!  ');
  });
});
