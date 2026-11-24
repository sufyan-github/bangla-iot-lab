import { Type, type Static } from 'typebox';
import { Value } from 'typebox/value';
import { holeExists, holeName, isHole, parseHole, type BreadboardSize } from './breadboard';

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
 * 10 — adds the OLED display.
 * 11 — adds the L298N motor driver.
 * 12 — adds the relay module.
 * 13 — adds the 74HC logic chips.
 * 14 to 20 — add further parts, each version some.
 * 21 — the breadboard becomes a part: a circuit holds one or more, of three
 *     sizes, and each hole is named after its breadboard ("BB1.a12").
 * 22 — adds the Ra-02 LoRa radio.
 * 23 — adds the 74HC74 flip-flop chip and the clock module.
 * 24 — adds the 74HC393 counter, the 16-pin chips (74HC161 counter and CD4511
 *     decoder) and the seven-segment display.
 * Up to version 20 each version only adds part types or optional fields, so an
 * older document is valid in a newer version apart from the number. Version
 * 21 renames every hole: `migrateCircuit` puts the one fixed breadboard of an
 * older circuit in as BB1, where it was, and names its holes after it.
 */
export const CIRCUIT_SCHEMA_VERSION = 24;

const Id = Type.String({ minLength: 1, maxLength: 40, pattern: '^[A-Za-z0-9_-]+$' });
/** A breadboard hole: the breadboard's id, a dot and the hole, as "BB1.a12". */
const Hole = Type.String({ pattern: '^BB[1-9][0-9]*\\.([a-j]|tp|tn|bp|bn)[1-9][0-9]?$' });
/** A hole, or a terminal of an off-board part written "<componentId>.<pin>". */
const Endpoint = Type.String({ maxLength: 60, pattern: '^[A-Za-z0-9_-]+(\\.[a-z0-9]+)?$' });

export const LED_COLORS = ['red', 'yellow', 'green', 'blue', 'white'] as const;
export type LedColor = (typeof LED_COLORS)[number];

/**
 * Where an off-board part sits on the work surface: its top-left corner in hole
 * pitches, measured from the work surface's origin (where the first breadboard
 * sits until it is moved). Absent until the part is moved, and the editor then
 * lays it out in its usual place.
 */
export const PositionSchema = Type.Object({
  x: Type.Number({ minimum: -100, maximum: 400 }),
  y: Type.Number({ minimum: -100, maximum: 400 }),
});
export type Position = Static<typeof PositionSchema>;

/**
 * A solderless breadboard: half (400 holes), full (830) or mini (170, no power
 * rails). It sits at whole hole pitches, so the holes of every breadboard lie
 * on one grid and a part can be lined up with any of them.
 */
export const BreadboardSchema = Type.Object({
  id: Type.String({ pattern: '^BB[1-9][0-9]*$' }),
  type: Type.Literal('breadboard'),
  props: Type.Object({
    size: Type.Union([Type.Literal('half'), Type.Literal('full'), Type.Literal('mini')]),
  }),
  at: Type.Object({
    x: Type.Integer({ minimum: -100, maximum: 400 }),
    y: Type.Integer({ minimum: -100, maximum: 400 }),
  }),
});

export const WAVE_SHAPES = ['square', 'sine', 'triangle'] as const;
export type WaveShape = (typeof WAVE_SHAPES)[number];

/**
 * A source of voltage beside the breadboard, between its + and − terminals: a
 * battery; a bench power supply (`source: 'supply'`), whose voltage is turned
 * by a knob; or a function generator (`source: 'generator'`), whose output is
 * `offset` plus a wave of peak `voltage`, `hz` times a second.
 */
