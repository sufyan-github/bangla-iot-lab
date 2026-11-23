import { readFileSync } from 'node:fs';
import {
  CIRCUIT_SCHEMA_VERSION,
  type CircuitComponent,
  type CircuitDocument,
  type Wire,
} from '@banglalab/shared';
import { describe, expect, it } from 'vitest';
import { LedRing } from './led-ring';
import { SimulationSession } from './session';
import { simulate } from './simulate';
import { ST7789, St7789 } from './st7789';

/**
 * The WS2812B LED ring and the ST7789 colour display: each model on its own,
 * then each driven by its ready-made program through the lab's NeoPixel
 * library and Adafruit's ST7789 library. Nothing here has been compared with
 * the real parts.
 */

const starter = (name: string) =>
  readFileSync(
    new URL(`../../board-emulators/fixtures/esp32-starters/${name}.wasm.base64`, import.meta.url),
    'utf8',
  );
function circuit(components: CircuitComponent[], wires: [string, string][]): CircuitDocument {
  return {
    schemaVersion: CIRCUIT_SCHEMA_VERSION,
    components,
    wires: wires.map(([from, to], i): Wire => ({ id: `W${i + 1}`, from, to, color: '#000000' })),
  };
}
const esp32: CircuitComponent = { id: 'ESP1', type: 'esp32', props: {} };
function printed(session: SimulationSession, milliseconds: number): string {
  let text = '';
  for (let t = 0; t < milliseconds; t += 50) {
    session.advance(50);
    text += session.frame().boards.ESP1!.serial;
  }
  return text;
}

/** Sends a command and its parameters to a display, as a program would. */
function send(chip: St7789, command: number, ...data: number[]) {
  chip.write(Uint8Array.of(command), false);
  if (data.length) chip.write(Uint8Array.from(data), true);
}
/** Starts a display as Adafruit's library does for a 240 × 240 panel at rotation 0. */
function started(): St7789 {
  const chip = new St7789();
  send(chip, ST7789.softwareReset);
  send(chip, ST7789.sleepOut);
  send(chip, ST7789.pixelFormat, 0x55);
  send(chip, ST7789.memoryAccess, 0xc0); // MY and MX
  send(chip, ST7789.inversionOn);
  send(chip, ST7789.normalMode);
  send(chip, ST7789.displayOn);
  return chip;
}
/** Fills a window of the screen (in rotation 0, whose rows start 80 into memory). */
function fill(chip: St7789, x: number, y: number, w: number, h: number, rgb565: number) {
  send(chip, ST7789.columnAddress, 0, x, 0, x + w - 1);
  const top = y + 80;
  const bottom = top + h - 1;
  send(chip, ST7789.rowAddress, top >> 8, top & 0xff, bottom >> 8, bottom & 0xff);
  send(chip, ST7789.memoryWrite);
  const bytes = new Uint8Array(w * h * 2);
  for (let i = 0; i < bytes.length; i += 2) [bytes[i], bytes[i + 1]] = [rgb565 >> 8, rgb565 & 0xff];
  chip.write(bytes, true);
}

describe('the ST7789 display chip', () => {
  it('shows nothing until it is woken and switched on', () => {
    const chip = new St7789();
    expect(chip.showing).toBe(false);
    expect(chip.image().every((byte) => byte === 0)).toBe(true);
    send(chip, ST7789.sleepOut);
    expect(chip.showing).toBe(false);
    send(chip, ST7789.displayOn);
    expect(chip.showing).toBe(true);
  });

  it("puts a window of pixels where rotation 0 of Adafruit's library expects, upright", () => {
    const chip = started();
    fill(chip, 0, 0, 240, 240, 0x0000);
    fill(chip, 10, 20, 5, 3, 0xf800); // red
    expect(chip.colourAt(10, 20)).toBe(0xff0000);
    expect(chip.colourAt(14, 22)).toBe(0xff0000);
    expect(chip.colourAt(15, 22)).toBe(0x000000);
    expect(chip.colourAt(10, 23)).toBe(0x000000);
  });

  it('without colour inversion an IPS panel shows every colour inverted', () => {
    const chip = started();
    fill(chip, 0, 0, 2, 2, 0xf800);
    send(chip, ST7789.inversionOff);
    expect(chip.colourAt(0, 0)).toBe(0x00ffff);
  });

  it('turns the picture with the memory access setting', () => {
    const chip = started();
    fill(chip, 0, 0, 240, 240, 0x0000);
    // Rotation 2 of the library: no mirroring and rows from 0, which is upside down here.
    send(chip, ST7789.memoryAccess, 0x00);
    send(chip, ST7789.columnAddress, 0, 0, 0, 0);
    send(chip, ST7789.rowAddress, 0, 0, 0, 0);
    send(chip, ST7789.memoryWrite, 0x07, 0xe0); // green
    expect(chip.colourAt(239, 239)).toBe(0x00ff00);
    // Rotation 1: MY and MV, with the columns 80 in. The top left lands at the top right.
    send(chip, ST7789.memoryAccess, 0xa0);
    send(chip, ST7789.columnAddress, 0, 80, 0, 80);
    send(chip, ST7789.rowAddress, 0, 0, 0, 0);
    send(chip, ST7789.memoryWrite, 0x00, 0x1f); // blue
    expect(chip.colourAt(239, 0)).toBe(0x0000ff);
  });

  it('takes 18-bit pixels, three bytes each', () => {
    const chip = started();
    send(chip, ST7789.pixelFormat, 0x66);
    send(chip, ST7789.columnAddress, 0, 0, 0, 0);
    send(chip, ST7789.rowAddress, 0, 80, 0, 80);
    send(chip, ST7789.memoryWrite, 0xfc, 0xfc, 0x00); // red and green: yellow
    expect(chip.colourAt(0, 0)).toBe(0xffff00);
  });

  it('a software reset puts it back to sleep, with the display off', () => {
    const chip = started();
    send(chip, ST7789.softwareReset);
    expect(chip.showing).toBe(false);
  });
});

