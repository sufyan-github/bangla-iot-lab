import {
  CIRCUIT_SCHEMA_VERSION,
  type CircuitComponent,
  type CircuitDocument,
  type Wire,
} from '@banglalab/shared';
import { describe, expect, it } from 'vitest';
import { hintsFor } from './hints';
import { sketchPins } from './sketch-pins';

const part = (
  id: string,
  type: string,
  pins: Record<string, string>,
  props: Record<string, unknown> = {},
) => ({ id, type, pins, props }) as unknown as CircuitComponent;
const esp32: CircuitComponent = { id: 'ESP1', type: 'esp32', props: {} };
const uno: CircuitComponent = { id: 'UNO1', type: 'uno', props: {} };
const circuit = (components: CircuitComponent[], wires: [string, string][]): CircuitDocument => ({
  schemaVersion: CIRCUIT_SCHEMA_VERSION,
  components,
  wires: wires.map(([from, to], i): Wire => ({ id: `W${i + 1}`, from, to, color: '#000000' })),
});
const rules = (document: CircuitDocument, programs = {}) =>
  hintsFor(document, programs).map(
    (hint) => `${hint.rule} ${Object.values(hint.params).join(' ')}`,
  );

/** An LED and its resistor from D2 to ground, on the lower half of the breadboard. */
const lamp = [
  part('R1', 'resistor', { a: 'BB1.f20', b: 'BB1.f24' }, { resistance: 220 }),
  part('LED1', 'led', { anode: 'BB1.g24', cathode: 'BB1.g25' }, { color: 'red' }),
];
const lampWires: [string, string][] = [
  ['ESP1.d2', 'BB1.j20'],
  ['ESP1.gnd2', 'BB1.j25'],
];
const blink = (pin: string) => ({
  source: `const int led = ${pin};\nvoid setup() { pinMode(led, OUTPUT); }\nvoid loop() { digitalWrite(led, HIGH); delay(500); digitalWrite(led, LOW); delay(500); }`,
});

describe('hints about the wiring', () => {
  it('a circuit built right gets none', () => {
    expect(rules(circuit([esp32, ...lamp], lampWires), { ESP1: blink('2') })).toEqual([]);
  });

  it('a leg in a row of its own', () => {
    // The LED's short leg moved one row along, away from the ground wire.
    const moved = [lamp[0]!, part('LED1', 'led', { anode: 'BB1.g24', cathode: 'BB1.g26' })];
    const hints = hintsFor(circuit([esp32, ...moved], lampWires));
    expect(hints.map((h) => h.rule)).toEqual(['loose-leg', 'loose-wire']);
    expect(hints[0]).toMatchObject({ params: { part: 'LED1', leg: '−' }, places: ['BB1.g26'] });
    expect(hints[1]).toMatchObject({ places: ['BB1.j25'] });
  });

  it('a part not joined to anything, and a wire to an empty row', () => {
    expect(
      rules(
        circuit(
          [esp32, part('R2', 'resistor', { a: 'BB1.c5', b: 'BB1.c9' })],
          [['ESP1.d4', 'BB1.a30']],
        ),
      ),
    ).toEqual(['part-unconnected R2', 'loose-wire W1']);
  });

  it('a module needs its supply and ground; an output it does not use is fine', () => {
    const soil = part(
      'SOIL1',
      'soilmodule',
      { vcc: 'BB1.c10', gnd: 'BB1.c11', do: 'BB1.c12', ao: 'BB1.c13' },
      { moisture: 0.3, threshold: 0.5 },
    );
    expect(
      rules(
        circuit(
          [esp32, soil],
          [
            ['ESP1.3v3', 'BB1.a10'],
            ['ESP1.d34', 'BB1.a13'],
          ],
        ),
      ),
    ).toEqual(['loose-leg SOIL1 GND']);
  });

  it('the buzzer board that sounds on HIGH does without its + pin; the LOW one does not', () => {
    const buzzer = (trigger: string) =>
      part('BZ1', 'buzzermodule', { s: 'BB1.c10', vcc: 'BB1.c11', gnd: 'BB1.c12' }, { trigger });
    const wires: [string, string][] = [
      ['ESP1.d25', 'BB1.a10'],
      ['ESP1.gnd1', 'BB1.a12'],
    ];
    expect(rules(circuit([esp32, buzzer('high')], wires))).toEqual([]);
    expect(rules(circuit([esp32, buzzer('low')], wires))).toEqual(['loose-leg BZ1 +']);
  });
});

