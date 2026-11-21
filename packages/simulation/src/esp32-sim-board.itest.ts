import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { Esp32SimBoard, type Esp32Emulator } from './esp32-sim-board';

/**
 * The emulator of the whole chip (esp32sim), as the lab builds it. Needs
 * `third_party/esp32sim/build.sh .cache/esp32sim` to have been run (it needs
 * Rust), or ESP32SIM_DIR naming a folder it wrote.
 *
 * These tests use no firmware: none is built or shipped yet, and firmware
 * carries Espressif's Arduino core, which is not something to keep in the
 * repository as a test file. They cover what can be seen without one: the
 * chip's own start-up code runs, speaks on the serial port and keeps time.
 * Running a sketch on it has been tried by hand only (see the README beside
 * the build script).
 */
const dir =
  process.env.ESP32SIM_DIR ?? fileURLToPath(new URL('../../../.cache/esp32sim/', import.meta.url));
let emulator: Esp32Emulator;

beforeAll(() => {
  const module = path.join(dir, 'esp32sim.wasm');
  const rom = path.join(dir, 'esp32_rev300_rom.elf');
  expect(
    [module, rom].filter((file) => !existsSync(file)),
    'run: third_party/esp32sim/build.sh .cache/esp32sim',
  ).toEqual([]);
  emulator = { module: new WebAssembly.Module(readFileSync(module)), rom: readFileSync(rom) };
});

/** A flash with nothing on it: the start-up code finds no program to run. */
const blank = () => ({
  bootloader: new Uint8Array(4096).fill(0xff),
  partitions: new Uint8Array(3072).fill(0xff),
  app: new Uint8Array(4096).fill(0xff),
});

describe('the ESP32 emulator, as the lab builds it', () => {
  it('has the pin, PWM, analog and register access the lab added', () => {
    const names = WebAssembly.Module.exports(emulator.module).map((item) => item.name);
    for (const name of [
      'lab_gpio_observe',
      'lab_gpio_events',
      'lab_gpio_state',
      'lab_gpio_set',
      'lab_gpio_release',
      'lab_adc_volts',
      'lab_pwm_hz',
      'lab_pwm_duty',
      'lab_read32',
    ]) {
      expect(names, name).toContain(name);
    }
  });

  it('runs the chip’s own start-up code: it speaks on the serial port and keeps time', () => {
    const board = new Esp32SimBoard(emulator, blank());
    let serial = '';
    board.onSerial((text) => (serial += text));
    for (let t = 1; t <= 300; t++) board.runUntil(t);
    // Every ESP32 prints this line of its ROM when it starts.
    expect(serial).toContain('ets Jul 29 2019');
    expect(serial).toMatch(/rst:0x1 \(POWERON_RESET\)/);
    expect(board.timeMs).toBeCloseTo(300, 0);
    board.dispose();
  }, 60_000);

  it('before a program runs, no pin of the board drives anything', () => {
    const board = new Esp32SimBoard(emulator, blank());
    const changes: string[] = [];
    board.onPinChange((pin, drive) => changes.push(`${pin}:${drive}`));
    for (let t = 1; t <= 100; t++) board.runUntil(t);
    for (const pin of [2, 4, 13, 18, 19, 21, 22, 23, 25, 26, 27, 32, 33, 34, 35]) {
      expect(['input', 'pullup', 'pulldown'], `GPIO${pin}`).toContain(board.pinDrive(pin));
    }
    expect(changes.filter((change) => /:(high|low)$/.test(change))).toEqual([]);
    board.dispose();
  }, 60_000);

  it('a pin level set from outside can be set at all 40 pin numbers without harm', () => {
    const board = new Esp32SimBoard(emulator, blank());
    for (let pin = 0; pin < 40; pin++) {
      board.setDigitalInput(pin, pin % 2 === 0);
      board.setPinVoltage(pin, 1.65);
    }
    for (let t = 1; t <= 20; t++) board.runUntil(t);
    expect(board.stopped).toBeNull();
    board.dispose();
  }, 60_000);

  it('refuses an emulator built without the lab’s additions', () => {
    const empty = new WebAssembly.Module(
      new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]),
    );
    expect(() => new Esp32SimBoard({ module: empty, rom: emulator.rom }, blank())).toThrow();
  });
});