describe('the WS2812B ring', () => {
  it('each LED takes three bytes, green first, and passes the rest on', () => {
    const ring = new LedRing(2);
    const rest = ring.receive(Uint8Array.of(0xff, 0, 0, 0, 0x80, 0, 1, 2, 3));
    expect(ring.show()).toEqual([0x00ff00, 0x800000]);
    expect([...rest]).toEqual([1, 2, 3]);
  });

  it('an LED that receives no whole colour keeps the one it had', () => {
    const ring = new LedRing(3);
    ring.receive(Uint8Array.of(0, 0, 9, 0, 0, 9, 0, 0, 9));
    ring.receive(Uint8Array.of(0, 7, 0, 0));
    expect(ring.show()).toEqual([0x070000, 0x000009, 0x000009]);
  });

  it('estimates its current: about 1 mA an LED dark, 20 mA more for each colour at full', () => {
    const ring = new LedRing(12);
    expect(ring.milliamps()).toBeCloseTo(12);
    ring.receive(new Uint8Array(36).fill(255));
    expect(ring.milliamps()).toBeCloseTo(12 + 12 * 60);
  });
});

describe('the ring program', () => {
  const document = (position: number, rings: { leds: number; supply: string }[] = []) => {
    const parts: CircuitComponent[] = [
      esp32,
      {
        id: 'POT1',
        type: 'potentiometer',
        pins: { a: 'BB1.c20', wiper: 'BB1.c21', b: 'BB1.c22' },
        props: { resistance: 10_000, position },
      },
    ];
    const wires: [string, string][] = [
      // Turned fully (position 1) the wiper is at B, on 3.3 V.
      ['ESP1.gnd2', 'BB1.a20'],
      ['ESP1.d34', 'BB1.a21'],
      ['ESP1.3v3', 'BB1.a22'],
    ];
    const list = rings.length ? rings : [{ leds: 12, supply: 'ESP1.vin' }];
    list.forEach(({ leds, supply }, i) => {
      // Each ring in its own four rows; a wire takes one ring's DOUT to the next one's DIN.
      const row = 2 + i * 5;
      parts.push({
        id: `RING${i + 1}`,
        type: 'ledring',
        pins: {
          vcc: `BB1.h${row}`,
          gnd: `BB1.h${row + 1}`,
          din: `BB1.h${row + 2}`,
          dout: `BB1.h${row + 3}`,
        },
        props: { leds },
      } as CircuitComponent);
      wires.push([supply, `BB1.j${row}`], ['ESP1.gnd1', `BB1.j${row + 1}`]);
      if (i > 0) wires.push([`BB1.j${row - 2}`, `BB1.j${row + 2}`]);
    });
    wires.push(['ESP1.d4', 'BB1.j4']);
    return circuit(parts, wires);
  };
  const colours = (session: SimulationSession, id = 'RING1') =>
    session.frame().result.readings[id]!.ring!.colours;

  it('lights every LED from green to red with the knob turned fully', () => {
    const session = new SimulationSession(document(1));
    session.loadFirmware('ESP1', starter('ring'));
    expect(printed(session, 600)).toContain('12 টি LED জ্বলছে');
    const shown = colours(session);
    // Brightness 60 of 255: a full colour arrives as 60.
    expect(shown[0]).toBe(0x003c00);
    expect(shown[11]).toBe(0x3c0000);
    expect(session.frame().result.readings.RING1!.ring!.milliamps).toBeGreaterThan(12);
  });

  it('with the knob turned down, all the LEDs are dark', () => {
    const session = new SimulationSession(document(0));
    session.loadFirmware('ESP1', starter('ring'));
    expect(printed(session, 600)).toContain('0 টি LED জ্বলছে');
    expect(colours(session).every((colour) => colour === 0)).toBe(true);
  });

  it("a second ring on the first one's DOUT gets the LEDs the first has no room for", () => {
    const session = new SimulationSession(
      document(1, [
        { leds: 8, supply: 'ESP1.vin' },
        { leds: 8, supply: 'ESP1.vin' },
      ]),
    );
    session.loadFirmware('ESP1', starter('ring'));
    printed(session, 600);
    const second = colours(session, 'RING2');
    expect(second.slice(0, 4).every((colour) => colour !== 0)).toBe(true);
    expect(second[3]).toBe(0x3c0000);
    expect(second.slice(4).every((colour) => colour === 0)).toBe(true);
  });

  it('on the 3.3 V pin the ring stays dark, and the lab says its supply is too low', () => {
    const document33 = document(1, [{ leds: 12, supply: 'ESP1.3v3' }]);
    const session = new SimulationSession(document33);
    session.loadFirmware('ESP1', starter('ring'));
    printed(session, 600);
    expect(colours(session).every((colour) => colour === 0)).toBe(true);
    const codes = simulate(document33).diagnostics.map((d) => d.code);
    expect(codes).toContain('module-underpowered');
  });
});

