import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { esp32CircuitExample } from '@banglalab/shared';
import {
  Esp32SimBoard,
  SimulationSession,
  parseEsp32Firmware,
  type Esp32Emulator,
} from '@banglalab/simulation';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from './config';
import { ESP32_CORE_DIR, findEsp32FirmwareToolchain } from './esp32-firmware';
import { buildServer } from './server';

/**
 * Real ESP32 firmware (experimental): a sketch compiled in the sandbox with
 * Espressif's toolchain against the Arduino core in third_party/arduino-esp32,
 * then booted in the emulator of the whole chip and run against the lab's
 * example circuit. Needs the ESP32 toolchain (ESP32_FIRMWARE_ROOT, or
 * PlatformIO's packages), bubblewrap, python3 and the emulator built by
 * third_party/esp32sim/build.sh into .cache/esp32sim.
 */
const emulatorDir =
  process.env.ESP32SIM_DIR ?? fileURLToPath(new URL('../../../.cache/esp32sim/', import.meta.url));

let cacheDir: string;
let server: Awaited<ReturnType<typeof buildServer>>;
let emulator: Esp32Emulator;

beforeAll(async () => {
  const files = ['esp32sim.wasm', 'esp32_rev300_rom.elf'].map((name) =>
    path.join(emulatorDir, name),
  );
  expect(
    files.filter((file) => !existsSync(file)),
    'run: third_party/esp32sim/build.sh .cache/esp32sim',
  ).toEqual([]);
  emulator = {
    module: new WebAssembly.Module(readFileSync(files[0]!)),
    rom: readFileSync(files[1]!),
  };
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
    payload: { board: 'esp32', engine: 'emulator', language: 'arduino', source },
  });
  return response.json();
}

/** Builds a sketch and puts the board that runs it into the example circuit. */
async function start(source: string) {
  const result = await compile(source);
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
  const board = new Esp32SimBoard(emulator, parseEsp32Firmware(result.hex)!);
  const session = new SimulationSession(esp32CircuitExample());
  let serial = '';
  board.onSerial((text) => (serial += text));
  session.loadProgram('ESP1', board);
  return { board, session, result, serial: () => serial };
}

describe('real ESP32 firmware through the compile worker, run in the chip emulator', () => {
  it('reports the firmware toolchain as ready', async () => {
    const health = (await server.inject({ method: 'GET', url: '/health' })).json();
    expect(health.esp32Firmware).toBe('ready');
  });

  it('the Arduino core kept in this repository is the one the toolchain’s release carries', () => {
    const toolchain = findEsp32FirmwareToolchain();
    if ('missing' in toolchain) throw new Error(toolchain.missing.join(', '));
    const packaged = path.join(toolchain.root, 'framework-arduinoespressif32');
    for (const folder of ['cores/esp32', 'variants/esp32']) {
      const ours = path.join(ESP32_CORE_DIR, folder);
      const files = readdirSync(ours, { recursive: true, encoding: 'utf8' })
        .filter((file) => statSync(path.join(ours, file)).isFile())
        .sort();
      const theirs = readdirSync(path.join(packaged, folder), { recursive: true, encoding: 'utf8' })
        .filter((file) => statSync(path.join(packaged, folder, file)).isFile())
        .sort();
      expect(files, folder).toEqual(theirs);
      for (const file of files) {
        expect(
          readFileSync(path.join(ours, file)).equals(
            readFileSync(path.join(packaged, folder, file)),
          ),
          `${folder}/${file}`,
        ).toBe(true);
      }
    }
  });

  it('builds Blink, and the real firmware lights the LED through the circuit', async () => {
    const { session, result } = await start(
      'void setup() { pinMode(2, OUTPUT); }\nvoid loop() { digitalWrite(2, HIGH); delay(250); digitalWrite(2, LOW); delay(250); }\n',
    );
    // The whole of the board's software is in the image: a quarter of a megabyte for Blink.
    expect(result.flashBytes).toBeGreaterThan(150_000);
    expect(result.flashBytes).toBeLessThan(600_000);
    let lit = 0;
    let current = 0;
    for (let t = 0; t < 2000; t += 50) {
      session.advance(50);
      const reading = session.frame().result.readings.LED1!;
      if (reading.led!.state === 'on') lit++;
      current = Math.max(current, reading.current);
    }
    // The board takes some tens of milliseconds to start before the sketch runs.
    expect(lit).toBeGreaterThanOrEqual(17);
    expect(lit).toBeLessThanOrEqual(24);
    expect(current).toBeGreaterThan(0.004);
    expect(current).toBeLessThan(0.008);
  }, 180_000);

  it('the firmware reads the button through its pull-up and the potentiometer through the chip’s converter', async () => {
    const { session, serial, board } = await start(`
void setup() {
  Serial.begin(115200);
  pinMode(4, INPUT_PULLUP);
}
void loop() {
  Serial.printf("button %d knob %d\\n", digitalRead(4), analogRead(34));
  delay(200);
}
`);
    session.advance(700);
    session.frame();
    expect(board.pinDrive(4)).toBe('pullup');
    session.update(esp32CircuitExample(), ['SW1']);
    session.advance(500);
    const lines = serial()
      .split(/\r?\n/)
      .filter((line) => line.startsWith('button'));
    expect(lines[0]).toMatch(/^button 1 knob 1[89]\d\d$/);
    expect(lines.at(-1)).toMatch(/^button 0 knob 1[89]\d\d$/);
  }, 180_000);

  it('reports a mistake at the line of the sketch it is on', async () => {
    const result = await compile('void setup() {\n  pinMode(2, OUTPUT)\n}\nvoid loop() {}\n');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('compile-error');
    expect(result.diagnostics[0].line).toBe(2);
    expect(result.diagnostics[0].message).toMatch(/expected ';'/);
  }, 120_000);

  it('gives the sandbox nothing to read', async () => {
    const result = await compile('#include "/etc/passwd"\nvoid setup() {}\nvoid loop() {}\n');
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain('root:');
  }, 120_000);

  it('answers the same sketch from its cache', async () => {
    const source = 'void setup() {}\nvoid loop() { delay(9); }\n';
    const first = await compile(source);
    const second = await compile(source);
    expect(first.ok).toBe(true);
    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
  }, 120_000);
});
