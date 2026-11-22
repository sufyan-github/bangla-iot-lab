import { Type, type Static } from 'typebox';
import { Value } from 'typebox/value';

/**
 * The saved form of a circuit. This is the contract between the editor, the
 * simulator, local storage and (later) the sync API, so every change needs a
 * new `schemaVersion` and a migration.
 */
/**
 * Version history:
 * 1 — battery, resistor, LED, wires.
 * 2 — adds the UNO board, push button, potentiometer and capacitor.
 * 3 — adds the switch, diode, LDR, buzzer, motor, NPN transistor, relay and
 *     the temperature, soil-moisture and IR sensor modules.
 * 4 — adds the servo, ultrasonic distance sensor and character LCD.
 * 5 — batteries and the board may carry `at`, where the student moved them to.
 * 6 — a wire may carry `bends`, the points the student routed it through.
 * 7 — adds the ESP32 development board.
 * 8 — adds the DHT11 temperature and humidity sensor.
 * 9 — adds the LDR, rain and MQ-135 gas sensor modules, the motion sensor and
 *     the RGB LED module.
 * Each version only adds part types or optional fields, so an older document
 * is valid in a newer version apart from the number.
 */
export const CIRCUIT_SCHEMA_VERSION = 9;

const Id = Type.String({ minLength: 1, maxLength: 40, pattern: '^[A-Za-z0-9_-]+$' });
const Hole = Type.String({ pattern: '^([a-j]|tp|tn|bp|bn)[1-9][0-9]?$' });
/** A hole, or a terminal of an off-board part written "<componentId>.<pin>". */
const Endpoint = Type.String({ maxLength: 60, pattern: '^[A-Za-z0-9_-]+(\\.[a-z0-9]+)?$' });

export const LED_COLORS = ['red', 'yellow', 'green', 'blue', 'white'] as const;
export type LedColor = (typeof LED_COLORS)[number];

/**
 * Where an off-board part sits on the work surface: its top-left corner in hole
 * pitches, measured from the breadboard's origin. Absent until the part is
 * moved, and the editor then lays it out in its usual place.
 */
export const PositionSchema = Type.Object({
  x: Type.Number({ minimum: -60, maximum: 120 }),
  y: Type.Number({ minimum: -60, maximum: 120 }),
});
export type Position = Static<typeof PositionSchema>;

export const BatterySchema = Type.Object({
  id: Id,
  type: Type.Literal('battery'),
  props: Type.Object({ voltage: Type.Number({ minimum: 0.1, maximum: 24 }) }),
  at: Type.Optional(PositionSchema),
});

export const ResistorSchema = Type.Object({
  id: Id,
  type: Type.Literal('resistor'),
  pins: Type.Object({ a: Hole, b: Hole }),
  props: Type.Object({ resistance: Type.Number({ minimum: 1, maximum: 10_000_000 }) }),
});

export const LedSchema = Type.Object({
  id: Id,
  type: Type.Literal('led'),
  pins: Type.Object({ anode: Hole, cathode: Hole }),
  props: Type.Object({
    color: Type.Union([
      Type.Literal('red'),
      Type.Literal('yellow'),
      Type.Literal('green'),
      Type.Literal('blue'),
      Type.Literal('white'),
    ]),
  }),
});

/** Momentary push button: its two leads are joined only while it is held down. */
export const ButtonSchema = Type.Object({
  id: Id,
  type: Type.Literal('button'),
  pins: Type.Object({ a: Hole, b: Hole }),
  props: Type.Object({}),
});

/** Three-lead variable resistor. `position` is the knob: 0 at lead `a`, 1 at lead `b`. */
export const PotentiometerSchema = Type.Object({
  id: Id,
  type: Type.Literal('potentiometer'),
  pins: Type.Object({ a: Hole, wiper: Hole, b: Hole }),
  props: Type.Object({
    resistance: Type.Number({ minimum: 100, maximum: 1_000_000 }),
    position: Type.Number({ minimum: 0, maximum: 1 }),
  }),
});

