import {
  CIRCUIT_SCHEMA_VERSION,
  type CircuitComponent,
  type CircuitDocument,
  type Wire,
} from '@banglalab/shared';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SimulationSession } from './session';
import { simulate } from './simulate';

/**
 * The L298N motor driver module with the school kit's 7.2 V battery pack and
 * motors. What the outputs lose is from the chip's datasheet; the rest is as
 * sellers describe the module. None of it has been compared with the real part.
 */
function circuit(components: CircuitComponent[], wires: [string, string][]): CircuitDocument {
  return {
    schemaVersion: CIRCUIT_SCHEMA_VERSION,
    components,
    wires: wires.map(([from, to], i): Wire => ({ id: `W${i + 1}`, from, to, color: '#000000' })),
  };
}
const pack: CircuitComponent = { id: 'BAT1', type: 'battery', props: { voltage: 7.2 } };
const driver = (jumpers = { enaJumper: true, enbJumper: true }): CircuitComponent => ({
  id: 'DRV1',
  type: 'l298n',
  props: jumpers,
});
const motor = (id: string, a: string, b: string): CircuitComponent => ({
  id,
  type: 'motor',
  pins: { a, b },
  props: {},
});
const esp32: CircuitComponent = { id: 'ESP1', type: 'esp32', props: {} };
/** Battery to the driver, and motor A on its first two outputs. */
const power: [string, string][] = [
  ['BAT1.pos', 'DRV1.vs'],
  ['BAT1.neg', 'DRV1.gnd'],
  ['DRV1.out1', 'a10'],
  ['DRV1.out2', 'a13'],
];
const warnings = (document: CircuitDocument) =>
  simulate(document).diagnostics.filter((d) => d.severity !== 'info');

describe('L298N motor driver, by itself', () => {
  /** IN1 and IN2 held by hand: to the module's own 5 V for HIGH, to its ground for LOW. */
  const held = (in1: boolean, in2: boolean, jumpers?: Parameters<typeof driver>[0]) =>
    circuit(
      [pack, driver(jumpers), motor('M1', 'c10', 'c13')],
      [
        ...power,
        [in1 ? 'DRV1.5v' : 'DRV1.gnd', 'DRV1.in1'],
        [in2 ? 'DRV1.5v' : 'DRV1.gnd', 'DRV1.in2'],
      ],
    );

  it('makes about 5 V for its logic from the 7.2 V pack, and takes about 43 mA at rest', () => {
    const result = simulate(held(false, false));
    expect(
      result.nodeVoltages['terminal:DRV1.5v']! - result.nodeVoltages['terminal:DRV1.gnd']!,
    ).toBeGreaterThan(4.85);
    expect(
      result.nodeVoltages['terminal:DRV1.5v']! - result.nodeVoltages['terminal:DRV1.gnd']!,
    ).toBeLessThan(5.1);
    expect(result.readings.DRV1!.voltage).toBeGreaterThan(7.1);
    expect(result.readings.DRV1!.current).toBeCloseTo(0.043, 2);
    expect(result.readings.M1!.activity).toBe(0);
    expect(warnings(held(false, false))).toEqual([]);
  });

  it('turns the motor one way or the other, and loses about 1.6 V on the way', () => {
    const forward = simulate(held(true, false));
    const motorVolts = forward.readings.M1!.voltage;
    const supply = forward.readings.DRV1!.voltage;
    // A 25 Ω motor: about 0.21 A, where the two outputs together lose 1.5 V to 1.8 V.
    expect(supply - motorVolts).toBeGreaterThan(1.5);
    expect(supply - motorVolts).toBeLessThan(1.8);
    expect(forward.readings.M1!.current).toBeCloseTo(motorVolts / 25, 6);
    expect(forward.readings.M1!.activity).toBeGreaterThan(0.85);
    // Everything the driver takes comes from the battery: its own 43 mA and the motor's.
    expect(forward.readings.DRV1!.current).toBeCloseTo(forward.readings.BAT1!.current, 6);
    expect(forward.readings.DRV1!.current).toBeCloseTo(0.043 + motorVolts / 25, 2);

    const backward = simulate(held(false, true));
    expect(backward.readings.M1!.voltage).toBeCloseTo(-motorVolts, 3);
    expect(backward.readings.M1!.activity).toBeLessThan(-0.85);
  });

  it('stops the motor with both inputs the same', () => {
    expect(simulate(held(true, true)).readings.M1!.voltage).toBeCloseTo(0, 3);
    expect(simulate(held(false, false)).readings.M1!.voltage).toBeCloseTo(0, 3);
  });

  it('with its jumper taken off, a channel is off until its enable pin is taken HIGH', () => {
    const off = held(true, false, { enaJumper: false, enbJumper: true });
    expect(simulate(off).readings.M1!.current).toBeLessThan(1e-5);
    const on = { ...off, wires: [...off.wires] };
    on.wires.push({ id: 'W9', from: 'DRV1.5v', to: 'DRV1.ena', color: '#000000' });
    expect(simulate(on).readings.M1!.activity).toBeGreaterThan(0.85);
  });

  it('runs two motors, each from its own pair of inputs', () => {
    const both = circuit(
      [pack, driver(), motor('M1', 'c10', 'c13'), motor('M2', 'c20', 'c23')],
      [
        ...power,
        ['DRV1.out3', 'a20'],
        ['DRV1.out4', 'a23'],
        ['DRV1.5v', 'DRV1.in1'],
        ['DRV1.5v', 'DRV1.in4'],
      ],
    );
    const result = simulate(both);
    expect(result.readings.M1!.activity).toBeGreaterThan(0.8);
    expect(result.readings.M2!.activity).toBeLessThan(-0.8);
    // Two motors pull the pack down a little further than one.
    expect(result.readings.BAT1!.voltage).toBeLessThan(7.0);
    expect(result.readings.BAT1!.current).toBeCloseTo(
      0.043 + result.readings.M1!.current - result.readings.M2!.current,
      2,
    );
  });

  it('does nothing on a supply too low for its regulator, and the lab says why', () => {
    const weak = circuit(
      [
        { ...pack, props: { voltage: 4.5 } } as CircuitComponent,
        driver(),
        motor('M1', 'c10', 'c13'),
      ],
      [...power, ['DRV1.5v', 'DRV1.in1']],
    );
    const result = simulate(weak);
    expect(result.readings.M1!.current).toBeLessThan(1e-5);
    expect(result.diagnostics.filter((d) => d.severity !== 'info')).toMatchObject([
      { code: 'module-underpowered', componentId: 'DRV1', limit: 6.5 },
    ]);
  });

  it('its outputs only give or only take: nothing flows back into the supply side', () => {
    // OUT1 HIGH and a second battery pushing a higher voltage into it: the output shuts.
    const pushed = circuit(
      [pack, driver(), { id: 'BAT2', type: 'battery', props: { voltage: 12 } }],
      [
        ['BAT1.pos', 'DRV1.vs'],
        ['BAT1.neg', 'DRV1.gnd'],
        ['DRV1.5v', 'DRV1.in1'],
        ['BAT2.pos', 'DRV1.out1'],
        ['BAT2.neg', 'DRV1.gnd'],
      ],
    );
    expect(Math.abs(simulate(pushed).readings.BAT2!.current)).toBeLessThan(1e-4);
  });
});

