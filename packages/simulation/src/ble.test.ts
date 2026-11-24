import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Esp32SketchBoard } from './esp32-sketch-board';

/**
 * Bluetooth Low Energy, with the ready-made program `ble`: the board
 * advertises, the lab's phone connects, receives the knob's readings as
 * notifications, and switches the LED by writing to a characteristic.
 */
const starter = (name: string) =>
  Buffer.from(
    readFileSync(
      new URL(`../../board-emulators/fixtures/esp32-starters/${name}.wasm.base64`, import.meta.url),
      'utf8',
    ),
    'base64',
  );
const text = (bytes: Iterable<number>) => new TextDecoder().decode(new Uint8Array([...bytes]));

describe('Bluetooth Low Energy', () => {
  it('advertises, takes a phone, notifies it, and does what the phone writes', () => {
    const board = new Esp32SketchBoard(starter('ble'));
    let serial = '';
    board.onSerial((t) => (serial += t));
    const notes: string[] = [];
    board.onBleNotify((_, value) => notes.push(text(value)));
    let led = 'low';
    board.onPinChange((pin, drive) => {
      if (pin === 2) led = drive;
    });
    board.setPinVoltage(34, 1.65);

    // Before the program starts, there is nothing to find.
    expect(board.ble()).toBeNull();
    board.runUntil(500);
    const found = board.ble()!;
    expect(found).toMatchObject({ name: 'Lab-ESP32', advertising: true, connected: false });
    expect(found.characteristics.map((c) => [c.uuid.slice(0, 8), c.properties])).toEqual([
      ['6e400003', 1 | 4],
      ['6e400002', 2],
    ]);
    // The knob's value is there to read even before anyone connects; no notifications yet.
    expect(text(found.characteristics[0]!.value)).toMatch(/^\d+$/);
    expect(notes).toEqual([]);

    expect(board.bleConnect(true)).toBe(true);
    board.runUntil(3000);
    expect(serial).toContain('ফোন যুক্ত হলো');
    expect(board.ble()!).toMatchObject({ connected: true, advertising: false });
    expect(notes.length).toBeGreaterThanOrEqual(2);
    expect(Number(notes[0])).toBeGreaterThan(1500);

    // Writing to the LED characteristic switches it; the knob's may not be written.
    expect(board.bleWrite(0, new TextEncoder().encode('x'))).toBe(false);
    expect(board.bleWrite(1, new TextEncoder().encode('on'))).toBe(true);
    board.runUntil(4100);
    expect(serial).toContain('ফোন লিখল: on');
    expect(led).toBe('high');

    // The phone leaves; the program makes the board findable again.
    expect(board.bleConnect(false)).toBe(true);
    board.runUntil(5200);
    expect(serial).toContain('ফোন চলে গেল');
    expect(board.ble()!).toMatchObject({ connected: false, advertising: true });
    const before = notes.length;
    board.runUntil(7300);
    expect(notes.length).toBe(before);
    expect(board.stopped).toBeNull();
  });

  it('a phone cannot write without connecting, nor connect to a board that is not advertising', () => {
    const board = new Esp32SketchBoard(starter('ble'));
    board.runUntil(500);
    expect(board.bleWrite(1, new TextEncoder().encode('on'))).toBe(false);
    expect(board.bleConnect(true)).toBe(true);
    expect(board.bleConnect(true)).toBe(false);
  });
});
