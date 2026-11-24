import { readFileSync } from 'node:fs';
import type { HttpResponse } from '@banglalab/board-emulators';
import { describe, expect, it } from 'vitest';
import { Esp32SketchBoard } from './esp32-sketch-board';

/**
 * Wi-Fi and the board's own web server, with the ready-made program
 * `webserver`: the board joins the lab's made-up network, and the lab's browser
 * panel asks it for pages that switch an LED.
 */
const starter = (name: string) =>
  Buffer.from(
    readFileSync(
      new URL(`../../board-emulators/fixtures/esp32-starters/${name}.wasm.base64`, import.meta.url),
      'utf8',
    ),
    'base64',
  );

describe('the board’s own web page', () => {
  it('joins the network after a moment, then serves pages that switch the LED', () => {
    const board = new Esp32SketchBoard(starter('webserver'));
    let serial = '';
    board.onSerial((text) => (serial += text));
    const answers: HttpResponse[] = [];
    board.onHttpResponse((response) => answers.push(response));
    let led = 'low';
    board.onPinChange((pin, drive) => {
      if (pin === 2) led = drive;
    });

    // Not on the network yet: nothing can reach it.
    board.runUntil(500);
    expect(board.request('/')).toBe('no-wifi');
    board.runUntil(2500);
    expect(serial).toContain('ঠিকানা: http://192.168.1.50');
    expect(serial).toContain('ওয়েব সার্ভার চালু');

    const home = board.request('/');
    expect(typeof home).toBe('number');
    board.runUntil(2600);
    expect(answers).toHaveLength(1);
    expect(answers[0]).toMatchObject({ id: home, path: '/', status: 200, type: 'text/html' });
    expect(answers[0]!.body).toContain('নেভা');

    board.request('/on');
    board.runUntil(2700);
    expect(led).toBe('high');
    expect(answers[1]!.body).toContain('জ্বলছে');

    // A page the program does not know.
    board.request('/nothing');
    board.runUntil(2800);
    expect(answers[2]).toMatchObject({ status: 404, body: 'Not found: /nothing' });
    expect(board.stopped).toBeNull();
  });
});