describe('L298N motor driver with the ESP32 board', () => {
  /** Direction from D26 and D27; the enable pin as the jumper or D25 decides. */
  const wired = (extra: [string, string][] = [], jumpers?: Parameters<typeof driver>[0]) =>
    circuit(
      [esp32, pack, driver(jumpers), motor('M1', 'c10', 'c13')],
      [...power, ['ESP1.d26', 'DRV1.in1'], ['ESP1.d27', 'DRV1.in2'], ...extra],
    );
  const ground: [string, string] = ['ESP1.gnd1', 'DRV1.gnd'];
  /** Pin levels as a program would set them. */
  const drives = (levels: Record<number, 'high' | 'low'>) => ({
    pressed: [],
    boards: { ESP1: Array.from({ length: 40 }, (_, pin) => levels[pin] ?? ('input' as const)) },
  });

  it('a 3.3 V pin is enough to switch its inputs', () => {
    const result = simulate(wired([ground]), drives({ 26: 'high', 27: 'low' }));
    expect(result.readings.M1!.activity).toBeGreaterThan(0.85);
    expect(result.sockets['ESP1.d26']!.voltage).toBeGreaterThan(3.2);
    // An input takes about 33 µA from the pin.
    expect(result.sockets['ESP1.d26']!.current).toBeCloseTo(3.3 / 100_000, 5);
    expect(result.diagnostics.filter((d) => d.severity !== 'info')).toEqual([]);
  });

  it('does nothing without a ground wire between the board and the driver', () => {
    const result = simulate(wired(), drives({ 26: 'high', 27: 'low' }));
    expect(result.readings.M1!.current).toBeLessThan(1e-5);
  });

  it('warns when a pin is wired to an enable pin whose jumper is still on', () => {
    const result = simulate(wired([ground, ['ESP1.d25', 'DRV1.ena']]), drives({ 26: 'high' }));
    expect(result.diagnostics.filter((d) => d.severity !== 'info')).toMatchObject([
      { code: 'pin-overvoltage', componentId: 'ESP1', socket: 'd25' },
    ]);
  });

  it('sets the speed with pulses on the enable pin, once the jumper is off', () => {
    const document = wired([ground, ['ESP1.d25', 'DRV1.ena']], {
      enaJumper: false,
      enbJumper: true,
    });
    const full = simulate(document, drives({ 25: 'high', 26: 'high', 27: 'low' }));
    const off = simulate(document, drives({ 25: 'low', 26: 'high', 27: 'low' }));
    expect(full.readings.M1!.activity).toBeGreaterThan(0.85);
    expect(off.readings.M1!.current).toBeLessThan(1e-5);
    expect(full.diagnostics.filter((d) => d.severity !== 'info')).toEqual([]);
  });

  it('can carry the board from its 5 V terminal, and the lab points out the USB cable', () => {
    const fed = wired([ground, ['DRV1.5v', 'ESP1.vin']]);
    const result = simulate(fed, drives({ 26: 'low', 27: 'low' }));
    // The board's own 80 mA or so now comes from the pack, through the driver's regulator.
    expect(result.sockets['ESP1.vin']!.current).toBeLessThan(-0.06);
    expect(result.readings.BAT1!.current).toBeGreaterThan(0.11);
    expect(result.readings.BAT1!.current).toBeLessThan(0.14);
    expect(result.sockets['ESP1.vin']!.voltage).toBeGreaterThan(4.9);
    expect(result.diagnostics.filter((d) => d.severity !== 'info')).toMatchObject([
      { code: 'supply-backfeed', componentId: 'ESP1', socket: 'vin' },
    ]);
  });
});

