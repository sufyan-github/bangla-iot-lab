import { beforeAll, describe, expect, it } from 'vitest';
import { PicoBoard } from './pico';
import { createPicoFromVendor } from './pico-fixtures';

/**
 * Pico trial: the official MicroPython firmware on the emulated RP2040.
 * Needs the firmware and boot ROM: pnpm --filter @banglalab/board-emulators pico:fetch
 */
let board: PicoBoard;
let banner = '';

beforeAll(() => {
  board = createPicoFromVendor();
  const stop = board.onSerial((text) => (banner += text));
  expect(board.boot()).toBe(true);
  stop();
});

describe('MicroPython on the emulated Pico', () => {
  it('boots the official firmware to its prompt in well under a second', () => {
    expect(banner).toMatch(/MicroPython v1\.29\.0 .* Raspberry Pi Pico with RP2040/);
    expect(board.timeMs).toBeLessThan(500);
  });

  it('runs a program and returns what it printed', () => {
    const result = board.run('import sys\nprint("hello from", sys.platform, 2 ** 10, 7 / 2)', 1000);
    expect(result).toEqual({ output: 'hello from rp2 1024 3.5\n', error: '', finished: true });
  });

  it('keeps exact time: sleep_ms(200) toggles the LED every 200 ms', () => {
    const changes: number[] = [];
    const stop = board.onPinChange((pin, _drive, timeMs) => pin === 25 && changes.push(timeMs));
    const awakeBefore = board.awakeMs;
    const result = board.run(
      'from machine import Pin\nimport time\nled = Pin(25, Pin.OUT)\nfor i in range(6):\n    led.toggle()\n    time.sleep_ms(200)\nprint("done")',
      3000,
    );
    stop();
    expect(result.output).toBe('done\n');
    // The pin becomes an output, then toggles six times.
    const periods = changes.slice(-5).map((t, i, all) => (i === 0 ? 200 : t - all[i - 1]!));
    for (const period of periods) expect(period).toBeCloseTo(200, 0);
    // While it sleeps the processor really is asleep: awake for under 5 % of the 1.2 seconds.
    expect(board.awakeMs - awakeBefore).toBeLessThan(60);
  });

  it('reads analog and digital inputs, and drives PWM on the pin', () => {
    board.setAnalogInput(0, 1.65);
    board.setDigitalInput(15, false);
    const edges: { high: boolean; timeMs: number }[] = [];
    const stop = board.onPinChange(
      (pin, drive, timeMs) => pin === 16 && edges.push({ high: drive === 'high', timeMs }),
    );
    const result = board.run(
      [
        'from machine import Pin, ADC, PWM',
        'import time',
        'print(ADC(26).read_u16())',
        'button = Pin(15, Pin.IN, Pin.PULL_UP)',
        'print(button.value())',
        'pwm = PWM(Pin(16))',
        'pwm.freq(1000)',
        'pwm.duty_u16(16384)',
        'time.sleep_ms(10)',
        'pwm.deinit()',
      ].join('\n'),
      2000,
    );
    stop();
    expect(result.error).toBe('');
    const [analog, button] = result.output.trim().split('\n').map(Number);
    expect(Math.abs(analog! - 32768)).toBeLessThan(40); // half of 3.3 V on a 16-bit scale
    expect(button).toBe(0);
    expect(board.pinDrive(15)).toBe('pullup');

    const rises = edges.filter((e) => e.high).map((e) => e.timeMs);
    const firstFall = edges.find((e) => !e.high && e.timeMs > rises[1]!)!.timeMs;
    expect(rises[2]! - rises[1]!).toBeCloseTo(1, 3); // 1 kHz
    expect(firstFall - rises[1]!).toBeCloseTo(0.25, 3); // 25 % duty
  });

  it('reports errors as a traceback with the line number', () => {
    const result = board.run('x = 1\nprint(x / 0)', 1000);
    expect(result.finished).toBe(true);
    expect(result.output).toBe('');
    expect(result.error).toContain('line 2');
    expect(result.error).toMatch(/ZeroDivisionError: divide by zero$/);
  });

  it('stops a program that never ends, and is usable afterwards', () => {
    const runaway = board.run('while True:\n    pass', 200);
    expect(runaway.finished).toBe(false);
    board.runFor(50);
    expect(board.run('print(6 * 7)', 1000)).toMatchObject({ output: '42\n', finished: true });
  });

  it('rejects files that are not firmware', () => {
    const bootrom = new Uint32Array(4096);
    expect(() => new PicoBoard(bootrom, new Uint8Array(512))).toThrow(/UF2/);
    expect(() => new PicoBoard(bootrom, new Uint8Array(100))).toThrow(/UF2/);
    expect(() => board.pinDrive(30)).toThrow(RangeError);
    expect(() => board.setAnalogInput(3, 1)).toThrow(RangeError);
  });
});
