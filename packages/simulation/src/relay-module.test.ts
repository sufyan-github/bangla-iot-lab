import {
  CIRCUIT_SCHEMA_VERSION,
  type CircuitComponent,
  type CircuitDocument,
  type Wire,
} from '@banglalab/shared';
import { describe, expect, it } from 'vitest';
import { simulate } from './simulate';

/**
 * The kit's one-channel relay module on the ESP32 board, switching an LED lamp
 * on a battery. The figures inside the module are estimates (see library.ts).
 */
function circuit(components: CircuitComponent[], wires: [string, string][]): CircuitDocument {
  return {
    schemaVersion: CIRCUIT_SCHEMA_VERSION,
    components,
    wires: wires.map(([from, to], i): Wire => ({ id: `W${i + 1}`, from, to, color: '#000000' })),
  };
}
const esp32: CircuitComponent = { id: 'ESP1', type: 'esp32', props: {} };
const relay = (trigger: 'high' | 'low'): CircuitComponent => ({
  id: 'RLY1',
  type: 'relaymodule',
  pins: {
    vcc: 'BB1.c10',
    gnd: 'BB1.c11',
    in: 'BB1.c12',
    com: 'BB1.c14',
    no: 'BB1.c15',
    nc: 'BB1.c16',
  },
  props: { trigger },
});
/** A lamp on the contact: battery + to COM, NO through 220 Ω and an LED back to −. */
const lamp: CircuitComponent[] = [
  { id: 'BAT1', type: 'battery', props: { voltage: 6 } },
  { id: 'R1', type: 'resistor', pins: { a: 'BB1.b15', b: 'BB1.b19' }, props: { resistance: 220 } },
  {
    id: 'LED1',
    type: 'led',
    pins: { anode: 'BB1.d19', cathode: 'BB1.d20' },
    props: { color: 'red' },
  },
];
const wired = (trigger: 'high' | 'low', supply = 'ESP1.vin') =>
  circuit(
    [esp32, relay(trigger), ...lamp],
    [
      [supply, 'BB1.a10'],
      ['ESP1.gnd1', 'BB1.a11'],
      ['ESP1.d26', 'BB1.a12'],
      ['BAT1.pos', 'BB1.a14'],
      ['BAT1.neg', 'BB1.a20'],
    ],
  );
const drives = (level: 'high' | 'low') => ({
  pressed: [],
  boards: {
    ESP1: Array.from({ length: 40 }, (_, pin) => (pin === 26 ? level : ('input' as const))),
  },
});

describe('relay module', () => {
  it('with its jumper on H, a 3.3 V pin switches it on and off, and the lamp follows', () => {
    const on = simulate(wired('high'), drives('high'));
    expect(on.readings.RLY1!.activity).toBe(1);
    expect(on.readings.LED1!.led!.state).toBe('on');
    // The coil's 70 Ω on about 4.6 V: some 65 mA from VIN, more than a pin could give.
    expect(on.readings.RLY1!.current).toBeGreaterThan(0.06);
    expect(on.readings.RLY1!.current).toBeLessThan(0.08);
    // The pin itself gives only the optocoupler's couple of milliamps.
    expect(on.sockets['ESP1.d26']!.current).toBeGreaterThan(0.001);
    expect(on.sockets['ESP1.d26']!.current).toBeLessThan(0.003);
    expect(on.diagnostics.filter((d) => d.severity !== 'info')).toEqual([]);

    const off = simulate(wired('high'), drives('low'));
    expect(off.readings.RLY1!.activity).toBe(0);
    expect(off.readings.LED1!.led!.state).toBe('off');
  });

  it('with its jumper on L, LOW switches it on; a 3.3 V HIGH switches it off, with a warning', () => {
    const on = simulate(wired('low'), drives('low'));
    expect(on.readings.RLY1!.activity).toBe(1);
    expect(on.readings.LED1!.led!.state).toBe('on');
    const off = simulate(wired('low'), drives('high'));
    expect(off.readings.RLY1!.activity).toBe(0);
    expect(off.diagnostics.filter((d) => d.componentId === 'RLY1')).toMatchObject([
      { code: 'relay-low-trigger', componentId: 'RLY1' },
    ]);
  });

  it('NC is joined to COM while the relay is off', () => {
    const ncLamp = circuit(
      [esp32, relay('high'), ...lamp],
      [
        ['ESP1.vin', 'BB1.a10'],
        ['ESP1.gnd1', 'BB1.a11'],
        ['ESP1.d26', 'BB1.a12'],
        ['BAT1.pos', 'BB1.a14'],
        ['BAT1.neg', 'BB1.a20'],
        ['BB1.a16', 'BB1.a15'],
      ],
    );
    // NO and NC both lead to the lamp here: it is lit either way.
    expect(simulate(ncLamp, drives('low')).readings.LED1!.led!.state).toBe('on');
    expect(simulate(ncLamp, drives('high')).readings.LED1!.led!.state).toBe('on');
  });

  it('does not pull in on the 3.3 V pin, and the lab says why', () => {
    const result = simulate(wired('high', 'ESP1.3v3'), drives('high'));
    expect(result.readings.RLY1!.activity).toBe(0);
    expect(result.diagnostics.filter((d) => d.componentId === 'RLY1')).toMatchObject([
      { code: 'module-underpowered', componentId: 'RLY1', limit: 3.75 },
    ]);
  });
});
