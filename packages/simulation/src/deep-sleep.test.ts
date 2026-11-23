import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Esp32SketchBoard } from './esp32-sketch-board';

/**
 * Deep sleep on the ESP32: the program stops, the board lets go of its pins,
 * and on waking the program starts again from setup(), keeping only its
 * RTC_DATA_ATTR variables.
 */

const starter = (name: string) =>
  Buffer.from(
    readFileSync(
      new URL(`../../board-emulators/fixtures/esp32-starters/${name}.wasm.base64`, import.meta.url),
      'utf8',
    ),
    'base64',
  );

describe('deep sleep', () => {
  it('starts the program again on the timer, keeping RTC variables and losing the others', () => {
    const board = new Esp32SketchBoard(starter('deepsleep'));
    let serial = '';
    board.onSerial((text) => (serial += text));
    const ledAt: string[] = [];
    board.onPinChange((pin, drive, timeMs) => {
      if (pin === 2) ledAt.push(`${drive}@${Math.round(timeMs)}`);
    });
    board.runUntil(13_000);
    expect(board.stopped).toBeNull();
    // Awake for a second, asleep for five: woken at about 6 s and 12 s.
    expect(serial).toContain('জেগেছি, বার: 1, সাধারণ চলক: 1');
    expect(serial).toContain('প্রথমবার চালু হলাম');
    expect(serial).toContain('জেগেছি, বার: 2, সাধারণ চলক: 1');
    expect(serial).toContain('জেগেছি, বার: 3, সাধারণ চলক: 1');
    expect(serial.match(/টাইমারে জাগলাম/g)).toHaveLength(2);
    // The LED is lit while awake, and let go (the pin an input) while asleep.
    // pinMode() makes it a LOW output before digitalWrite() lifts it.
    expect(ledAt.slice(0, 6)).toEqual([
      'low@0',
      'high@0',
      'input@1000',
      'low@6000',
      'high@6000',
      'input@7000',
    ]);
  });
});
