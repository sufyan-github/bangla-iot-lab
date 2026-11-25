import type { ProgrammableType } from '@banglalab/shared';

/**
 * What a board's program does with its pins, read from its text (D-116). It is
 * pattern matching, not a compiler: a pin given as a plain number, as `A0`, as
 * `LED_BUILTIN`, or by a name set once with `#define` or `const int`, is found.
 * A pin worked out any other way is counted as unknown, so the hints that
 * depend on it stay quiet rather than guess.
 */

export type PinUse = 'output' | 'input' | 'analog-in' | 'pwm' | 'servo' | 'tone';
export type PinMode = 'OUTPUT' | 'INPUT' | 'INPUT_PULLUP' | 'INPUT_PULLDOWN';

export interface SketchPins {
  /** Each pin the program reads or drives, and how. */
  uses: Map<number, Set<PinUse>>;
  /** The mode `pinMode` set each pin to, where it was found. */
  modes: Map<number, PinMode>;
  /** Every pin number the program names anywhere, however it uses it. */
  mentioned: Set<number>;
  /** Pin arguments it could not work out. */
  unknown: number;
  wifi: boolean;
  /** Buses the program uses, whose pins a library drives without naming them. */
  buses: Set<'i2c' | 'spi' | 'serial2'>;
}

/** The program with its comments and the insides of its strings and characters removed. */
export function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/"(?:\\.|[^"\\\n])*"/g, '""')
    .replace(/'(?:\\.|[^'\\\n])*'/g, "''");
}

/** UNO-compatible board: A0 to A5 are pins 14 to 19. Its LED is on pin 13; an ESP32 board's on GPIO 2. */
function builtIn(board: ProgrammableType, name: string): number | null {
  if (name === 'LED_BUILTIN') return board === 'uno' ? 13 : 2;
  const analog = /^A([0-5])$/.exec(name);
  if (analog && board === 'uno') return 14 + Number(analog[1]);
  return null;
}

const CALLS: Record<string, PinUse | 'mode' | null> = {
  pinMode: 'mode',
  digitalWrite: 'output',
  digitalRead: 'input',
  analogRead: 'analog-in',
  analogWrite: 'pwm',
  ledcAttachPin: 'pwm',
  ledcAttach: 'pwm',
  tone: 'tone',
  noTone: 'tone',
};

export function sketchPins(board: ProgrammableType, source: string): SketchPins {
  const code = stripComments(source);
  // Names given a number once: `#define LED 13`, `const int led = 13;`, `int led = 13;`.
  const constants = new Map<string, number>();
  const assigned = new Map<string, number>();
  for (const match of code.matchAll(/#define\s+([A-Za-z_]\w*)\s+(\w+)/g)) {
    const value = /^\d+$/.test(match[2]!) ? Number(match[2]) : builtIn(board, match[2]!);
    if (value !== null) constants.set(match[1]!, value);
  }
  for (const match of code.matchAll(
    /\b(?:const\s+|constexpr\s+|static\s+)*(?:unsigned\s+)?(?:int|byte|uint8_t|int8_t|short|long|gpio_num_t)\s+([A-Za-z_]\w*)\s*=\s*(\w+)\s*;/g,
  )) {
    const value = /^\d+$/.test(match[2]!) ? Number(match[2]) : builtIn(board, match[2]!);
    if (value !== null) constants.set(match[1]!, value);
  }
  // A name given a new value later is not a fixed pin.
  for (const match of code.matchAll(/(?<![\w.])([A-Za-z_]\w*)\s*(?:=(?!=)|\+\+|--|\+=|-=)/g)) {
    assigned.set(match[1]!, (assigned.get(match[1]!) ?? 0) + 1);
  }
  for (const [name] of constants) {
    if ((assigned.get(name) ?? 0) > 1) constants.delete(name);
  }

  const resolve = (expression: string): number | null => {
    const text = expression.trim();
    if (/^\d+$/.test(text)) return Number(text);
    if (constants.has(text)) return constants.get(text)!;
    return builtIn(board, text);
  };

  const pins: SketchPins = {
    uses: new Map(),
    modes: new Map(),
    mentioned: new Set(),
    unknown: 0,
    wifi: /\bWiFi\s*\.\s*(?:begin|softAP)\s*\(/.test(code),
    buses: new Set(),
  };
  if (
    /\bWire\s*\.\s*begin\b|#include\s*<(?:Wire|Adafruit_SSD1306|Adafruit_BME280|Adafruit_INA219|LiquidCrystal_I2C)\.h>/.test(
      source,
    )
  )
    pins.buses.add('i2c');
  if (/#include\s*<(?:SPI|LoRa|Adafruit_ST7789|TFT_eSPI|MFRC522)\.h>/.test(source))
    pins.buses.add('spi');
  if (/\bSerial2\b/.test(code)) pins.buses.add('serial2');

  const use = (pin: number, how: PinUse) => {
    if (!pins.uses.has(pin)) pins.uses.set(pin, new Set());
    pins.uses.get(pin)!.add(how);
    pins.mentioned.add(pin);
  };
  for (const match of code.matchAll(/\b(\w+)\s*\(\s*([^,()]+?)\s*(?:,\s*([A-Z_]+))?\s*[,)]/g)) {
    const kind = CALLS[match[1]!];
    if (!kind) continue;
    const pin = resolve(match[2]!);
    if (pin === null) {
      pins.unknown += 1;
      continue;
    }
    if (kind === 'mode') {
      const mode = match[3] as PinMode | undefined;
      if (mode && ['OUTPUT', 'INPUT', 'INPUT_PULLUP', 'INPUT_PULLDOWN'].includes(mode)) {
        pins.modes.set(pin, mode);
      }
      pins.mentioned.add(pin);
    } else {
      use(pin, kind);
    }
  }
  for (const match of code.matchAll(/\.\s*attach\s*\(\s*([^,()]+?)\s*[,)]/g)) {
    const pin = resolve(match[1]!);
    if (pin === null) pins.unknown += 1;
    else use(pin, 'servo');
  }
  // Anything else that names a pin: a library given it in brackets, `DHT dht(4, DHT11)`.
  for (const [name, value] of constants) {
    const uses = code.match(new RegExp(`\\b${name}\\b`, 'g'))?.length ?? 0;
    if (uses > 1) pins.mentioned.add(value);
  }
  for (const match of code.matchAll(/[(,]\s*(\d{1,2})\s*(?=[,)])/g)) {
    pins.mentioned.add(Number(match[1]));
  }
  return pins;
}
