import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseIntelHex } from './intel-hex';
import { UnoBoard } from './uno';

const blinkHex = readFileSync(new URL('../fixtures/blink.hex', import.meta.url), 'utf8');

describe('Intel HEX parser', () => {
  it('loads data records at their addresses', () => {
    const flash = parseIntelHex(':0400100001020304E2\n:00000001FF\n', 64);
    expect(Array.from(flash.subarray(0x10, 0x14))).toEqual([1, 2, 3, 4]);
    expect(flash[0x0f]).toBe(0);
  });

  it('rejects corrupt input', () => {
    expect(() => parseIntelHex(':0400100001020304E3\n:00000001FF\n', 64)).toThrow(/checksum/);
    expect(() => parseIntelHex(':0400100001020304E2\n', 64)).toThrow(/end-of-file/);
    expect(() => parseIntelHex('hello\n', 64)).toThrow(/not a valid record/);
    expect(() => parseIntelHex(':0400100001020304E2\n:00000001FF\n', 8)).toThrow(/does not fit/);
  });
});

describe('UNO emulator running the blink firmware', () => {
  it('toggles pin 13 every 500 ms of simulated time', () => {
    const board = new UnoBoard(blinkHex);
    const changes: { drive: string; timeMs: number }[] = [];
    board.onPinChange((pin, drive, timeMs) => {
      if (pin === 13) changes.push({ drive, timeMs });
    });

    board.runFor(2100);

    // The pin first becomes an output (driving low), then the program toggles it.
    expect(changes.map((c) => c.drive)).toEqual(['low', 'high', 'low', 'high', 'low', 'high']);
    for (let i = 2; i < changes.length; i++) {
      const period = changes[i]!.timeMs - changes[i - 1]!.timeMs;
      expect(Math.abs(period - 500)).toBeLessThan(1); // within 0.2 % of the programmed delay
    }
    expect(board.digitalRead(13)).toBe(true);
    expect(board.timeMs).toBeCloseTo(2100, 0);
  });

  it('delivers serial output', () => {
    const board = new UnoBoard(blinkHex);
    let output = '';
    board.onSerial((text) => (output += text));
    board.runFor(50);
    expect(output).toBe('blink\n');
  });

  it('reports other pins as low and rejects pins that do not exist', () => {
    const board = new UnoBoard(blinkHex);
    board.runFor(10);
    expect(board.digitalRead(12)).toBe(false);
    expect(board.pinDrive(12)).toBe('input'); // pins start as high-impedance inputs
    expect(board.pinDrive(13)).toBe('high');
    expect(() => board.digitalRead(20)).toThrow(RangeError);
    expect(() => board.setAnalogInput(6, 1)).toThrow(RangeError);
  });
});
