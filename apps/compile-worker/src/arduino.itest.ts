import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { UnoBoard } from '@banglalab/board-emulators';
import { CIRCUIT_SCHEMA_VERSION, type CircuitDocument } from '@banglalab/shared';
import { SimulationSession } from '@banglalab/simulation';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from './config';
import { buildServer } from './server';

/**
 * Arduino sketches: compiled in the sandbox against the pinned Arduino core,
 * then executed on the emulated UNO. Needs avr-gcc, bubblewrap and the core
 * (`pnpm --filter @banglalab/compile-worker core:fetch`).
 */
const startersDir = new URL(
  '../../../packages/board-emulators/fixtures/starters/',
  import.meta.url,
);
const starter = (name: string) => readFile(new URL(name, startersDir), 'utf8');

let cacheDir: string;
let server: Awaited<ReturnType<typeof buildServer>>;

beforeAll(async () => {
  cacheDir = await mkdtemp(path.join(tmpdir(), 'banglalab-cache-'));
  server = await buildServer({ ...loadConfig({ LOG_LEVEL: 'silent' }), cacheDir });
}, 120_000);
afterAll(async () => {
  await server.close();
  await rm(cacheDir, { recursive: true, force: true });
});

async function compile(source: string) {
  const response = await server.inject({
    method: 'POST',
    url: '/compile',
    payload: { board: 'uno', language: 'arduino', source },
  });
  return response.json();
}
async function boardRunning(source: string): Promise<UnoBoard> {
  const result = await compile(source);
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
  return new UnoBoard(result.hex);
}
/** Fraction of the time a pin spends driven high over a span of simulated time. */
function dutyCycle(board: UnoBoard, pin: number, milliseconds: number): number {
  let highSince: number | null = board.pinDrive(pin) === 'high' ? board.timeMs : null;
  let highTime = 0;
  const stop = board.onPinChange((changed, drive, timeMs) => {
    if (changed !== pin) return;
    if (drive === 'high' && highSince === null) highSince = timeMs;
    else if (drive !== 'high' && highSince !== null) {
      highTime += timeMs - highSince;
      highSince = null;
    }
  });
  const start = board.timeMs;
  board.runFor(milliseconds);
  stop();
  if (highSince !== null) highTime += board.timeMs - Math.max(highSince, start);
  return highTime / milliseconds;
}

