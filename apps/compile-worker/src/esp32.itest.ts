import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Esp32SketchBoard } from '@banglalab/simulation';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from './config';
import { buildServer } from './server';

/**
 * ESP32 sketches (experimental): compiled in the sandbox against the lab's own
 * board library into a pausable WebAssembly module, then run on the board the
 * simulation uses. Needs clang with the wasm32-wasi target, wasm-ld, wasi-libc,
 * libc++ for wasm32, binaryen and bubblewrap. ESP32_TOOLCHAIN_ROOT names where
 * they are, when not installed in /usr.
 */
const startersDir = new URL(
  '../../../packages/board-emulators/fixtures/esp32-starters/',
  import.meta.url,
);

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

async function compile(source: string, language = 'arduino') {
  return server.inject({
    method: 'POST',
    url: '/compile',
    payload: { board: 'esp32', language, source },
  });
}
/** Compiles a sketch and runs it on the board for a while; returns what it printed. */
async function run(source: string, milliseconds: number) {
  const result = (await compile(source)).json();
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
  const board = new Esp32SketchBoard(Buffer.from(result.hex, 'base64'));
  let serial = '';
  board.onSerial((text) => (serial += text));
  const changes: { pin: number; drive: string; timeMs: number }[] = [];
  board.onPinChange((pin, drive, timeMs) => changes.push({ pin, drive, timeMs }));
  for (let t = 1; t <= milliseconds; t++) board.runUntil(t);
  return { board, serial, changes, result };
}