export const BatterySchema = Type.Object({
  id: Id,
  type: Type.Literal('battery'),
  props: Type.Object({
    voltage: Type.Number({ minimum: 0.1, maximum: 24 }),
    source: Type.Optional(Type.Union([Type.Literal('supply'), Type.Literal('generator')])),
    wave: Type.Optional(
      Type.Union([Type.Literal('square'), Type.Literal('sine'), Type.Literal('triangle')]),
    ),
    hz: Type.Optional(Type.Number({ minimum: 0.1, maximum: 100 })),
    offset: Type.Optional(Type.Number({ minimum: -12, maximum: 12 })),
  }),
  at: Type.Optional(PositionSchema),
});

/** A function generator's output at a moment, in volts. */
export function generatorVolts(
  props: { voltage: number; wave?: WaveShape; hz?: number; offset?: number },
  timeMs: number,
): number {
  const phase = ((((timeMs / 1000) * (props.hz ?? 1)) % 1) + 1) % 1;
  const shape =
    props.wave === 'sine'
      ? Math.sin(2 * Math.PI * phase)
      : props.wave === 'triangle'
        ? phase < 0.25
          ? 4 * phase
          : phase < 0.75
            ? 2 - 4 * phase
            : 4 * phase - 4
        : phase < 0.5
          ? 1
          : -1;
  return (props.offset ?? 0) + props.voltage * shape;
}

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
 * MQ-7 carbon monoxide sensor module: like the MQ-135, AO rises with the gas.
 * `co` runs from 0 (clean air) to 1 (a lot of carbon monoxide).
 */
export const Mq7Schema = Type.Object({
  id: Id,
  type: Type.Literal('mq7'),
  pins: moduleLeads,
  props: Type.Object({ co: Fraction, threshold: Threshold }),
});

/** pH sensor module: AO rises as the water gets more acid; DO goes LOW past the trimmer. */
export const PhSensorSchema = Type.Object({
  id: Id,
  type: Type.Literal('ph'),
  pins: moduleLeads,
  props: Type.Object({ ph: Type.Number({ minimum: 0, maximum: 14 }), threshold: Threshold }),
});

/** 0–25 V voltage sensor module: a 30 kΩ and 7.5 kΩ divider, S at its tap. */
export const VoltageSensorSchema = Type.Object({
  id: Id,
  type: Type.Literal('voltagesensor'),
  pins: Type.Object({ vin: Hole, gnd: Hole, s: Hole }),
  props: noProps,
});

export const ACS712_RANGES = ['5A', '20A', '30A'] as const;
export type Acs712Range = (typeof ACS712_RANGES)[number];
/**
 * ACS712 current sensor module: the current through IP+ to IP− moves OUT away
 * from half its supply. `range` is the version of the chip on the module.
 */
export const Acs712Schema = Type.Object({
  id: Id,
  type: Type.Literal('acs712'),
  pins: Type.Object({ ip1: Hole, ip2: Hole, vcc: Hole, out: Hole, gnd: Hole }),
  props: Type.Object({
    range: Type.Union([Type.Literal('5A'), Type.Literal('20A'), Type.Literal('30A')]),
  }),
});

/** TDS meter: its output rises with the dissolved solids in the water, `ppm` from 0 to 1000. */
export const TdsSensorSchema = Type.Object({
  id: Id,
  type: Type.Literal('tds'),
  pins: sensorLeads,
  props: Type.Object({ ppm: Type.Number({ minimum: 0, maximum: 1000 }) }),
});

/** Turbidity sensor: its output falls as the water gets cloudier, `ntu` from 0 to 3000. */
export const TurbiditySensorSchema = Type.Object({
  id: Id,
  type: Type.Literal('turbidity'),
  pins: sensorLeads,
  props: Type.Object({ ntu: Type.Number({ minimum: 0, maximum: 3000 }) }),
});

/**
 * 18650 lithium-ion cell in a holder. `charge` is how full it is, from 0
 * (empty) to 1 (full); `capacity` is in milliampere-hours.
 */
export const CellSchema = Type.Object({
  id: Id,
  type: Type.Literal('cell'),
  pins: Type.Object({ pos: Hole, neg: Hole }),
  props: Type.Object({
    charge: Fraction,
    capacity: Type.Number({ minimum: 500, maximum: 4000 }),
  }),
});

