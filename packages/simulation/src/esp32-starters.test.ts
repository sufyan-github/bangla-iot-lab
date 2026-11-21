import { readFileSync } from 'node:fs';
import { esp32CircuitExample } from '@banglalab/shared';
import { describe, expect, it } from 'vitest';
import { esp32AnalogRead } from './esp32-pins';
import { Esp32SketchBoard } from './esp32-sketch-board';
import { SimulationSession } from './session';

/**
 * The ready-made ESP32 programs, exactly as shipped (built ahead of time; a
 * compile-worker test checks they match their sketches), run on the example
 * circuit: LED on GPIO2, button on GPIO4, potentiometer at half way on GPIO34.
 */
const starter = (name: string) =>
  Buffer.from(
    readFileSync(
      new URL(`../../board-emulators/fixtures/esp32-starters/${name}.wasm.base64`, import.meta.url),
      'utf8',
    ),
    'base64',
  );

function start(name: string) {
  const board = new Esp32SketchBoard(starter(name));
  const session = new SimulationSession(esp32CircuitExample());
  let serial = '';
  board.onSerial((text) => (serial += text));
  session.loadProgram('ESP1', board);
  const run = (milliseconds: number, frameMs = 50) => {
    const frames = [];
    for (let t = 0; t < milliseconds; t += frameMs) {
      session.advance(frameMs);
      frames.push(session.frame());
    }
    return frames;
  };
  return { board, session, run, serial: () => serial };
}
const ledOn = (frame: ReturnType<SimulationSession['frame']>) =>
  frame.result.readings.LED1!.led!.state === 'on';

describe('ready-made ESP32 programs, as shipped', () => {
  it('Blink: half a second on, half a second off', () => {
    const frames = start('blink').run(3000);
    expect(frames.filter(ledOn).length).toBeGreaterThanOrEqual(29);
    expect(frames.filter(ledOn).length).toBeLessThanOrEqual(31);
    expect(ledOn(frames[2]!)).toBe(true);
    expect(ledOn(frames[14]!)).toBe(false);
    // (3.3 V minus the LED) over 220 ohms and the pin: a few milliamperes, dimmer than on 5 V.
    const current = Math.max(...frames.map((frame) => frame.result.readings.LED1!.current));
    expect(current).toBeGreaterThan(0.004);
    expect(current).toBeLessThan(0.008);
  });

  it('Button: the LED is lit while the button is held', () => {
    const { run, session } = start('button');
    expect(run(200).some(ledOn)).toBe(false);
    session.update(esp32CircuitExample(), ['SW1']);
    expect(ledOn(run(200).at(-1)!)).toBe(true);
    session.update(esp32CircuitExample(), []);
    expect(ledOn(run(200).at(-1)!)).toBe(false);
  });

  it('Fade: the LED goes from dark to bright and back', () => {
    const { run } = start('fade');
    const current = run(3200, 100).map((frame) => frame.result.readings.LED1!.current);
    const peak = Math.max(...current);
    const brightest = current.indexOf(peak);
    // 51 steps of 30 ms up, then down again.
    expect(brightest).toBeGreaterThan(12);
    expect(brightest).toBeLessThan(18);
    expect(current[1]!).toBeLessThan(peak * 0.15);
    expect(current[30]!).toBeLessThan(peak * 0.15);
    expect(peak).toBeGreaterThan(0.004);
  });

  it('Knob: prints what the chip reads at half of 3.3 V, and dims the LED to match', () => {
    const { run, serial, board } = start('knob');
    run(500);
    const printed = serial().trim().split(/\r?\n/).map(Number);
    const expected = esp32AnalogRead(1.65).count;
    expect(printed.length).toBeGreaterThanOrEqual(4);
    for (const value of printed) expect(Math.abs(value - expected)).toBeLessThanOrEqual(2);
    expect(board.pwmOf(2)!.duty).toBeCloseTo(Math.floor(expected / 16) / 255, 2);
    expect(board.pwmOf(2)!.frequency).toBe(1000);
  });
});
