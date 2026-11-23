import { readFileSync } from 'node:fs';
import {
  CIRCUIT_SCHEMA_VERSION,
  updateProps,
  type CircuitComponent,
  type CircuitDocument,
  type Wire,
} from '@banglalab/shared';
import { describe, expect, it } from 'vitest';
import { PIR_BLOCK_MS } from './library';
import { netName } from './netlist';
import { PIR_IDLE, pirDeadline, stepPir } from './pir';
import { SimulationSession } from './session';
import { simulate } from './simulate';

/**
 * The school kit's simple sensors and its RGB LED: the LDR, rain and gas sensor
 * modules, the motion sensor. Each is checked alone against what its model says
 * it does, then on the ESP32 board with the ready-made programs as shipped.
 * None of this has been compared with the real parts.
 */
const starter = (name: string) =>
  readFileSync(
    new URL(`../../board-emulators/fixtures/esp32-starters/${name}.wasm.base64`, import.meta.url),
    'utf8',
  );

function circuit(components: CircuitComponent[], wires: [string, string][]): CircuitDocument {
  return {
    schemaVersion: CIRCUIT_SCHEMA_VERSION,
    components,
    wires: wires.map(([from, to], i): Wire => ({ id: `W${i + 1}`, from, to, color: '#000000' })),
  };
}
const esp32: CircuitComponent = { id: 'ESP1', type: 'esp32', props: {} };
const uno: CircuitComponent = { id: 'UNO1', type: 'uno', props: {} };
const resistor = (id: string, a: string, b: string, resistance: number): CircuitComponent => ({
  id,
  type: 'resistor',
  pins: { a, b },
  props: { resistance },
});
/** An LED on D2 through 220 Ω, as every ready-made program expects. */
const lamp: CircuitComponent[] = [
  resistor('R1', 'BB1.c20', 'BB1.c24', 220),
  {
    id: 'LED1',
    type: 'led',
    pins: { anode: 'BB1.e24', cathode: 'BB1.e25' },
    props: { color: 'red' },
  },
];
const lampWires: [string, string][] = [
  ['ESP1.d2', 'BB1.a20'],
  ['ESP1.gnd2', 'BB1.a25'],
];
function withProps(document: CircuitDocument, id: string, props: Record<string, unknown>) {
  const result = updateProps(document, id, props);
  if (!result.ok) throw new Error(result.error);
  return result.circuit;
}
const warnings = (document: CircuitDocument) =>
  simulate(document).diagnostics.filter((d) => d.severity !== 'info');

/** Legs of a four-pin module in the order printed on it: VCC, GND, DO, AO. */
const modulePins = { vcc: 'BB1.c10', gnd: 'BB1.c11', do: 'BB1.c12', ao: 'BB1.c13' };