describe("the ESP32 board's VIN pin", () => {
  it('gives about 4.65 V from USB with nothing on it, a little less under load', () => {
    const probe = circuit(
      [
        esp32,
        { id: 'R1', type: 'resistor', pins: { a: 'c1', b: 'c5' }, props: { resistance: 47_000 } },
      ],
      [
        ['ESP1.vin', 'a1'],
        ['ESP1.gnd1', 'a5'],
      ],
    );
    expect(simulate(probe).sockets['ESP1.vin']!.voltage).toBeCloseTo(4.64, 1);
    const loaded = { ...probe };
    loaded.components = [
      esp32,
      { id: 'R1', type: 'resistor', pins: { a: 'c1', b: 'c5' }, props: { resistance: 47 } },
    ];
    const result = simulate(loaded);
    expect(result.sockets['ESP1.vin']!.voltage).toBeGreaterThan(4.55);
    expect(result.sockets['ESP1.vin']!.voltage).toBeLessThan(4.64);
    // What leaves the pin is what the resistor takes, not what the board itself uses.
    expect(result.sockets['ESP1.vin']!.current).toBeCloseTo(
      result.sockets['ESP1.vin']!.voltage / 47,
      3,
    );
    expect(result.diagnostics.filter((d) => d.severity !== 'info')).toEqual([]);
  });
});

describe('the ready-made motor program', () => {
  const starter = readFileSync(
    new URL('../../board-emulators/fixtures/esp32-starters/motor.wasm.base64', import.meta.url),
    'utf8',
  );
  /** As the program's first lines say: speed on D25 with the jumper off, direction on D26 and D27. */
  const document = circuit(
    [esp32, pack, driver({ enaJumper: false, enbJumper: true }), motor('M1', 'c10', 'c13')],
    [
      ...power,
      ['ESP1.gnd1', 'DRV1.gnd'],
      ['ESP1.d25', 'DRV1.ena'],
      ['ESP1.d26', 'DRV1.in1'],
      ['ESP1.d27', 'DRV1.in2'],
    ],
  );

  it('runs the motor forwards at full speed, stops, runs it back at half speed, and stops', () => {
    const session = new SimulationSession(document);
    session.loadFirmware('ESP1', starter);
    let serial = '';
    /** The motor's speed in the middle of each half second. */
    const speeds: number[] = [];
    const look = () => {
      const frame = session.frame();
      serial += frame.boards.ESP1!.serial;
      return frame;
    };
    for (let half = 0; half < 12; half++) {
      session.advance(200);
      look();
      session.advance(100);
      const frame = look();
      speeds.push(frame.result.readings.M1!.activity ?? 0);
      session.advance(200);
      look();
      expect(frame.result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    }
    // Two seconds forwards, one stopped, two backwards, one stopped.
    for (const speed of speeds.slice(0, 4)) expect(speed).toBeGreaterThan(0.85);
    for (const speed of speeds.slice(4, 6)) expect(speed).toBe(0);
    // Half the pulses: half the average voltage, the other way round.
    for (const speed of speeds.slice(6, 10)) {
      expect(speed).toBeLessThan(-0.4);
      expect(speed).toBeGreaterThan(-0.5);
    }
    for (const speed of speeds.slice(10, 12)) expect(speed).toBe(0);
    expect(serial).toContain('সামনে, পুরো গতিতে');
    expect(serial).toContain('পেছনে, অর্ধেক গতিতে');
  }, 30_000);

  it('does nothing with the jumper left on, and the lab says the pin is getting 5 V', () => {
    const jumpered = {
      ...document,
      components: document.components.map((c) =>
        c.id === 'DRV1' ? driver({ enaJumper: true, enbJumper: true }) : c,
      ),
    };
    const session = new SimulationSession(jumpered);
    session.loadFirmware('ESP1', starter);
    session.advance(500);
    const codes = session.frame().result.diagnostics.map((d) => `${d.code} ${d.socket ?? ''}`);
    expect(codes).toContain('pin-overvoltage d25');
  });
});