/** TP4056 charger module with its protection: input, cell, and the protected output. */
export const Tp4056Schema = Type.Object({
  id: Id,
  type: Type.Literal('tp4056'),
  pins: Type.Object({
    inp: Hole,
    inn: Hole,
    bp: Hole,
    bn: Hole,
    outp: Hole,
    outn: Hole,
  }),
  props: noProps,
});

/** LM2596 step-down regulator module. `volts` is the output its trimmer is set to. */
export const Lm2596Schema = Type.Object({
  id: Id,
  type: Type.Literal('lm2596'),
  pins: Type.Object({ inp: Hole, inn: Hole, outn: Hole, outp: Hole }),
  props: Type.Object({ volts: Type.Number({ minimum: 1.25, maximum: 35 }) }),
});

/** Small solar panel. `light` runs from 0 (dark) to 1 (full sun). */
export const SolarPanelSchema = Type.Object({
  id: Id,
  type: Type.Literal('solar'),
  pins: Type.Object({ pos: Hole, neg: Hole }),
  props: Type.Object({ light: Fraction }),
});

/**
 * BME280 module on I2C. What it senses is set on its sliders; `address` is the
 * one its SDO pad gives it (0x76 or 0x77).
 */
export const Bme280Schema = Type.Object({
  id: Id,
  type: Type.Literal('bme280'),
  pins: Type.Object({ vcc: Hole, gnd: Hole, scl: Hole, sda: Hole }),
  props: Type.Object({
    celsius: Type.Number({ minimum: -40, maximum: 85 }),
    humidity: Type.Number({ minimum: 0, maximum: 100 }),
    hpa: Type.Number({ minimum: 300, maximum: 1100 }),
    address: Type.Union([Type.Literal(0x76), Type.Literal(0x77)]),
  }),
});

/** INA219 module on I2C: the current through VIN+ to VIN−, and the voltage at VIN−. */
export const Ina219Schema = Type.Object({
  id: Id,
  type: Type.Literal('ina219'),
  pins: Type.Object({ vcc: Hole, gnd: Hole, scl: Hole, sda: Hole, vinm: Hole, vinp: Hole }),
  props: noProps,
});

/** DS18B20 temperature probe on a 1-Wire bus. `celsius` is what it senses. */
export const Ds18b20Schema = Type.Object({
  id: Id,
  type: Type.Literal('ds18b20'),
  pins: Type.Object({ gnd: Hole, dq: Hole, vdd: Hole }),
  props: Type.Object({ celsius: Type.Number({ minimum: -55, maximum: 125 }) }),
});

/** JSN-SR04T waterproof ultrasonic sensor: as the HC-SR04, `distance` in cm. */
export const JsnSr04tSchema = Type.Object({
  id: Id,
  type: Type.Literal('jsnsr04t'),
  pins: Type.Object({ vcc: Hole, trig: Hole, echo: Hole, gnd: Hole }),
  props: Type.Object({ distance: Type.Number({ minimum: 2, maximum: 600 }) }),
});

/** Five-channel line sensor. `black` says which of its five sensors are over the line. */
export const LineSensorSchema = Type.Object({
  id: Id,
  type: Type.Literal('linesensor'),
  pins: Type.Object({
    gnd: Hole,
    vcc: Hole,
    s1: Hole,
    s2: Hole,
    s3: Hole,
    s4: Hole,
    s5: Hole,
  }),
  props: Type.Object({
    black: Type.Array(Type.Boolean(), { minItems: 5, maxItems: 5 }),
  }),
});

/** 12 V siren. */
export const SirenSchema = Type.Object({
  id: Id,
  type: Type.Literal('siren'),
  pins: Type.Object({ pos: Hole, neg: Hole }),
  props: noProps,
});