/** Capacitor. Polarity is not modelled, so it may be placed either way round. */
export const CapacitorSchema = Type.Object({
  id: Id,
  type: Type.Literal('capacitor'),
  pins: Type.Object({ a: Hole, b: Hole }),
  /** Capacitance in farads. */
  props: Type.Object({ capacitance: Type.Number({ minimum: 1e-10, maximum: 0.01 }) }),
});

const twoLeads = Type.Object({ a: Hole, b: Hole });
/** Leads of a three-pin sensor module: supply, signal output and ground. */
const sensorLeads = Type.Object({ vcc: Hole, out: Hole, gnd: Hole });
const noProps = Type.Object({});

/** On/off switch that stays where it is put. */
export const SwitchSchema = Type.Object({
  id: Id,
  type: Type.Literal('switch'),
  pins: twoLeads,
  props: Type.Object({ closed: Type.Boolean() }),
});

/** Rectifier diode: conducts from anode to cathode only. */
export const DiodeSchema = Type.Object({
  id: Id,
  type: Type.Literal('diode'),
  pins: Type.Object({ anode: Hole, cathode: Hole }),
  props: noProps,
});

/** Light-dependent resistor. `light` runs from 0 (dark) to 1 (bright). */
export const LdrSchema = Type.Object({
  id: Id,
  type: Type.Literal('ldr'),
  pins: twoLeads,
  props: Type.Object({ light: Type.Number({ minimum: 0, maximum: 1 }) }),
});

/** Buzzer with its own oscillator: it sounds whenever enough voltage is across it. */
export const BuzzerSchema = Type.Object({
  id: Id,
  type: Type.Literal('buzzer'),
  pins: Type.Object({ pos: Hole, neg: Hole }),
  props: noProps,
});

/** Small DC motor. */
export const MotorSchema = Type.Object({
  id: Id,
  type: Type.Literal('motor'),
  pins: twoLeads,
  props: noProps,
});

/** NPN transistor. */
export const TransistorSchema = Type.Object({
  id: Id,
  type: Type.Literal('transistor'),
  pins: Type.Object({ collector: Hole, base: Hole, emitter: Hole }),
  props: noProps,
});

/** Analog temperature sensor (LM35 style: 10 mV per °C). */
export const TemperatureSensorSchema = Type.Object({
  id: Id,
  type: Type.Literal('temperature'),
  pins: sensorLeads,
  props: Type.Object({ celsius: Type.Number({ minimum: 0, maximum: 100 }) }),
});

/** Soil-moisture sensor. `moisture` runs from 0 (dry) to 1 (soaked). */
export const SoilSensorSchema = Type.Object({
  id: Id,
  type: Type.Literal('soil'),
  pins: sensorLeads,
  props: Type.Object({ moisture: Type.Number({ minimum: 0, maximum: 1 }) }),
});

/** Infrared obstacle sensor: its output goes LOW while something is in front of it. */
export const IrSensorSchema = Type.Object({
  id: Id,
  type: Type.Literal('ir'),
  pins: sensorLeads,
  props: Type.Object({ detected: Type.Boolean() }),
});

/**
 * Relay: current through the coil (coil1 to coil2) closes a separate contact
 * between `com` and `no` (normally open), so a small circuit can switch a large one.
 */
export const RelaySchema = Type.Object({
  id: Id,
  type: Type.Literal('relay'),
  pins: Type.Object({ coil1: Hole, coil2: Hole, com: Hole, no: Hole }),
  props: noProps,
});

/** Hobby servo: its horn turns to the angle set by the width of the pulses on `signal`. */
export const ServoSchema = Type.Object({
  id: Id,
  type: Type.Literal('servo'),
  pins: Type.Object({ gnd: Hole, vcc: Hole, signal: Hole }),
  props: noProps,
});