describe('LDR light sensor module', () => {
  const module = (light: number, threshold = 0.5): CircuitComponent => ({
    id: 'LDM1',
    type: 'ldrmodule',
    pins: modulePins,
    props: { light, threshold },
  });
  const wired = (light: number, threshold?: number) =>
    circuit(
      [esp32, module(light, threshold)],
      [
        ['ESP1.3v3', 'BB1.a10'],
        ['ESP1.gnd1', 'BB1.a11'],
      ],
    );
  const outputs = (light: number, threshold?: number) => {
    const result = simulate(wired(light, threshold));
    return {
      ao: result.readings.LDM1!.voltage,
      do: result.nodeVoltages[netName('BB1.c12')]!,
      lit: result.readings.LDM1!.activity,
    };
  };

  it('AO falls as the light grows', () => {
    // 1 MΩ in the dark and 1 kΩ in bright light, below a 10 kΩ resistor, on 3.3 V.
    expect(outputs(0).ao).toBeCloseTo((3.3 * 1000) / 1010, 2);
    expect(outputs(0.5).ao).toBeCloseTo((3.3 * 31.62) / 41.62, 2);
    expect(outputs(1).ao).toBeCloseTo(3.3 / 11, 2);
  });

  it('DO is HIGH in the dark and LOW in the light, and its indicator is lit while LOW', () => {
    expect(outputs(0.2)).toMatchObject({ lit: 0 });
    expect(outputs(0.2).do).toBeGreaterThan(3.2);
    expect(outputs(0.9)).toMatchObject({ lit: 1 });
    expect(outputs(0.9).do).toBeLessThan(0.1);
  });

  it('the trimmer moves the point at which DO switches', () => {
    // At this light AO is 76 % of the supply: LOW only once the trimmer is set above that.
    expect(outputs(0.5, 0.5).lit).toBe(0);
    expect(outputs(0.5, 0.7).lit).toBe(0);
    expect(outputs(0.5, 0.8).lit).toBe(1);
  });

  it('gives nothing without power', () => {
    const result = simulate(circuit([esp32, module(0.9)], [['ESP1.gnd1', 'BB1.a11']]));
    expect(result.readings.LDM1).toMatchObject({ voltage: 0, activity: 0 });
  });

  it('the ready-made program lights its LED in the dark and prints the reading', () => {
    const wires: [string, string][] = [
      ['ESP1.3v3', 'BB1.a10'],
      ['ESP1.gnd1', 'BB1.a11'],
      ['ESP1.d27', 'BB1.a12'],
      ['ESP1.d34', 'BB1.a13'],
      ...lampWires,
    ];
    const document = circuit([esp32, module(0.9), ...lamp], wires);
    const session = new SimulationSession(document);
    session.loadFirmware('ESP1', starter('light'));
    const run = () => {
      let serial = '';
      let frame = session.frame();
      for (let i = 0; i < 10; i++) {
        session.advance(50);
        frame = session.frame();
        serial += frame.boards.ESP1!.serial;
      }
      const readings = [...serial.matchAll(/আলোর মান: (\d+)/g)].map((m) => Number(m[1]));
      return { led: frame.result.readings.LED1!.led!.state, reading: readings.at(-1)! };
    };
    const bright = run();
    expect(bright.led).toBe('off');
    session.update(withProps(document, 'LDM1', { light: 0.1 }));
    const dark = run();
    expect(dark.led).toBe('on');
    // A 12-bit reading of AO: small in the light, near the top in the dark.
    expect(bright.reading).toBeLessThan(1000);
    expect(dark.reading).toBeGreaterThan(3500);
    expect(session.frame().result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  });
});

describe('rain sensor module', () => {
  const wired = (wetness: number) =>
    circuit(
      [esp32, { id: 'RAIN1', type: 'rain', pins: modulePins, props: { wetness, threshold: 0.5 } }],
      [
        ['ESP1.3v3', 'BB1.a10'],
        ['ESP1.gnd1', 'BB1.a11'],
      ],
    );

  it('AO is near the supply when dry and falls as the board gets wet', () => {
    const ao = (wetness: number) => simulate(wired(wetness)).readings.RAIN1!.voltage;
    expect(ao(0)).toBeCloseTo(3.3 * 0.98, 2);
    expect(ao(1)).toBeCloseTo(3.3 * 0.3, 2);
    expect(ao(0.5)).toBeLessThan(ao(0.2));
  });

  it('DO goes LOW once it is wet enough', () => {
    const at = (wetness: number) => {
      const result = simulate(wired(wetness));
      return { do: result.nodeVoltages[netName('BB1.c12')]!, lit: result.readings.RAIN1!.activity };
    };
    expect(at(0).do).toBeGreaterThan(3.2);
    expect(at(0).lit).toBe(0);
    expect(at(0.9).do).toBeLessThan(0.1);
    expect(at(0.9).lit).toBe(1);
  });
});

describe('MQ-135 gas sensor module', () => {
  const module = (gas: number): CircuitComponent => ({
    id: 'MQ1',
    type: 'mq135',
    pins: modulePins,
    props: { gas, threshold: 0.5 },
  });

  it('draws about 150 mA for its heater on 5 V, and AO rises as the air gets worse', () => {
    const wired = (gas: number) =>
      circuit(
        [uno, module(gas)],
        [
          ['UNO1.5v', 'BB1.a10'],
          ['UNO1.gnd', 'BB1.a11'],
        ],
      );
    const clean = simulate(wired(0)).readings.MQ1!;
    const smoky = simulate(wired(1)).readings.MQ1!;
    expect(clean.current).toBeCloseTo(0.15, 2);
    // The heater's current makes the board's 5 V sag a little.
    expect(clean.voltage).toBeGreaterThan(0.48);
    expect(clean.voltage).toBeLessThan(0.5);
    expect(smoky.voltage).toBeGreaterThan(3.9);
    expect(clean.activity).toBe(0);
    expect(smoky.activity).toBe(1);
    expect(warnings(wired(1))).toEqual([]);
  });

  it('on the ESP32 its AO is too much for a pin; a divider brings it down', () => {
    const direct = circuit(
      [esp32, module(1)],
      [
        ['ESP1.vin', 'BB1.a10'],
        ['ESP1.gnd1', 'BB1.a11'],
        ['ESP1.d34', 'BB1.a13'],
      ],
    );
    expect(warnings(direct)).toMatchObject([
      { code: 'pin-overvoltage', componentId: 'ESP1', socket: 'd34' },
    ]);
    // Two equal resistors halve it: at most 2 V on the pin.
    const divided = circuit(
      [
        esp32,
        module(1),
        resistor('R1', 'BB1.e13', 'BB1.e20', 10_000),
        resistor('R2', 'BB1.d20', 'BB1.d25', 10_000),
      ],
      [
        ['ESP1.vin', 'BB1.a10'],
        ['ESP1.gnd1', 'BB1.a11'],
        ['ESP1.d34', 'BB1.a20'],
        ['ESP1.gnd2', 'BB1.a25'],
      ],
    );
    const result = simulate(divided);
    expect(result.diagnostics.filter((d) => d.severity !== 'info')).toEqual([]);
    expect(result.sockets['ESP1.d34']!.voltage).toBeGreaterThan(1.5);
    expect(result.sockets['ESP1.d34']!.voltage).toBeLessThan(2.1);
  });

  it('warns when its heater is fed from 3.3 V', () => {
    const cool = circuit(
      [esp32, module(0.5)],
      [
        ['ESP1.3v3', 'BB1.a10'],
        ['ESP1.gnd1', 'BB1.a11'],
      ],
    );
    const [warning, ...others] = warnings(cool);
    expect(others).toEqual([]);
    expect(warning).toMatchObject({ code: 'module-underpowered', componentId: 'MQ1', limit: 4.5 });
    expect(warning!.volts).toBeGreaterThan(3);
    expect(warning!.volts).toBeLessThan(3.3);
  });
});

describe('motion sensor timing', () => {
  const input = { motion: true, powered: true, holdMs: 3000 };

  it('goes HIGH on movement and falls the hold time after the last movement', () => {
    let state = stepPir(PIR_IDLE, 100, input);
    expect(state).toMatchObject({ high: true, lowAt: 3100 });
    // Still moving a second later: the hold time starts again.
    state = stepPir(state, 1100, input);
    expect(state.lowAt).toBe(4100);
    const still = { ...input, motion: false };
    expect(pirDeadline(state, false)).toBe(4100);
    expect(stepPir(state, 4099, still).high).toBe(true);
    expect(stepPir(state, 4100, still)).toMatchObject({
      high: false,
      readyAt: 4100 + PIR_BLOCK_MS,
    });
  });

  it('ignores movement for a while after its output falls', () => {
    const low = { high: false, lowAt: 0, readyAt: 6600 };
    expect(stepPir(low, 5000, input).high).toBe(false);
    expect(pirDeadline(low, true)).toBe(6600);
    expect(stepPir(low, 6600, input).high).toBe(true);
    expect(pirDeadline(low, false)).toBe(Infinity);
  });

  it('forgets everything without power', () => {
    const high = stepPir(PIR_IDLE, 0, input);
    expect(stepPir(high, 10, { ...input, powered: false })).toEqual(PIR_IDLE);
  });
});

describe('HC-SR501 motion sensor', () => {
  const sensor = (motion: boolean): CircuitComponent => ({
    id: 'PIR1',
    type: 'pir',
    pins: { vcc: 'BB1.c10', out: 'BB1.c11', gnd: 'BB1.c12' },
    props: { motion, hold: 3 },
  });
  const sensorWires = (supply: string): [string, string][] => [
    [supply, 'BB1.a10'],
    ['ESP1.d27', 'BB1.a11'],
    ['ESP1.gnd1', 'BB1.a12'],
  ];
  /** The sensor alone on the board. */
  const alone = (motion: boolean, supply = 'ESP1.vin') =>
    circuit([esp32, sensor(motion)], sensorWires(supply));
  /** With the LED the ready-made program lights. */
  const wired = (motion: boolean) =>
    circuit([esp32, sensor(motion), ...lamp], [...sensorWires('ESP1.vin'), ...lampWires]);
  const out = (session: SimulationSession) => session.frame().result.sockets['ESP1.d27']!.voltage;

  it('gives 3.3 V while something moves, from a 5 V supply', () => {
    const still = simulate(alone(false));
    const moving = simulate(alone(true));
    expect(still.sockets['ESP1.d27']!.voltage).toBeLessThan(0.01);
    expect(moving.sockets['ESP1.d27']!.voltage).toBeCloseTo(3.3, 2);
    expect(moving.readings.PIR1!.activity).toBe(1);
    // 3.3 V is what an ESP32 pin may take: no divider needed.
    expect(moving.diagnostics.filter((d) => d.severity !== 'info')).toEqual([]);
  });

  it('does nothing on 3.3 V, and the lab says why', () => {
    const result = simulate(alone(true, 'ESP1.3v3'));
    expect(result.sockets['ESP1.d27']!.voltage).toBeLessThan(0.01);
    expect(result.readings.PIR1!.activity).toBe(0);
    expect(result.diagnostics.filter((d) => d.severity !== 'info')).toMatchObject([
      { code: 'module-underpowered', componentId: 'PIR1', limit: 4.5 },
    ]);
  });

  it('holds its output for the hold time, then ignores movement for 2.5 s', () => {
    const still = wired(false);
    const moving = wired(true);
    const session = new SimulationSession(still);
    session.advance(500);
    expect(out(session)).toBeLessThan(0.01);

    session.update(moving);
    session.advance(200);
    expect(out(session)).toBeCloseTo(3.3, 2);
    // The movement ends 200 ms after it began: the output falls 3 s after that.
    session.update(still);
    session.advance(2900);
    session.frame();
    session.advance(50);
    expect(out(session)).toBeCloseTo(3.3, 2);
    session.advance(100);
    session.frame();
    session.advance(50);
    expect(out(session)).toBeLessThan(0.01);

    // Movement straight away is not seen; it is seen once 2.5 s have passed.
    session.update(moving);
    session.advance(2000);
    session.frame();
    session.advance(50);
    expect(out(session)).toBeLessThan(0.01);
    session.advance(500);
    session.frame();
    session.advance(50);
    expect(out(session)).toBeCloseTo(3.3, 2);
  });

  it('changes on time however long a stretch is asked for', () => {
    const session = new SimulationSession(wired(true));
    session.advance(100);
    session.update(wired(false));
    session.frame();
    // One stretch of four seconds: HIGH for the first three of them, LOW for the last.
    session.advance(4000);
    expect(out(session)).toBeCloseTo((3.3 * 3000) / 4000, 2);
  });

  it('the ready-made program lights its LED and reports the movement once', () => {
    const session = new SimulationSession(wired(false));
    session.loadFirmware('ESP1', starter('motion'));
    let serial = '';
    const run = (milliseconds: number) => {
      let frame = session.frame();
      for (let done = 0; done < milliseconds; done += 50) {
        session.advance(50);
        frame = session.frame();
        serial += frame.boards.ESP1!.serial;
      }
      return frame.result.readings.LED1!.led!.state;
    };
    expect(run(300)).toBe('off');
    session.update(wired(true));
    expect(run(300)).toBe('on');
    session.update(wired(false));
    expect(run(2000)).toBe('on'); // still within the hold time
    expect(run(1500)).toBe('off');
    expect(serial.match(/কিছু নড়ছে!/g)).toHaveLength(1);
    expect(serial.match(/সব শান্ত।/g)).toHaveLength(1);
    expect(session.frame().result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  });
});

describe('RGB LED module', () => {
  const rgb: CircuitComponent = {
    id: 'RGB1',
    type: 'rgbled',
    pins: { r: 'BB1.e10', g: 'BB1.e11', b: 'BB1.e12', gnd: 'BB1.e13' },
    props: {},
  };
  const resistors = [
    resistor('R1', 'BB1.c5', 'BB1.c10', 220),
    resistor('R2', 'BB1.d6', 'BB1.d11', 220),
    resistor('R3', 'BB1.b7', 'BB1.b12', 220),
  ];
  const onBoard: [string, string][] = [
    ['ESP1.d25', 'BB1.a5'],
    ['ESP1.d26', 'BB1.a6'],
    ['ESP1.d27', 'BB1.a7'],
    ['ESP1.gnd1', 'BB1.a13'],
  ];

  it('each colour lights by itself, and red is the brightest on 3.3 V', () => {
    // Every colour fed from 3.3 V through its own 220 Ω.
    const document = circuit(
      [esp32, rgb, ...resistors],
      [
        ['ESP1.3v3', 'BB1.a5'],
        ['BB1.a5', 'BB1.a6'],
        ['BB1.a6', 'BB1.a7'],
        ['ESP1.gnd1', 'BB1.a13'],
      ],
    );
    const result = simulate(document);
    const reading = result.readings.RGB1!;
    expect(reading.led!.state).toBe('on');
    // Red needs 1.8 V and so gets several milliamps; green and blue need 2.8 V
    // and get much less from a 3.3 V pin.
    expect(reading.rgb!.r).toBeGreaterThan(0.5);
    expect(reading.rgb!.g).toBeGreaterThan(0.1);
    expect(reading.rgb!.g).toBeLessThan(reading.rgb!.r);
    expect(reading.rgb!.b).toBeCloseTo(reading.rgb!.g, 3);
    // What goes in through the three colour legs comes out of the common one.
    const leg = (pin: string) => result.legCurrents[`RGB1.${pin}`]!;
    expect(leg('r') + leg('g') + leg('b') + leg('gnd')).toBeCloseTo(0, 9);
    expect(leg('r')).toBeCloseTo(reading.current - leg('g') - leg('b'), 9);
    expect(result.diagnostics.filter((d) => d.severity !== 'info')).toEqual([]);
  });

  it('without a resistor a colour takes too much current, and the lab says so', () => {
    const bare = circuit(
      [uno, rgb],
      [
        ['UNO1.5v', 'BB1.a10'],
        ['UNO1.gnd', 'BB1.a13'],
      ],
    );
    const result = simulate(bare);
    expect(result.readings.RGB1!.led!.state).toBe('burned');
    expect(result.diagnostics.map((d) => d.code)).toContain('led-burned');
  });

  it('wired the wrong way round nothing lights, and the lab says so', () => {
    const reversed = circuit(
      [uno, rgb],
      [
        ['UNO1.5v', 'BB1.a13'],
        ['UNO1.gnd', 'BB1.a10'],
      ],
    );
    const result = simulate(reversed);
    expect(result.readings.RGB1!.led!.state).toBe('reversed');
    expect(result.readings.RGB1!.rgb).toEqual({ r: 0, g: 0, b: 0 });
    expect(result.diagnostics.map((d) => d.code)).toContain('led-reversed');
  });

  it('the ready-made program shows each colour, then the mixtures', () => {
    const session = new SimulationSession(circuit([esp32, rgb, ...resistors], onBoard));
    session.loadFirmware('ESP1', starter('rgb'));
    const seen: string[] = [];
    for (let second = 0; second < 7; second++) {
      // Look in the middle of each second, away from the changes.
      session.advance(500);
      session.frame();
      session.advance(100);
      const { rgb: mix } = session.frame().result.readings.RGB1!;
      seen.push((['r', 'g', 'b'] as const).filter((c) => mix![c] > 0.05).join(''));
      session.advance(400);
    }
    expect(seen).toEqual(['r', 'g', 'b', 'rg', 'gb', 'rb', 'rgb']);
    expect(session.frame().result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  });
});

describe('a module on too little voltage', () => {
  it('is pointed out for the parts that were already in the lab, too', () => {
    const document = circuit(
      [
        esp32,
        {
          id: 'US1',
          type: 'ultrasonic',
          pins: { vcc: 'BB1.c10', trig: 'BB1.c11', echo: 'BB1.c12', gnd: 'BB1.c13' },
          props: { distance: 50 },
        },
      ],
      [
        ['ESP1.3v3', 'BB1.a10'],
        ['ESP1.gnd1', 'BB1.a13'],
      ],
    );
    expect(warnings(document)).toMatchObject([
      { code: 'module-underpowered', componentId: 'US1', limit: 4 },
    ]);
    // Not wired to any supply yet: nothing to say.
    expect(warnings({ ...document, wires: [] })).toEqual([]);
  });
});

describe('OLED display', () => {
  const oled: CircuitComponent = {
    id: 'OLED1',
    type: 'oled',
    pins: { gnd: 'BB1.c10', vcc: 'BB1.c11', scl: 'BB1.c12', sda: 'BB1.c13' },
    props: {},
  };
  const wired = (supply = 'ESP1.3v3', scl = 'ESP1.d22', sda = 'ESP1.d21') =>
    circuit(
      [esp32, oled],
      [
        ['ESP1.gnd1', 'BB1.a10'],
        [supply, 'BB1.a11'],
        [scl, 'BB1.a12'],
        [sda, 'BB1.a13'],
      ],
    );
  /** Runs the ready-made program for a while and returns what the display shows. */
  const shown = (document: CircuitDocument, milliseconds = 600) => {
    const session = new SimulationSession(document);
    session.loadFirmware('ESP1', starter('oled'));
    let frame = session.frame();
    for (let done = 0; done < milliseconds; done += 50) {
      session.advance(Math.min(50, milliseconds - done));
      frame = session.frame();
    }
    const { oled: display } = frame.result.readings.OLED1!;
    const bytes = display?.pixels
      ? Uint8Array.from(atob(display.pixels), (c) => c.charCodeAt(0))
      : new Uint8Array(1024);
    const pixel = (x: number, y: number) =>
      ((bytes[y * 16 + (x >> 3)]! >> (7 - (x & 7))) & 1) === 1;
    return { display, pixel, frame, session };
  };

  it('holds both bus lines HIGH through its own pull-ups, and draws about 10 mA', () => {
    const result = simulate(wired());
    expect(result.sockets['ESP1.d21']!.voltage).toBeGreaterThan(3.2);
    expect(result.sockets['ESP1.d22']!.voltage).toBeGreaterThan(3.2);
    expect(result.readings.OLED1!.current).toBeCloseTo(0.01, 3);
    expect(result.diagnostics.filter((d) => d.severity !== 'info')).toEqual([]);
  });

  it('shows what the ready-made program draws with the real display library', () => {
    const { display, pixel, frame } = shown(wired());
    expect(display).toMatchObject({ lit: true });
    // The library sets a contrast of 0xCF for a display on its own charge pump.
    expect(display!.brightness).toBeCloseTo(0.45 + (0.55 * 0xcf) / 255, 6);
    // "B", the first letter, in the library's 5 × 7 letters: a full upright, three bars.
    for (let y = 0; y < 7; y++) expect(pixel(0, y), `(0, ${y})`).toBe(true);
    expect(pixel(0, 7)).toBe(false);
    expect([0, 1, 2, 3, 4, 5, 6].filter((y) => pixel(1, y))).toEqual([0, 3, 6]);
    // The line under the title, from edge to edge.
    for (const x of [0, 64, 127]) expect(pixel(x, 12), `(${x}, 12)`).toBe(true);
    expect(pixel(64, 11)).toBe(false);
    expect(pixel(64, 13)).toBe(false);
    // The square: its outline, and its filling on the even counts (the first is 0).
    expect(pixel(100, 24) && pixel(123, 24) && pixel(100, 47) && pixel(123, 47)).toBe(true);
    expect(pixel(102, 26)).toBe(false);
    expect(pixel(104, 28) && pixel(119, 43)).toBe(true);
    // The count, three times the size: "0" is 15 wide and 21 high from (0, 24).
    expect(pixel(3, 24)).toBe(true); // top bar of the nought
    expect(pixel(0, 24)).toBe(false); // its rounded corner
    expect(frame.result.diagnostics.filter((d) => d.severity !== 'info')).toEqual([]);
  });

  it('redraws each second: the count goes up and the square empties', () => {
    const { pixel } = shown(wired(), 1600);
    expect(pixel(104, 28)).toBe(false); // the count is now 1, an odd number
    expect(pixel(100, 24)).toBe(true);
  });

  it('takes the time a real bus takes: the picture arrives from the top over about 26 ms', () => {
    // 1025 bytes at 400 kHz, in nine exchanges of about 3 ms each.
    const early = shown(wired(), 12);
    expect(early.display).toMatchObject({ lit: true });
    expect(early.pixel(0, 0)).toBe(true); // the title's first letter is there
    expect(early.pixel(100, 47)).toBe(false); // the bottom of the square is still to come
    expect(shown(wired(), 40).pixel(100, 47)).toBe(true);
  });

  it('stays dark with the two bus wires swapped, or with no power', () => {
    expect(shown(wired('ESP1.3v3', 'ESP1.d21', 'ESP1.d22')).display).toMatchObject({ lit: false });
    const unpowered = circuit(
      [esp32, oled],
      [
        ['ESP1.gnd1', 'BB1.a10'],
        ['ESP1.d22', 'BB1.a12'],
        ['ESP1.d21', 'BB1.a13'],
      ],
    );
    expect(shown(unpowered).display).toMatchObject({ lit: false });
  });

  it('forgets its picture when its supply wire is pulled out, until the program draws again', () => {
    const { session } = shown(wired());
    const document = wired();
    session.update({ ...document, wires: document.wires.filter((wire) => wire.to !== 'BB1.a11') });
    session.advance(50);
    expect(session.frame().result.readings.OLED1!.oled).toMatchObject({ lit: false });
    // Power back: the panel was never switched on again, so it stays dark though the
    // program keeps sending pictures. A real display behaves the same.
    session.update(document);
    session.advance(1500);
    expect(session.frame().result.readings.OLED1!.oled).toMatchObject({ lit: false });
  });

  it('on 5 V its pull-ups put 5 V on the bus pins, and the lab warns', () => {
    const codes = simulate(wired('ESP1.vin')).diagnostics.map((d) => `${d.code} ${d.socket}`);
    expect(codes).toEqual(['pin-overvoltage d22', 'pin-overvoltage d21']);
  });
});