describe('the colour display program', () => {
  const document = (legs: Partial<Record<'cs' | 'blk', string>> = {}) =>
    circuit(
      [
        esp32,
        {
          id: 'TFT1',
          type: 'tft',
          pins: {
            gnd: 'BB1.c10',
            vcc: 'BB1.c11',
            scl: 'BB1.c12',
            sda: 'BB1.c13',
            res: 'BB1.c14',
            dc: 'BB1.c15',
            cs: 'BB1.c16',
            blk: 'BB1.c17',
          },
          props: {},
        },
      ],
      [
        ['ESP1.gnd1', 'BB1.a10'],
        ['ESP1.3v3', 'BB1.a11'],
        ['ESP1.d18', 'BB1.a12'],
        ['ESP1.d23', 'BB1.a13'],
        ['ESP1.d4', 'BB1.a14'],
        ['ESP1.d2', 'BB1.a15'],
        ...(legs.cs === 'open' ? [] : [[legs.cs ?? 'ESP1.d5', 'BB1.a16'] as [string, string]]),
        ...(legs.blk ? [[legs.blk, 'BB1.a17'] as [string, string]] : []),
      ],
    );
  /** One pixel of the picture shown, as 0xRRGGBB. */
  const pixel = (session: SimulationSession, x: number, y: number) => {
    const shown = session.frame().result.readings.TFT1!.tft!;
    const bytes = Buffer.from(shown.pixels!, 'base64');
    const value = (bytes[(y * 240 + x) * 2]! << 8) | bytes[(y * 240 + x) * 2 + 1]!;
    return ((value >> 11) << 19) | (((value >> 5) & 0x3f) << 10) | ((value & 0x1f) << 3);
  };

  it("draws the title, three coloured bars and the time, through Adafruit's library", () => {
    const session = new SimulationSession(document());
    session.loadFirmware('ESP1', starter('tft'));
    expect(printed(session, 2500)).toContain('ডিসপ্লে চালু হলো');
    expect(session.frame().result.readings.TFT1!.tft!.lit).toBe(true);
    expect(pixel(session, 50, 115)).toBe(0xf80000);
    expect(pixel(session, 120, 115)).toBe(0x00fc00);
    expect(pixel(session, 190, 115)).toBe(0x0000f8);
    expect(pixel(session, 5, 5)).toBe(0x000000);
    // The title, white letters three times their size, starts at (12, 12): "I" is a bar of white.
    let white = 0;
    for (let x = 12; x < 30; x++) if (pixel(session, x, 20) === 0xf8fcf8) white++;
    expect(white).toBeGreaterThan(0);
  });

  it('with CS left unconnected the chip is never selected, and the panel stays black', () => {
    const session = new SimulationSession(document({ cs: 'open' }));
    session.loadFirmware('ESP1', starter('tft'));
    printed(session, 1500);
    expect(pixel(session, 50, 115)).toBe(0x000000);
  });

  it('with CS tied to GND the chip is always selected, and the program works', () => {
    const session = new SimulationSession(document({ cs: 'ESP1.gnd2' }));
    session.loadFirmware('ESP1', starter('tft'));
    printed(session, 1500);
    expect(pixel(session, 50, 115)).toBe(0xf80000);
  });

  it('with BLK tied to GND the backlight is off and nothing can be seen', () => {
    const session = new SimulationSession(document({ blk: 'ESP1.gnd2' }));
    session.loadFirmware('ESP1', starter('tft'));
    printed(session, 1500);
    expect(session.frame().result.readings.TFT1!.tft).toEqual({ lit: false });
  });
});