describe('ESP32 sketches through the compile worker', () => {
  it('reports the ESP32 toolchain as ready', async () => {
    const health = (await server.inject({ method: 'GET', url: '/health' })).json();
    expect(health.esp32).toBe('ready');
  });

  it('builds a sketch that runs: pins change at the times the sketch says', async () => {
    const { changes, result } = await run(
      'void setup() { pinMode(2, OUTPUT); }\nvoid loop() { digitalWrite(2, HIGH); delay(100); digitalWrite(2, LOW); delay(100); }\n',
      450,
    );
    expect(result.flashBytes).toBeGreaterThan(1000);
    expect(result.flashBytes).toBeLessThan(200_000);
    const pin2 = changes.filter((change) => change.pin === 2 && change.drive !== 'input');
    expect(pin2.map((change) => change.drive).slice(0, 5)).toEqual([
      'low', // made an output
      'high',
      'low',
      'high',
      'low',
    ]);
    expect(pin2[2]!.timeMs - pin2[1]!.timeMs).toBeCloseTo(100, 1);
  }, 60_000);

  it('declares functions for the student, as the Arduino IDE does', async () => {
    const { serial } = await run(
      `void setup() {
  Serial.begin(115200);
  Serial.println(twice(21));
}
void loop() { delay(10); }
int twice(int n) { return n * 2; }
`,
      20,
    );
    expect(serial).toBe('42\r\n');
  }, 60_000);

  it('reports a mistake at the line of the sketch it is on', async () => {
    const result = (
      await compile('void setup() {\n  pinMode(2, OUTPUT)\n}\nvoid loop() {}\n')
    ).json();
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('compile-error');
    expect(result.diagnostics[0].line).toBe(2);
    expect(result.diagnostics[0].message).toMatch(/expected ';'/);
  }, 60_000);

  it('says so when a sketch uses something the board library does not have yet', async () => {
    const missingHeader = (
      await compile('#include <WiFi.h>\nvoid setup() {}\nvoid loop() {}\n')
    ).json();
    expect(missingHeader.ok).toBe(false);
    expect(missingHeader.diagnostics[0].message).toMatch(/WiFi\.h/);
    const missingFunction = (
      await compile('void setup() { esp_sleep_enable_ext1_wakeup(1, 0); }\nvoid loop() {}\n')
    ).json();
    expect(missingFunction.ok).toBe(false);
    expect(JSON.stringify(missingFunction.diagnostics)).toMatch(/esp_sleep_enable_ext1_wakeup/);
  }, 60_000);

  it('gives the sandbox nothing to read', async () => {
    const result = (
      await compile('#include "/etc/passwd"\nvoid setup() {}\nvoid loop() {}\n')
    ).json();
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain('root:');
  }, 60_000);

  it('takes Arduino sketches only', async () => {
    const response = await compile('int main(void) { return 0; }', 'c');
    expect(response.statusCode).toBe(400);
  });

  it('answers the same sketch from its cache', async () => {
    const source = 'void setup() {}\nvoid loop() { delay(7); }\n';
    const first = (await compile(source)).json();
    const second = (await compile(source)).json();
    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect(second.hex).toBe(first.hex);
  }, 60_000);

  it('gives a sketch the I2C bus: a scanner finds nothing on an empty bus, in real time', async () => {
    const { serial, board } = await run(
      `#include <Wire.h>
void setup() {
  Serial.begin(115200);
  Wire.begin();
  int found = 0;
  unsigned long before = micros();
  for (int address = 1; address < 127; address++) {
    Wire.beginTransmission(address);
    if (Wire.endTransmission() == 0) found++;
  }
  Serial.printf("found %d in %lu us\\n", found, micros() - before);
  Wire.beginTransmission(0x3C);
  Wire.write(0x00);
  Serial.printf("no answer gives %d\\n", Wire.endTransmission());
  Serial.printf("read gives %d\\n", (int)Wire.requestFrom(0x3C, 1));
}
void loop() { delay(100); }
`,
      100,
    );
    expect(board.stopped).toBeNull();
    expect(serial).toContain('no answer gives 2');
    expect(serial).toContain('read gives 0');
    // 126 addresses, each a start, an address byte and a stop at 100 kHz: 110 µs,
    // and a few microseconds for the calls.
    const [, found, micros] = /found (\d+) in (\d+) us/.exec(serial)!;
    expect(found).toBe('0');
    expect(Number(micros)).toBeGreaterThanOrEqual(126 * 110);
    expect(Number(micros)).toBeLessThan(126 * 130);
  }, 60_000);

  it('builds a display sketch with the real libraries, and refuses their missing fonts', async () => {
    const drawing = (
      await compile(
        `#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
Adafruit_SSD1306 display(128, 64, &Wire, -1);
void setup() {
  display.begin(SSD1306_SWITCHCAPVCC, 0x3C);
  display.clearDisplay();
  display.drawCircle(64, 32, 20, SSD1306_WHITE);
  display.display();
}
void loop() {}
`,
      )
    ).json();
    expect(drawing.ok, JSON.stringify(drawing.diagnostics)).toBe(true);
    const fonts = (
      await compile(
        '#include <Adafruit_GFX.h>\n#include <Fonts/FreeSans9pt7b.h>\nvoid setup() {}\nvoid loop() {}\n',
      )
    ).json();
    expect(fonts.ok).toBe(false);
    expect(fonts.reason).toBe('compile-error');
  }, 120_000);

  it('keeps saved settings (Preferences) by type, and from one run to the next', async () => {
    const source = `#include <Preferences.h>
Preferences p;
void setup() {
  Serial.begin(115200);
  p.begin("lab", false);
  Serial.printf("before %d\\n", (int)p.getInt("count", -1));
  p.putInt("count", p.getInt("count", 0) + 1);
  p.putString("name", "Rahim");
  p.putFloat("volts", 3.3f);
  p.putBool("on", true);
  uint8_t bytes[3] = {1, 2, 3};
  p.putBytes("raw", bytes, 3);
  Serial.printf("count %d\\n", (int)p.getInt("count"));
  Serial.printf("name %s\\n", p.getString("name").c_str());
  Serial.printf("volts %.2f\\n", p.getFloat("volts"));
  Serial.printf("on %d\\n", p.getBool("on") ? 1 : 0);
  Serial.printf("raw %d\\n", (int)p.getBytesLength("raw"));
  Serial.printf("wrong type %d\\n", (int)p.getInt("name", 42));
  Serial.printf("missing %d\\n", (int)p.getUChar("nothing", 7));
  Serial.printf("long key %d\\n", (int)p.putInt("a_key_that_is_too_long", 1));
  Serial.printf("types %d %d\\n", (int)p.getType("count"), (int)p.getType("volts"));
  p.end();
  Serial.printf("closed %d\\n", (int)p.putInt("count", 99));
  p.begin("lab", true);
  Serial.printf("read only %d\\n", (int)p.putInt("count", 99));
  Serial.printf("still %d\\n", (int)p.getInt("count"));
  p.end();
  Serial.printf("long name %d\\n", p.begin("a_name_that_is_too_long") ? 1 : 0);
}
void loop() { delay(100); }
`;
    const result = (await compile(source)).json();
    expect(result.ok, JSON.stringify(result.diagnostics)).toBe(true);
    const bytes = Buffer.from(result.hex, 'base64');
    const runOnce = (settings: string) => {
      const board = new Esp32SketchBoard(bytes, settings);
      let serial = '';
      let saved = settings;
      board.onSerial((text) => (serial += text));
      board.onSettingsSaved((text) => (saved = text));
      board.runUntil(50);
      return { serial, saved };
    };
    const first = runOnce('');
    expect(first.serial).toContain('before -1');
    expect(first.serial).toContain('count 1');
    expect(first.serial).toContain('name Rahim');
    expect(first.serial).toContain('volts 3.30');
    expect(first.serial).toContain('on 1');
    expect(first.serial).toContain('raw 3');
    // A value read as the wrong type, or one that is not there, gives the default.
    expect(first.serial).toContain('wrong type 42');
    expect(first.serial).toContain('missing 7');
    expect(first.serial).toContain('long key 0');
    // PT_I32 is 4 and PT_BLOB is 9: a float is kept as a byte block, as by the real library.
    expect(first.serial).toContain('types 4 9');
    expect(first.serial).toContain('closed 0');
    expect(first.serial).toContain('read only 0');
    expect(first.serial).toContain('still 1');
    expect(first.serial).toContain('long name 0');
    // Started again with what was saved: the count carries on.
    const second = runOnce(first.saved);
    expect(second.serial).toContain('before 1');
    expect(second.serial).toContain('count 2');
  }, 60_000);

  it('every shipped starter still builds and runs', async () => {
    const sketches = (await readdir(startersDir)).filter((file) => file.endsWith('.ino'));
    expect(sketches.length).toBe(45);
    for (const sketch of sketches) {
      const { board } = await run(await readFile(new URL(sketch, startersDir), 'utf8'), 200);
      expect(board.stopped, sketch).toBeNull();
    }
  }, 120_000);
});
