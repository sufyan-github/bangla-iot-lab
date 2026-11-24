import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Esp32SketchBoard } from './esp32-sketch-board';
import { LabWebServices, madeUpWeather } from './web-services';

/**
 * The program's own HTTP requests, with the ready-made program `webclient`: it
 * asks the lab's made-up weather service, lights the LED when it is hot, and
 * keeps each reading in log.lab.
 */
const starter = (name: string) =>
  Buffer.from(
    readFileSync(
      new URL(`../../board-emulators/fixtures/esp32-starters/${name}.wasm.base64`, import.meta.url),
      'utf8',
    ),
    'base64',
  );

describe('HTTPClient', () => {
  it('asks weather.lab, acts on the answer and keeps it in log.lab', () => {
    const board = new Esp32SketchBoard(starter('webclient'));
    const web = new LabWebServices();
    let now = 0;
    board.onWeb((method, url, body) => web.handle({ from: 'U1', method, url, body, timeMs: now }));
    let serial = '';
    board.onSerial((text) => (serial += text));
    let led = 'low';
    board.onPinChange((pin, drive) => {
      if (pin === 2) led = drive;
    });

    for (now = 0; now <= 12_500; now += 100) board.runUntil(now);
    expect(serial).toContain('Wi-Fi-তে আছি');
    const calls = web.takeLog();
    // Every five seconds: one question to weather.lab, one line to log.lab.
    expect(calls.map((call) => `${call.method} ${call.url} ${call.status}`)).toEqual([
      'GET http://weather.lab/now?city=Dhaka 200',
      'POST http://log.lab/ 201',
      'GET http://weather.lab/now?city=Dhaka 200',
      'POST http://log.lab/ 201',
      'GET http://weather.lab/now?city=Dhaka 200',
      'POST http://log.lab/ 201',
    ]);
    // What the program printed, kept and did agrees with what the service said.
    const first = madeUpWeather('Dhaka', calls[0]!.timeMs).temperature;
    expect(serial).toContain(`ঢাকার তাপমাত্রা (বানানো): ${first.toFixed(2)}`);
    expect(web.logLines[0]).toBe(`temperature=${first.toFixed(2)}`);
    const last = madeUpWeather('Dhaka', calls[4]!.timeMs).temperature;
    expect(led).toBe(last > 30 ? 'high' : 'low');
    expect(board.stopped).toBeNull();
  });

  it('finds nobody without Wi-Fi or the lab’s services, and says why', () => {
    // No services given: as if the address had nobody behind it.
    const board = new Esp32SketchBoard(starter('webclient'));
    let serial = '';
    board.onSerial((text) => (serial += text));
    for (let now = 0; now <= 3000; now += 100) board.runUntil(now);
    expect(serial).toContain('অনুরোধ হলো না: connection refused');
  });
});