/** Ultrasonic distance sensor (HC-SR04). `distance` is how far away the obstacle is, in cm. */
export const UltrasonicSchema = Type.Object({
  id: Id,
  type: Type.Literal('ultrasonic'),
  pins: Type.Object({ vcc: Hole, trig: Hole, echo: Hole, gnd: Hole }),
  props: Type.Object({ distance: Type.Number({ minimum: 2, maximum: 400 }) }),
});

/** Pins of a 16×2 character LCD (HD44780), in the order printed on the real module. */
export const LCD_PINS = [
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
] as const;

/** 16×2 character LCD, driven through its 4-bit interface. */
export const LcdSchema = Type.Object({
  id: Id,
  type: Type.Literal('lcd'),
  pins: Type.Object(
    Object.fromEntries(LCD_PINS.map((pin) => [pin, Hole])) as Record<
      (typeof LCD_PINS)[number],
      typeof Hole
    >,
  ),
  props: noProps,
});

/**
 * DHT11 temperature and humidity sensor, as the three-pin module with its
 * pull-up resistor. It sends whole degrees (0 to 50 °C) and whole percent
 * (20 to 90 %) over its one data wire when a program asks.
 */
export const Dht11Schema = Type.Object({
  id: Id,
  type: Type.Literal('dht11'),
  pins: Type.Object({ vcc: Hole, data: Hole, gnd: Hole }),
  props: Type.Object({
    celsius: Type.Number({ minimum: 0, maximum: 50 }),
    humidity: Type.Number({ minimum: 20, maximum: 90 }),
  }),
});

/** Legs of a four-pin sensor module, in the order printed on it. */
const moduleLeads = Type.Object({ vcc: Hole, gnd: Hole, do: Hole, ao: Hole });
/** The module's trimmer: where its digital output switches, as a fraction of the supply. */
const Threshold = Type.Number({ minimum: 0.05, maximum: 0.95 });
const Fraction = Type.Number({ minimum: 0, maximum: 1 });

/**
 * LDR light sensor module: an LDR, a comparator and a trimmer on one board.
 * AO falls as the light grows; DO goes LOW once it is brighter than the trimmer
 * is set to. `light` runs from 0 (dark) to 1 (bright).
 */
export const LdrModuleSchema = Type.Object({
  id: Id,
  type: Type.Literal('ldrmodule'),
  pins: moduleLeads,
  props: Type.Object({ light: Fraction, threshold: Threshold }),
});

/**
 * Rain sensor: a board of bare tracks and its comparator module. AO falls as
 * the board gets wetter; DO goes LOW once it is wet enough. `wetness` runs from
 * 0 (dry) to 1 (covered in water).
 */
export const RainSensorSchema = Type.Object({
  id: Id,
  type: Type.Literal('rain'),
  pins: moduleLeads,
  props: Type.Object({ wetness: Fraction, threshold: Threshold }),
});

/**
 * MQ-135 gas sensor module. AO rises as the air gets worse; DO goes LOW past
 * the trimmer's setting. `gas` runs from 0 (clean air) to 1 (thick smoke).
 */
export const Mq135Schema = Type.Object({
  id: Id,
  type: Type.Literal('mq135'),
  pins: moduleLeads,
  props: Type.Object({ gas: Fraction, threshold: Threshold }),
});

/**
 * HC-SR501 motion sensor. Its output goes HIGH when something moves in front of
 * it and stays HIGH for `hold` seconds after the movement stops.
 */
export const PirSchema = Type.Object({
  id: Id,
  type: Type.Literal('pir'),
  pins: sensorLeads,
  props: Type.Object({
    motion: Type.Boolean(),
    hold: Type.Number({ minimum: 1, maximum: 300 }),
  }),
});

/** RGB LED module: a red, a green and a blue LED in one case, sharing their negative leg. */
export const RgbLedSchema = Type.Object({
  id: Id,
  type: Type.Literal('rgbled'),
  pins: Type.Object({ r: Hole, g: Hole, b: Hole, gnd: Hole }),
  props: noProps,
});

/** Arduino UNO-compatible board. It sits beside the breadboard; wires plug into its sockets. */
export const UnoSchema = Type.Object({
  id: Id,
  type: Type.Literal('uno'),
  props: Type.Object({}),
  at: Type.Optional(PositionSchema),
});