describe('Arduino sketches on the emulated UNO', () => {
  it('a sketch in several files: a header, a C file and a second tab', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/compile',
      payload: {
        board: 'uno',
        language: 'arduino',
        source:
          '#include "pins.h"\nvoid setup() { pinMode(LED, OUTPUT); }\nvoid loop() { blinkOnce(half(1000)); }\n',
        files: [
          {
            name: 'pins.h',
            content: '#pragma once\n#define LED 13\nextern "C" int half(int x);\n',
          },
          { name: 'half.c', content: 'int half(int x) { return x / 2; }\n' },
          {
            name: 'blink.ino',
            content:
              'void blinkOnce(int ms) {\n  digitalWrite(LED, HIGH);\n  delay(ms);\n  digitalWrite(LED, LOW);\n  delay(ms);\n}\n',
          },
        ],
      },
    });
    const result = response.json();
    expect(result.ok, JSON.stringify(result.diagnostics)).toBe(true);
    const board = new UnoBoard(result.hex);
    // HIGH for half of each second.
    expect(dutyCycle(board, 13, 3000)).toBeCloseTo(0.5, 1);
  });

  it('Blink: delay() and digitalWrite() keep real time', async () => {
    const board = await boardRunning(await starter('blink.ino'));
    const changes: { drive: string; timeMs: number }[] = [];
    board.onPinChange((pin, drive, timeMs) => pin === 13 && changes.push({ drive, timeMs }));
    board.runFor(2200);
    const highs = changes.filter((c) => c.drive === 'high').map((c) => c.timeMs);
    expect(highs.length).toBeGreaterThanOrEqual(2);
    expect(highs[1]! - highs[0]!).toBeCloseTo(1000, -1); // on 500 ms + off 500 ms, within 5 ms
  });

  it('Button: INPUT_PULLUP and digitalRead() follow the input level', async () => {
    const board = await boardRunning(await starter('button.ino'));
    board.setDigitalInput(2, true);
    board.runFor(20);
    expect(board.pinDrive(2)).toBe('pullup');
    expect(board.digitalRead(13)).toBe(false);
    board.setDigitalInput(2, false); // pressed: pin pulled to ground
    board.runFor(5);
    expect(board.digitalRead(13)).toBe(true);
    board.setDigitalInput(2, true);
    board.runFor(5);
    expect(board.digitalRead(13)).toBe(false);
  });

  it('analogWrite(): PWM duty cycle matches the requested value', async () => {
    for (const [pin, value] of [
      [9, 64], // timer 1
      [6, 128], // timer 0
      [3, 191], // timer 2
    ] as const) {
      const board = await boardRunning(
        `void setup() { pinMode(${pin}, OUTPUT); analogWrite(${pin}, ${value}); }\nvoid loop() {}\n`,
      );
      board.runFor(20);
      expect(dutyCycle(board, pin, 100), `pin ${pin}`).toBeCloseTo(value / 255, 1);
    }
  });

  it('Knob: analogRead() converts the input voltage and Serial prints it', async () => {
    const board = await boardRunning(await starter('knob.ino'));
    let output = '';
    board.onSerial((text) => (output += text));
    board.setAnalogInput(0, 2.5);
    board.runFor(350);
    const readings = output.trim().split(/\r?\n/).map(Number);
    expect(readings.length).toBeGreaterThanOrEqual(2);
    for (const reading of readings) expect(Math.abs(reading - 511.5)).toBeLessThanOrEqual(1);
    // The LED pin follows the knob: 511 / 4 = 127 of 255.
    expect(dutyCycle(board, 9, 100)).toBeCloseTo(127 / 255, 1);
  });

  it('accepts functions that are used before they are defined', async () => {
    const result = await compile(
      'void setup() { flash(3); }\nvoid loop() {}\nvoid flash(int times) { for (int i = 0; i < times; i++) digitalWrite(13, HIGH); }\n',
    );
    expect(result.ok).toBe(true);
  });

  it('builds a sketch that keeps a web page with JavaScript in a raw string', async () => {
    // The page's JavaScript functions must not be mistaken for functions of the sketch.
    const board = await boardRunning(`
const char PAGE[] PROGMEM = R"HTML(
<script>
async function load() { const r = await fetch("/data"); }
function show(x) { return x; }
</script>
)HTML";
enum Level { LOW_LEVEL, HIGH_LEVEL };
void setup() { Serial.begin(9600); report(level()); }
void loop() { }
Level level() { return HIGH_LEVEL; }
void report(Level value) { Serial.println(value == HIGH_LEVEL ? "page ok" : "bad"); }
`);
    let text = '';
    board.onSerial((chunk) => (text += chunk));
    board.runFor(50);
    expect(text).toContain('page ok');
  });

  it('reports errors on the line the student wrote', async () => {
    const result = await compile(
      'void setup() {\n  pinMode(13, OUTPUT);\n  digitalWrit(13, HIGH);\n}\nvoid loop() {}\n',
    );
    expect(result).toMatchObject({ ok: false, reason: 'compile-error' });
    expect(result.diagnostics[0]).toMatchObject({ line: 3, severity: 'error' });
    expect(result.diagnostics[0].message).toContain('digitalWrit');

    const missingLoop = await compile('void setup() {}\n');
    expect(missingLoop.diagnostics[0].message).toBe("undefined reference to 'loop'");
  });

  it('builds sketches that use the Servo and LiquidCrystal libraries', async () => {
    const servo = await boardRunning(
      '#include <Servo.h>\nServo s;\nvoid setup() { s.attach(9); s.write(90); }\nvoid loop() {}\n',
    );
    // 90° is a 1472 µs pulse every 20 ms: about 7.4 % of the time high.
    servo.runFor(50);
    expect(dutyCycle(servo, 9, 200)).toBeCloseTo(1472 / 20000, 2);

    const lcd = await compile(
      '#include <LiquidCrystal.h>\nLiquidCrystal lcd(12, 11, 5, 4, 3, 2);\nvoid setup() { lcd.begin(16, 2); lcd.print("hi"); }\nvoid loop() {}\n',
    );
    expect(lcd.ok).toBe(true);

    const unknown = await compile('#include <NoSuchLibrary.h>\nvoid setup() {}\nvoid loop() {}\n');
    expect(unknown).toMatchObject({ ok: false, reason: 'compile-error' });
    expect(unknown.diagnostics[0]).toMatchObject({ line: 1 });
    expect(unknown.diagnostics[0].message).toContain('NoSuchLibrary.h');
  });

  it('drives an SSD1306 OLED over I2C with Wire and Adafruit_SSD1306', async () => {
    const result = await compile(`#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
Adafruit_SSD1306 display(128, 64, &Wire, -1);
void setup() {
  Serial.begin(9600);
  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) { Serial.println("no display"); return; }
  display.clearDisplay();
  display.fillRect(0, 0, 10, 10, SSD1306_WHITE);
  display.display();
  Serial.println("drawn");
}
void loop() {}
`);
    expect(result.ok).toBe(true);
    const board = new UnoBoard(result.hex);
    const sent: { address: number; bytes: number }[] = [];
    board.onI2c((transfer) => {
      if (transfer.address !== 0x3c) return { status: 2 };
      sent.push({ address: transfer.address, bytes: transfer.write.length });
      return { status: 0, read: new Uint8Array(transfer.readLength) };
    });
    let serial = '';
    board.onSerial((text) => (serial += text));
    board.runFor(1500);
    expect(serial).toContain('drawn');
    // Commands, then the whole picture: 128 × 64 dots are 1024 bytes, sent in pieces.
    const total = sent.reduce((sum, s) => sum + s.bytes, 0);
    expect(total).toBeGreaterThan(1024);
    // Without a device answering, begin() still works (the display is write-only),
    // but nothing is sent anywhere.
  }, 120_000);

  it('lights the lab’s OLED part on A4 and A5, through the circuit', async () => {
    const result = await compile(`#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
Adafruit_SSD1306 display(128, 64, &Wire, -1);
void setup() {
  display.begin(SSD1306_SWITCHCAPVCC, 0x3C);
  display.clearDisplay();
  display.fillRect(0, 0, 10, 10, SSD1306_WHITE);
  display.display();
}
void loop() {}
`);
    expect(result.ok).toBe(true);
    const document: CircuitDocument = {
      schemaVersion: CIRCUIT_SCHEMA_VERSION,
      components: [
        { id: 'UNO1', type: 'uno', props: {} },
        {
          id: 'OLED1',
          type: 'oled',
          pins: { gnd: 'BB1.c10', vcc: 'BB1.c11', scl: 'BB1.c12', sda: 'BB1.c13' },
          props: {},
        } as unknown as CircuitDocument['components'][number],
      ],
      wires: (
        [
          ['UNO1.gnd', 'BB1.a10'],
          ['UNO1.5v', 'BB1.a11'],
          ['UNO1.a5', 'BB1.a12'],
          ['UNO1.a4', 'BB1.a13'],
        ] as const
      ).map(([from, to], i) => ({ id: `W${i + 1}`, from, to, color: '#000000' })),
    };
    const session = new SimulationSession(document);
    session.loadFirmware('UNO1', result.hex);
    let frame = session.frame();
    for (let t = 0; t < 1500; t += 50) {
      session.advance(50);
      frame = session.frame();
    }
    const display = frame.result.readings.OLED1!.oled!;
    expect(display.lit).toBe(true);
    const bytes = Uint8Array.from(atob(display.pixels!), (c) => c.charCodeAt(0));
    const pixel = (x: number, y: number) =>
      ((bytes[y * 16 + (x >> 3)]! >> (7 - (x & 7))) & 1) === 1;
    // The 10 × 10 square in the top left, and nothing beside it.
    expect(pixel(0, 0) && pixel(9, 9)).toBe(true);
    expect(pixel(10, 0) || pixel(0, 10)).toBe(false);
  }, 120_000);

  it('draws on the lab’s ST7789 colour display over SPI', async () => {
    const result = await compile(`#include <Adafruit_GFX.h>
#include <Adafruit_ST7789.h>
#include <SPI.h>
Adafruit_ST7789 tft(10, 9, 8);
void setup() {
  tft.init(240, 240);
  tft.fillScreen(ST77XX_BLACK);
  tft.fillRect(40, 100, 40, 40, ST77XX_RED);
}
void loop() {}
`);
    expect(result.ok).toBe(true);
    const document: CircuitDocument = {
      schemaVersion: CIRCUIT_SCHEMA_VERSION,
      components: [
        { id: 'UNO1', type: 'uno', props: {} },
        {
          id: 'TFT1',
          type: 'tft',
          pins: {
            gnd: 'BB1.c10',
            vcc: 'BB1.c11',
            scl: 'BB1.c12',
            sda: 'BB1.c13',
            res: 'BB1.c14',
            dc: 'BB1.c15',
            cs: 'BB1.c16',
            blk: 'BB1.c17',
          },
          props: {},
        } as unknown as CircuitDocument['components'][number],
      ],
      wires: (
        [
          ['UNO1.gnd', 'BB1.a10'],
          ['UNO1.5v', 'BB1.a11'],
          ['UNO1.d13', 'BB1.a12'],
          ['UNO1.d11', 'BB1.a13'],
          ['UNO1.d8', 'BB1.a14'],
          ['UNO1.d9', 'BB1.a15'],
          ['UNO1.d10', 'BB1.a16'],
        ] as const
      ).map(([from, to], i) => ({ id: `W${i + 1}`, from, to, color: '#000000' })),
    };
    const session = new SimulationSession(document);
    session.loadFirmware('UNO1', result.hex);
    let frame = session.frame();
    for (let t = 0; t < 3000; t += 50) {
      session.advance(50);
      frame = session.frame();
    }
    const shown = frame.result.readings.TFT1!.tft!;
    expect(shown.lit).toBe(true);
    const bytes = Buffer.from(shown.pixels!, 'base64');
    const at = (x: number, y: number) =>
      (bytes[(y * 240 + x) * 2]! << 8) | bytes[(y * 240 + x) * 2 + 1]!;
    expect(at(60, 120)).toBe(0xf800);
    expect(at(10, 10)).toBe(0x0000);
  }, 120_000);

  it('talks SPI: each byte out on MOSI comes back from the device on MISO', async () => {
    const result = await compile(`#include <SPI.h>
void setup() {
  Serial.begin(9600);
  pinMode(10, OUTPUT);
  SPI.begin();
  digitalWrite(10, LOW);
  byte back = SPI.transfer(0xA5);
  digitalWrite(10, HIGH);
  Serial.println(back, HEX);
}
void loop() {}
`);
    expect(result.ok).toBe(true);
    const board = new UnoBoard(result.hex);
    const out: number[] = [];
    board.onSpi((transfer) => {
      out.push(...transfer.bytes);
      return Uint8Array.of(0x3c);
    });
    let serial = '';
    board.onSerial((text) => (serial += text));
    board.runFor(500);
    expect(out).toEqual([0xa5]);
    expect(serial.trim()).toBe('3C');
  }, 120_000);

  it('cannot read host files from a sketch', async () => {
    const result = await compile('#include "/etc/passwd"\nvoid setup() {}\nvoid loop() {}\n');
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain('root:');
  });

  it('shipped starter firmware matches its source', async () => {
    const sketches = (await readdir(startersDir)).filter((f) => f.endsWith('.ino'));
    expect(sketches.sort()).toEqual([
      'blink.ino',
      'button.ino',
      'distance.ino',
      'fade.ino',
      'knob.ino',
      'lcd.ino',
      'servo.ino',
    ]);
    for (const sketch of sketches) {
      const result = await compile(await starter(sketch));
      // If this fails, run: pnpm --filter @banglalab/compile-worker starters:build
      expect(result.hex, sketch).toBe(await starter(sketch.replace('.ino', '.hex')));
    }
  });
});