/** NEO-6M GPS receiver on a UART. Where it is, and whether it has a fix, are set by hand. */
export const GpsSchema = Type.Object({
  id: Id,
  type: Type.Literal('gps'),
  pins: Type.Object({ vcc: Hole, rx: Hole, tx: Hole, gnd: Hole }),
  props: Type.Object({
    fix: Type.Boolean(),
    lat: Type.Number({ minimum: -90, maximum: 90 }),
    lng: Type.Number({ minimum: -180, maximum: 180 }),
    satellites: Type.Integer({ minimum: 0, maximum: 12 }),
  }),
});

/** PMS5003 particle sensor on a UART. `pm25` is the dust it counts, in µg/m³. */
export const Pms5003Schema = Type.Object({
  id: Id,
  type: Type.Literal('pms5003'),
  pins: Type.Object({ vcc: Hole, gnd: Hole, rx: Hole, tx: Hole }),
  props: Type.Object({ pm25: Type.Number({ minimum: 0, maximum: 500 }) }),
});

/** HC-05 Bluetooth module on a UART. `paired` is whether a phone is connected to it. */
export const BluetoothSchema = Type.Object({
  id: Id,
  type: Type.Literal('bluetooth'),
  pins: Type.Object({ vcc: Hole, gnd: Hole, tx: Hole, rx: Hole }),
  props: Type.Object({ paired: Type.Boolean() }),
});

/** DFPlayer Mini MP3 player on a UART. `tracks` is how many tracks its memory card holds. */
export const Mp3Schema = Type.Object({
  id: Id,
  type: Type.Literal('mp3'),
  pins: Type.Object({ vcc: Hole, rx: Hole, tx: Hole, gnd: Hole }),
  props: Type.Object({ tracks: Type.Integer({ minimum: 1, maximum: 30 }) }),
});