/**
 * ESP32 development board (30 pins). Like the UNO-compatible board it sits
 * beside the breadboard and wires plug into its pins. Its pins work at 3.3 V.
 */
export const Esp32Schema = Type.Object({
  id: Id,
  type: Type.Literal('esp32'),
  props: Type.Object({}),
  at: Type.Optional(PositionSchema),
});

export const ComponentSchema = Type.Union([
  BatterySchema,
  ResistorSchema,
  LedSchema,
  ButtonSchema,
  PotentiometerSchema,
  CapacitorSchema,
  SwitchSchema,
  DiodeSchema,
  LdrSchema,
  BuzzerSchema,
  MotorSchema,
  TransistorSchema,
  TemperatureSensorSchema,
  SoilSensorSchema,
  IrSensorSchema,
  RelaySchema,
  ServoSchema,
  UltrasonicSchema,
  LcdSchema,
  Dht11Schema,
  LdrModuleSchema,
  RainSensorSchema,
  Mq135Schema,
  PirSchema,
  RgbLedSchema,
  UnoSchema,
  Esp32Schema,
]);

export const MAX_WIRE_BENDS = 8;

export const WireSchema = Type.Object({
  id: Id,
  from: Endpoint,
  to: Endpoint,
  color: Type.String({ pattern: '^#[0-9a-fA-F]{6}$' }),
  /** Points the wire is routed through, in order from `from` to `to`, in hole pitches. */
  bends: Type.Optional(Type.Array(PositionSchema, { maxItems: MAX_WIRE_BENDS })),
});

export const CircuitDocumentSchema = Type.Object({
  schemaVersion: Type.Literal(CIRCUIT_SCHEMA_VERSION),
  components: Type.Array(ComponentSchema, { maxItems: 200 }),
  wires: Type.Array(WireSchema, { maxItems: 400 }),
});

export type Battery = Static<typeof BatterySchema>;
export type Resistor = Static<typeof ResistorSchema>;
export type Led = Static<typeof LedSchema>;
export type Button = Static<typeof ButtonSchema>;
export type Potentiometer = Static<typeof PotentiometerSchema>;
export type Capacitor = Static<typeof CapacitorSchema>;
export type Uno = Static<typeof UnoSchema>;
export type Esp32 = Static<typeof Esp32Schema>;
export type CircuitComponent = Static<typeof ComponentSchema>;
/** A part whose leads plug into breadboard holes. */
export type BoardPart = Extract<CircuitComponent, { pins: unknown }>;
export type ComponentType = CircuitComponent['type'];
export type Wire = Static<typeof WireSchema>;
export type CircuitDocument = Static<typeof CircuitDocumentSchema>;

export function emptyCircuit(): CircuitDocument {
  return { schemaVersion: CIRCUIT_SCHEMA_VERSION, components: [], wires: [] };
}

/** True when `value` is a structurally valid circuit document. */
export function isCircuitDocument(value: unknown): value is CircuitDocument {
  return Value.Check(CircuitDocumentSchema, value);
}

/**
 * Reads a stored document of any supported version and returns it in the
 * current version, or null when it is not a circuit this app can open.
 */
export function migrateCircuit(value: unknown): CircuitDocument | null {
  if (typeof value !== 'object' || value === null) return null;
  const version = (value as { schemaVersion?: unknown }).schemaVersion;
  const older = typeof version === 'number' && version >= 1 && version < CIRCUIT_SCHEMA_VERSION;
  const upgraded = older ? { ...value, schemaVersion: CIRCUIT_SCHEMA_VERSION } : value;
  return isCircuitDocument(upgraded) ? upgraded : null;
}

/** Terminals of the parts that sit beside the board and take wires directly. */
export const BATTERY_TERMINALS = ['pos', 'neg'] as const;