describe('hints about the program', () => {
  it('a pin the program drives, with nothing wired to it', () => {
    expect(rules(circuit([esp32, ...lamp], lampWires), { ESP1: blink('4') })).toEqual([
      'pin-unwired D4 ESP1',
      'pin-unused D2 ESP1',
    ]);
  });

  it('the board’s own LED needs nothing wired', () => {
    expect(rules(circuit([uno], []), { UNO1: blink('LED_BUILTIN') })).toEqual([]);
    expect(rules(circuit([esp32], []), { ESP1: blink('2') })).toEqual([]);
  });

  it('no program on the board, no hints about one', () => {
    expect(rules(circuit([esp32, ...lamp], lampWires), {})).toEqual([]);
  });

  it('stays quiet about unused pins when it cannot tell which pins the program uses', () => {
    const source =
      'int pins[] = {4, 5};\nvoid loop() { for (int i = 0; i < 2; i++) digitalWrite(pins[i], HIGH); }';
    expect(rules(circuit([esp32, ...lamp], lampWires), { ESP1: { source } })).toEqual([]);
  });

  const button = (mode: string, pulled = false) => {
    const parts = [
      esp32,
      part('SW1', 'button', { a: 'BB1.e10', b: 'BB1.f10' }),
      ...(pulled
        ? [part('R1', 'resistor', { a: 'BB1.a10', b: 'BB1.a14' }, { resistance: 10000 })]
        : []),
    ];
    const wires: [string, string][] = [
      ['ESP1.d4', 'BB1.c10'],
      ['ESP1.gnd1', 'BB1.j10'],
      ...(pulled ? ([['ESP1.3v3', 'BB1.c14']] as [string, string][]) : []),
    ];
    const source = `void setup() { pinMode(4, ${mode}); }\nvoid loop() { int down = digitalRead(4); }`;
    return rules(circuit(parts, wires), { ESP1: { source } });
  };

  it('a button read on a pin with nothing to hold it when it is up', () => {
    expect(button('INPUT')).toEqual(['input-floating D4']);
    expect(button('INPUT_PULLUP')).toEqual([]);
    expect(button('INPUT', true)).toEqual([]);
  });

  it('ESP32: a pin that can only read, asked to drive an LED', () => {
    const wires: [string, string][] = [
      ['ESP1.d34', 'BB1.j20'],
      ['ESP1.gnd2', 'BB1.j25'],
    ];
    expect(rules(circuit([esp32, ...lamp], wires), { ESP1: blink('34') })).toEqual([
      'input-only-output D34',
    ]);
  });

  it('ESP32: reading an ADC2 pin while Wi-Fi is on', () => {
    const knob = part(
      'POT1',
      'potentiometer',
      { a: 'BB1.c10', wiper: 'BB1.c11', b: 'BB1.c12' },
      { resistance: 10000, position: 0.5 },
    );
    const wires: [string, string][] = [
      ['ESP1.3v3', 'BB1.a10'],
      ['ESP1.gnd1', 'BB1.a12'],
    ];
    const reading = (pin: string, wifi: boolean) =>
      rules(circuit([esp32, knob], [...wires, [`ESP1.d${pin}`, 'BB1.a11']]), {
        ESP1: {
          source: `void setup() { ${wifi ? 'WiFi.begin("lab", "");' : ''} }\nvoid loop() { int v = analogRead(${pin}); }`,
        },
      });
    expect(reading('25', true)).toEqual(['adc2-wifi D25']);
    expect(reading('25', false)).toEqual([]);
    expect(reading('34', true)).toEqual([]);
  });
});

describe('reading pins from a program', () => {
  it('finds pins given as numbers, A0, LED_BUILTIN, #define and const names', () => {
    const pins = sketchPins(
      'uno',
      `#define BUTTON 7
const int led = LED_BUILTIN; // the board's LED
/* pinMode(9, OUTPUT); is a comment */
void setup() { pinMode(led, OUTPUT); pinMode(BUTTON, INPUT_PULLUP); }
void loop() { analogRead(A0); digitalWrite(led, digitalRead(BUTTON)); tone(8, 440); }`,
    );
    expect([...pins.uses.keys()].sort((a, b) => a - b)).toEqual([7, 8, 13, 14]);
    expect(pins.modes.get(7)).toBe('INPUT_PULLUP');
    expect(pins.mentioned.has(9)).toBe(false);
    expect(pins.unknown).toBe(0);
  });

  it('a name given a new value is not a fixed pin', () => {
    const pins = sketchPins(
      'esp32',
      'int pin = 4;\nvoid loop() { digitalWrite(pin, HIGH); pin = 5; }',
    );
    expect(pins.uses.size).toBe(0);
    expect(pins.unknown).toBe(1);
  });
});