/** SIM800L GSM module on a UART. `signal` is its signal strength, 0 (none) to 31. */
export const GsmSchema = Type.Object({
  id: Id,
  type: Type.Literal('gsm'),
  pins: Type.Object({ vcc: Hole, rx: Hole, tx: Hole, gnd: Hole }),
  props: Type.Object({ signal: Type.Integer({ minimum: 0, maximum: 31 }) }),
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

/**
 * Clock pulse module (a 555 timer on a small board): its output is a square
 * wave, HIGH and LOW for equal times, `hz` times a second.
 */
export const ClockSchema = Type.Object({
  id: Id,
  type: Type.Literal('clock'),
  pins: sensorLeads,
  props: Type.Object({ hz: Type.Number({ minimum: 0.2, maximum: 20 }) }),
});

/** RGB LED module: a red, a green and a blue LED in one case, sharing their negative leg. */
export const RgbLedSchema = Type.Object({
  id: Id,
  type: Type.Literal('rgbled'),
  pins: Type.Object({ r: Hole, g: Hole, b: Hole, gnd: Hole }),
  props: noProps,
});

/**
 * 0.96 inch OLED display, 128 × 64 pixels (SSD1306), on the two-wire I2C bus at
 * address 0x3C. Its legs are in the order printed on the common module.
 */
export const OledSchema = Type.Object({
  id: Id,
  type: Type.Literal('oled'),
  pins: Type.Object({ gnd: Hole, vcc: Hole, scl: Hole, sda: Hole }),
  props: noProps,
});

/** Number of LEDs a WS2812B ring may have: the sizes sold as rings. */
export const LED_RING_SIZES = [8, 12, 16, 24] as const;

/**
 * A ring of WS2812B LEDs, each taking its own colour from the data stream on
 * DIN and passing the rest on through DOUT to the next ring.
 */
export const LedRingSchema = Type.Object({
  id: Id,
  type: Type.Literal('ledring'),
  pins: Type.Object({ vcc: Hole, gnd: Hole, din: Hole, dout: Hole }),
  props: Type.Object({
    leds: Type.Union([Type.Literal(8), Type.Literal(12), Type.Literal(16), Type.Literal(24)]),
  }),
});

/**
 * A 1.54-inch 240 × 240 colour display driven by an ST7789 chip over SPI, in
 * the eight-pin form: SCL and SDA are the bus's clock and data, RES resets the
 * chip, DC says whether a byte is a command or data, CS selects it, and BLK
 * switches the backlight.
 */
export const TftSchema = Type.Object({
  id: Id,
  type: Type.Literal('tft'),
  pins: Type.Object({
    gnd: Hole,
    vcc: Hole,
    scl: Hole,
    sda: Hole,
    res: Hole,
    dc: Hole,
    cs: Hole,
    blk: Hole,
  }),
  props: noProps,
});

/**
 * Ra-02 LoRa radio module (SX1278, 433 MHz) on an SPI bus, on a breakout with
 * eight legs. `km` is where it stands along a road, in kilometres: two radios
 * are as far apart as their places differ.
 */
export const LoraSchema = Type.Object({
  id: Id,
  type: Type.Literal('lora'),
  pins: Type.Object({
    gnd: Hole,
    vcc: Hole,
    rst: Hole,
    dio0: Hole,
    nss: Hole,
    mosi: Hole,
    miso: Hole,
    sck: Hole,
  }),
  props: Type.Object({ km: Type.Number({ minimum: 0, maximum: 20 }) }),
});

/**
 * One-channel relay module: a 5 V relay with the transistor and optocoupler
 * that let a board pin switch it, and a jumper that chooses whether IN must be
 * HIGH (`high`) or LOW (`low`) to switch the relay on. Its contact joins COM to
 * NO while on and COM to NC while off.
 */
export const RelayModuleSchema = Type.Object({
  id: Id,
  type: Type.Literal('relaymodule'),
  pins: Type.Object({ vcc: Hole, gnd: Hole, in: Hole, com: Hole, no: Hole, nc: Hole }),
  props: Type.Object({ trigger: Type.Union([Type.Literal('high'), Type.Literal('low')]) }),
});

/** The 74HC chips made of gates, each with fourteen pins. */
export const GATE_CHIPS = ['74HC00', '74HC02', '74HC04', '74HC08', '74HC32', '74HC86'] as const;
export type GateChip = (typeof GATE_CHIPS)[number];
/** The logic chips with fourteen pins the lab has: the gate chips, a flip-flop and a counter. */
export const LOGIC_CHIPS = [...GATE_CHIPS, '74HC74', '74HC393'] as const;
export type LogicChip = (typeof LOGIC_CHIPS)[number];
/** The logic chips with sixteen pins: a counter and a seven-segment decoder. */
export const LOGIC16_CHIPS = ['74HC161', 'CD4511'] as const;
export type Logic16Chip = (typeof LOGIC16_CHIPS)[number];
export type AnyLogicChip = LogicChip | Logic16Chip;

/** True for a chip made of gates, which the diagram draws as gate symbols. */
export function isGateChip(chip: AnyLogicChip): chip is GateChip {
  return (GATE_CHIPS as readonly string[]).includes(chip);
}
export type GateKind = 'NAND' | 'NOR' | 'NOT' | 'AND' | 'OR' | 'XOR';

/** One gate of a chip: its input pins and its output pin, by pin number. */
export interface Gate {
  inputs: readonly number[];
  output: number;
}

const QUAD: readonly Gate[] = [
  { inputs: [1, 2], output: 3 },
  { inputs: [4, 5], output: 6 },
  { inputs: [9, 10], output: 8 },
  { inputs: [12, 13], output: 11 },
];

/**
 * What is inside each chip, from the standard 74xx pinouts. Pin 7 is ground
 * and pin 14 the supply on all of them. The 74HC02 is the odd one: its outputs
 * come first in each gate.
 */
export const LOGIC_CHIP_GATES: Record<GateChip, { kind: GateKind; gates: readonly Gate[] }> = {
  '74HC00': { kind: 'NAND', gates: QUAD },
  '74HC08': { kind: 'AND', gates: QUAD },
  '74HC32': { kind: 'OR', gates: QUAD },
  '74HC86': { kind: 'XOR', gates: QUAD },
  '74HC02': {
    kind: 'NOR',
    gates: [
      { inputs: [2, 3], output: 1 },
      { inputs: [5, 6], output: 4 },
      { inputs: [8, 9], output: 10 },
      { inputs: [11, 12], output: 13 },
    ],
  },
  '74HC04': {
    kind: 'NOT',
    gates: [
      { inputs: [1], output: 2 },
      { inputs: [3], output: 4 },
      { inputs: [5], output: 6 },
      { inputs: [9], output: 8 },
      { inputs: [11], output: 10 },
      { inputs: [13], output: 12 },
    ],
  },
};

/** What a gate of each kind gives for its inputs. */
export function gateOutput(kind: GateKind, inputs: readonly boolean[]): boolean {
  switch (kind) {
    case 'NOT':
      return !inputs[0];
    case 'AND':
      return inputs.every(Boolean);
    case 'NAND':
      return !inputs.every(Boolean);
    case 'OR':
      return inputs.some(Boolean);
    case 'NOR':
      return !inputs.some(Boolean);
    case 'XOR':
      return inputs.filter(Boolean).length % 2 === 1;
  }
}

const DIP14_PINS = Array.from({ length: 14 }, (_, i) => `p${i + 1}`);

/**
 * A 74HC logic chip in a 14-pin package, across the centre gap of the
 * breadboard: pins 1 to 7 along row f from the left, 8 to 14 back along row e.
 */
export const LogicSchema = Type.Object({
  id: Id,
  type: Type.Literal('logic'),
  pins: Type.Object(
    Object.fromEntries(DIP14_PINS.map((pin) => [pin, Hole])) as Record<string, typeof Hole>,
  ),
  props: Type.Object({
    chip: Type.Union([
      Type.Literal('74HC00'),
      Type.Literal('74HC02'),
      Type.Literal('74HC04'),
      Type.Literal('74HC08'),
      Type.Literal('74HC32'),
      Type.Literal('74HC86'),
      Type.Literal('74HC74'),
      Type.Literal('74HC393'),
    ]),
  }),
});

const DIP16_PINS = Array.from({ length: 16 }, (_, i) => `p${i + 1}`);

/**
 * A logic chip in a 16-pin package, across the centre gap like the 14-pin
 * ones: pins 1 to 8 along row f from the left, 9 to 16 back along row e.
 */
export const Logic16Schema = Type.Object({
  id: Id,
  type: Type.Literal('logic16'),
  pins: Type.Object(
    Object.fromEntries(DIP16_PINS.map((pin) => [pin, Hole])) as Record<string, typeof Hole>,
  ),
  props: Type.Object({
    chip: Type.Union([Type.Literal('74HC161'), Type.Literal('CD4511')]),
  }),
});

/** A logic chip of either size. */
export type LogicChipPart = Static<typeof LogicSchema> | Static<typeof Logic16Schema>;
export function isLogicChipPart(component: { type: string }): component is LogicChipPart {
  return component.type === 'logic' || component.type === 'logic16';
}

export const SEVEN_SEGMENT_KINDS = ['cathode', 'anode'] as const;
export type SevenSegmentKind = (typeof SEVEN_SEGMENT_KINDS)[number];
/** The display's segments, in the order its legs are listed. */
export const SEVEN_SEGMENTS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'dp'] as const;
export type SevenSegment = (typeof SEVEN_SEGMENTS)[number];

/**
 * A single-digit seven-segment display (0.56 inch, red): eight LEDs, the
 * segments a to g and the decimal point, sharing one leg. In a common-cathode
 * display the shared leg is the LEDs' negative, in a common-anode one their
 * positive. It stands across the centre gap, its two rows of five legs 0.6
 * inch apart, in rows d and h: the bottom row is e, d, COM, c, DP from the
 * left, the top row g, f, COM, a, b.
 */
export const SevenSegmentSchema = Type.Object({
  id: Id,
  type: Type.Literal('sevenseg'),
  pins: Type.Object({
    e: Hole,
    d: Hole,
    com: Hole,
    c: Hole,
    dp: Hole,
    b: Hole,
    a: Hole,
    com2: Hole,
    f: Hole,
    g: Hole,
  }),
  props: Type.Object({
    kind: Type.Union([Type.Literal('cathode'), Type.Literal('anode')]),
  }),
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

/**
 * Terminals of the L298N motor driver module: the three power screws, the six
 * control pins and the four motor screws, by the names printed beside them
 * (the supply screw is marked 12V on the module).
 */
export const L298N_TERMINALS = [
  ...['vs', 'gnd', '5v'],
  ...['ena', 'in1', 'in2', 'in3', 'in4', 'enb'],
  ...['out1', 'out2', 'out3', 'out4'],
] as const;

/**
 * L298N dual motor driver module. Like a battery it sits beside the breadboard
 * and takes wires at its terminals. `enaJumper` and `enbJumper` say whether the
 * two small jumpers that keep each motor channel switched on are still in
 * place, as the module is sold.
 */
export const L298nSchema = Type.Object({
  id: Id,
  type: Type.Literal('l298n'),
  props: Type.Object({ enaJumper: Type.Boolean(), enbJumper: Type.Boolean() }),
  at: Type.Optional(PositionSchema),
});

export const ComponentSchema = Type.Union([
  BreadboardSchema,
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
  Mq7Schema,
  PhSensorSchema,
  VoltageSensorSchema,
  Acs712Schema,
  TdsSensorSchema,
  TurbiditySensorSchema,
  CellSchema,
  Tp4056Schema,
  Lm2596Schema,
  SolarPanelSchema,
  Bme280Schema,
  Ina219Schema,
  Ds18b20Schema,
  JsnSr04tSchema,
  LineSensorSchema,
  SirenSchema,
  GpsSchema,
  Pms5003Schema,
  BluetoothSchema,
  Mp3Schema,
  GsmSchema,
  PirSchema,
  ClockSchema,
  RgbLedSchema,
  OledSchema,
  LedRingSchema,
  TftSchema,
  LoraSchema,
  RelayModuleSchema,
  LogicSchema,
  Logic16Schema,
  SevenSegmentSchema,
  UnoSchema,
  Esp32Schema,
  L298nSchema,
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

export type Breadboard = Static<typeof BreadboardSchema>;
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
  return { schemaVersion: CIRCUIT_SCHEMA_VERSION, components: [FIRST_BREADBOARD], wires: [] };
}

/** The breadboards of a circuit, by id, with their sizes. */
export function breadboardSizes(circuit: CircuitDocument): Map<string, BreadboardSize> {
  const sizes = new Map<string, BreadboardSize>();
  for (const component of circuit.components) {
    if (component.type === 'breadboard') sizes.set(component.id, component.props.size);
  }
  return sizes;
}

/** True when a hole is on one of the circuit's breadboards, which is big enough to have it. */
export function holeInCircuit(sizes: ReadonlyMap<string, BreadboardSize>, id: string): boolean {
  const hole = parseHole(id);
  const size = hole ? sizes.get(hole.board) : undefined;
  return hole !== null && size !== undefined && holeExists(hole, size);
}

/** True when `value` is a structurally valid circuit document. */
export function isCircuitDocument(value: unknown): value is CircuitDocument {
  if (!Value.Check(CircuitDocumentSchema, value)) return false;
  // The pattern for a hole's name also fits holes a breadboard does not have (column 34
  // of a half board, the gaps in a rail) and breadboards that are not there. A leg or
  // wire in one of those would connect to nothing.
  const sizes = breadboardSizes(value);
  const inCircuit = (id: string) => holeInCircuit(sizes, id);
  return (
    value.components.every((component) => componentHoles(component).every(inCircuit)) &&
    value.wires.every((wire) =>
      [wire.from, wire.to].every((end) => (isHole(end) ? inCircuit(end) : end.includes('.'))),
    )
  );
}

/** The fixed breadboard of circuits before version 21: half size, at the work surface's origin. */
export const FIRST_BREADBOARD: Breadboard = {
  id: 'BB1',
  type: 'breadboard',
  props: { size: 'half' },
  at: { x: 0, y: 0 },
};

/**
 * Version 21 names every hole after its breadboard. An older circuit had one
 * fixed half-size board: it becomes BB1, where it was, and "a12" becomes
 * "BB1.a12" in every leg and wire.
 */
function nameHolesAfterFirstBoard(value: Record<string, unknown>): Record<string, unknown> {
  const oldHole = /^([a-j]|tp|tn|bp|bn)([1-9][0-9]?)$/;
  const rename = (end: unknown) => {
    const match = typeof end === 'string' ? oldHole.exec(end) : null;
    return match ? holeName('BB1', match[1] as 'a', Number(match[2])) : end;
  };
  const { components, wires } = value;
  // Not a circuit at all: left as it is, to be refused.
  if (!Array.isArray(components) || !Array.isArray(wires)) return value;
  return {
    ...value,
    components: [
      FIRST_BREADBOARD,
      ...components.map((component: unknown) => {
        if (typeof component !== 'object' || component === null) return component;
        const pins = (component as { pins?: unknown }).pins;
        if (typeof pins !== 'object' || pins === null) return component;
        return {
          ...component,
          pins: Object.fromEntries(Object.entries(pins).map(([pin, hole]) => [pin, rename(hole)])),
        };
      }),
    ],
    wires: wires.map((wire: unknown) =>
      typeof wire === 'object' && wire !== null
        ? {
            ...wire,
            from: rename((wire as { from?: unknown }).from),
            to: rename((wire as { to?: unknown }).to),
          }
        : wire,
    ),
  };
}

/**
 * Reads a stored document of any supported version and returns it in the
 * current version, or null when it is not a circuit this app can open.
 */
export function migrateCircuit(value: unknown): CircuitDocument | null {
  if (typeof value !== 'object' || value === null) return null;
  const version = (value as { schemaVersion?: unknown }).schemaVersion;
  const older = typeof version === 'number' && version >= 1 && version < CIRCUIT_SCHEMA_VERSION;
  if (!older) return isCircuitDocument(value) ? value : null;
  const renamed =
    (version as number) < 21 ? nameHolesAfterFirstBoard(value as Record<string, unknown>) : value;
  const upgraded = { ...renamed, schemaVersion: CIRCUIT_SCHEMA_VERSION };
  return isCircuitDocument(upgraded) ? upgraded : null;
}

/**
 * The circuit without its breadboards. A breadboard has no electrical part of
 * its own: the strips it joins follow from the names of the holes.
 */
export function withoutBreadboards(circuit: CircuitDocument): CircuitDocument {
  if (!circuit.components.some((c) => c.type === 'breadboard')) return circuit;
  return { ...circuit, components: circuit.components.filter((c) => c.type !== 'breadboard') };
}

/** The parts of a circuit that are not breadboards. */
export function partsOf(circuit: CircuitDocument): CircuitComponent[] {
  return circuit.components.filter((c) => c.type !== 'breadboard');
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

/** Terminals a wire can plug into on a part that sits beside the breadboard; none for other parts. */
export function terminalsOf(component: CircuitComponent): readonly string[] {
  if (component.type === 'battery') return BATTERY_TERMINALS;
  if (component.type === 'l298n') return L298N_TERMINALS;
  if (isProgrammable(component)) return boardTerminals(component.type);
  return [];
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