const range = (count: number) => Array.from({ length: count }, (_, i) => i);
/** UNO sockets: digital 0-13, analog A0-A5, the 5 V output and two ground sockets. */
export const UNO_TERMINALS = [
  ...range(14).map((n) => `d${n}`),
  ...range(6).map((n) => `a${n}`),
  '5v',
  'gnd',
  'gnd2',
] as const;

/** Arduino pin number of an UNO socket (A0 is 14), or null for power sockets. */
export function unoPinNumber(terminal: string): number | null {
  const match = /^([da])(\d+)$/.exec(terminal);
  if (!match) return null;
  return Number(match[2]) + (match[1] === 'a' ? 14 : 0);
}

/**
 * Pins of the 30-pin ESP32 development board, by the name printed beside each
 * (in small letters): the left row then the right row, each from the antenna
 * end. The electrical details of each pin are in the simulation package
 * (esp32-pins.ts), and a test there keeps the two lists the same.
 */
export const ESP32_TERMINALS = [
  ...['en', 'vp', 'vn', 'd34', 'd35', 'd32', 'd33', 'd25', 'd26', 'd27', 'd14', 'd12', 'd13'],
  ...['gnd1', 'vin', 'd23', 'd22', 'tx0', 'rx0', 'd21', 'd19', 'd18', 'd5', 'tx2', 'rx2', 'd4'],
  ...['d2', 'd15', 'gnd2', '3v3'],
] as const;

/** Pins whose printed name is not their GPIO number. */
const ESP32_NAMED_GPIO: Record<string, number> = {
  vp: 36,
  vn: 39,
  tx0: 1,
  rx0: 3,
  tx2: 17,
  rx2: 16,
};

/** GPIO number of an ESP32 board pin, or null for EN and the power pins. */
export function esp32GpioNumber(terminal: string): number | null {
  const named = ESP32_NAMED_GPIO[terminal];
  if (named !== undefined) return named;
  const match = /^d(\d+)$/.exec(terminal);
  return match ? Number(match[1]) : null;
}

/** The pin of an ESP32 board that carries a GPIO number, or null if none of the 30 does. */
export function esp32TerminalOfGpio(gpio: number): string | null {
  return ESP32_TERMINALS.find((terminal) => esp32GpioNumber(terminal) === gpio) ?? null;
}

/** The boards a program can be uploaded to. */
export const PROGRAMMABLE_TYPES = ['uno', 'esp32'] as const;
export type ProgrammableType = (typeof PROGRAMMABLE_TYPES)[number];
export type ProgrammableBoard = Extract<CircuitComponent, { type: ProgrammableType }>;

export function isProgrammable(component: CircuitComponent): component is ProgrammableBoard {
  return component.type === 'uno' || component.type === 'esp32';
}

/** Arduino pin number behind a socket of either board, or null for power and other pins. */
export function boardPinNumber(type: ProgrammableType, terminal: string): number | null {
  return type === 'uno' ? unoPinNumber(terminal) : esp32GpioNumber(terminal);
}

/** The socket of a board that carries an Arduino pin number, or null. */
export function boardSocketOfPin(type: ProgrammableType, pin: number): string | null {
  if (type === 'esp32') return esp32TerminalOfGpio(pin);
  if (pin < 0 || pin > 19) return null;
  return pin < 14 ? `d${pin}` : `a${pin - 14}`;
}

/** Every socket of a board. */
export function boardTerminals(type: ProgrammableType): readonly string[] {
  return type === 'uno' ? UNO_TERMINALS : ESP32_TERMINALS;
}

export function terminalEndpoint(componentId: string, pin: string): string {
  return `${componentId}.${pin}`;
}

export function parseTerminal(endpoint: string): { componentId: string; pin: string } | null {
  const dot = endpoint.indexOf('.');
  if (dot < 0) return null;
  return { componentId: endpoint.slice(0, dot), pin: endpoint.slice(dot + 1) };
}

/** Holes occupied by a component's own leads. Off-board parts occupy none. */
export function componentHoles(component: CircuitComponent): string[] {
  return 'pins' in component ? Object.values(component.pins) : [];
}
