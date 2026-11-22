import { describe, expect, it } from 'vitest';
import { OLED_HEIGHT, OLED_WIDTH, Ssd1306 } from './ssd1306';

/** A write of commands, and a write of picture data, as they travel over I2C. */
const commands = (...bytes: number[]) => new Uint8Array([0x00, ...bytes]);
const data = (...bytes: number[]) => new Uint8Array([0x40, ...bytes]);
/** What a display library sends to switch the panel on, the usual way up. */
const SWITCH_ON = commands(0x8d, 0x14, 0xa1, 0xc8, 0xaf);

function lit(panel: Ssd1306): [number, number][] {
  const pixels: [number, number][] = [];
  for (let y = 0; y < OLED_HEIGHT; y++) {
    for (let x = 0; x < OLED_WIDTH; x++) if (panel.pixel(x, y)) pixels.push([x, y]);
  }
  return pixels;
}

describe('SSD1306 display controller', () => {
  it('is dark until it is switched on with its charge pump running', () => {
    const panel = new Ssd1306();
    panel.write(data(0xff));
    expect(panel.lit).toBe(false);
    // Switched on, but told to expect a panel voltage from outside, which a module has not got.
    panel.write(commands(0x8d, 0x10, 0xaf));
    expect(panel.lit).toBe(false);
    expect(lit(panel)).toEqual([]);
    panel.write(commands(0x8d, 0x14));
    expect(panel.lit).toBe(true);
    panel.write(commands(0xae));
    expect(panel.lit).toBe(false);
  });

  it('stores a byte as eight pixels down a column, lowest bit at the top', () => {
    const panel = new Ssd1306();
    panel.write(SWITCH_ON);
    panel.write(commands(0x20, 0x00, 0x21, 0, 127, 0x22, 0, 7));
    panel.write(data(0b0000_0101, 0x80));
    expect(lit(panel)).toEqual([
      [0, 0],
      [0, 2],
      [1, 7],
    ]);
  });

  it('fills a window row by row, as a library sending a whole picture does', () => {
    const panel = new Ssd1306();
    panel.write(SWITCH_ON);
    // A window two columns wide and two pages high, starting at column 10, page 1.
    panel.write(commands(0x20, 0x00, 0x21, 10, 11, 0x22, 1, 2));
    panel.write(data(0x01, 0x01, 0x01, 0x01, 0x80));
    // The fifth byte wrapped back to the window's first corner and replaced what was there.
    expect(lit(panel)).toEqual([
      [11, 8],
      [10, 15],
      [10, 16],
      [11, 16],
    ]);
  });

  it('fills downwards in vertical mode, and stays on one page in page mode', () => {
    const vertical = new Ssd1306();
    vertical.write(SWITCH_ON);
    vertical.write(commands(0x20, 0x01, 0x21, 0, 127, 0x22, 0, 1));
    vertical.write(data(0x01, 0x01, 0x01));
    expect(lit(vertical)).toEqual([
      [0, 0],
      [1, 0],
      [0, 8],
    ]);

    const paged = new Ssd1306();
    paged.write(SWITCH_ON);
    // Page 3, column 126: 0xB3, then the column's low and high halves.
    paged.write(commands(0xb3, 0x0e, 0x17));
    paged.write(data(0x01, 0x01, 0x01));
    expect(lit(paged)).toEqual([
      [0, 24], // the third byte wrapped to the start of the same page
      [126, 24],
      [127, 24],
    ]);
  });

  it('takes commands and data in one write, when each is announced singly', () => {
    const panel = new Ssd1306();
    // 0x80: one command follows. 0xC0: one data byte follows.
    panel.write(new Uint8Array([0x80, 0x8d, 0x80, 0x14, 0x80, 0xa1, 0x80, 0xc8, 0x80, 0xaf]));
    panel.write(new Uint8Array([0x80, 0xb0, 0x80, 0x00, 0x80, 0x10, 0xc0, 0x01, 0xc0, 0x01]));
    expect(lit(panel)).toEqual([
      [0, 0],
      [1, 0],
    ]);
  });

  it('draws mirrored or upside down without the usual direction settings', () => {
    const picture = (...directions: number[]) => {
      const panel = new Ssd1306();
      panel.write(commands(0x8d, 0x14, 0xaf, ...directions, 0x20, 0x00, 0x21, 0, 127, 0x22, 0, 7));
      panel.write(data(0x01));
      return lit(panel);
    };
    expect(picture(0xa1, 0xc8)).toEqual([[0, 0]]);
    expect(picture(0xa0, 0xc8)).toEqual([[127, 0]]);
    expect(picture(0xa1, 0xc0)).toEqual([[0, 63]]);
    // As the chip wakes up: turned half way round.
    expect(picture()).toEqual([[127, 63]]);
  });

  it('inverts, lights everything, and reports its contrast', () => {
    const panel = new Ssd1306();
    panel.write(SWITCH_ON);
    panel.write(commands(0x20, 0x00, 0x21, 0, 127, 0x22, 0, 7));
    panel.write(data(0x01));
    panel.write(commands(0xa7));
    expect(lit(panel)).toHaveLength(OLED_WIDTH * OLED_HEIGHT - 1);
    expect(panel.pixel(0, 0)).toBe(false);
    panel.write(commands(0xa6, 0xa5));
    expect(lit(panel)).toHaveLength(OLED_WIDTH * OLED_HEIGHT);
    panel.write(commands(0xa4, 0x81, 0xcf));
    expect(lit(panel)).toEqual([[0, 0]]);
    expect(panel.contrast).toBe(0xcf);
  });

  it('skips the bytes of commands it does not act on, and stays in step', () => {
    const panel = new Ssd1306();
    panel.write(SWITCH_ON);
    // Clock, multiplex, offset, row wiring, pre-charge, deselect level, a scroll set-up, scroll off.
    panel.write(commands(0xd5, 0x80, 0xa8, 0x3f, 0xd3, 0x00, 0xda, 0x12, 0xd9, 0xf1, 0xdb, 0x40));
    panel.write(commands(0x26, 0x00, 0x00, 0x00, 0x07, 0x00, 0xff, 0x2e));
    // An argument split across two writes still belongs to its command.
    panel.write(commands(0x81));
    panel.write(commands(0x10));
    expect(panel.contrast).toBe(0x10);
    panel.write(commands(0x20, 0x00, 0x21, 0, 127, 0x22, 0, 7));
    panel.write(data(0x01));
    expect(lit(panel)).toEqual([[0, 0]]);
  });

  it('gives its picture as one bit a pixel, and only rebuilds it when something changed', () => {
    const panel = new Ssd1306();
    panel.write(SWITCH_ON);
    panel.write(commands(0x20, 0x00, 0x21, 0, 127, 0x22, 0, 7));
    panel.write(data(0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x03));
    const image = panel.image();
    expect(image).toHaveLength(1024);
    expect(image[0]).toBe(0b1000_0000); // pixel (0, 0)
    expect(image[1]).toBe(0b1000_0000); // pixel (8, 0)
    expect(image[16 + 1]).toBe(0b1000_0000); // pixel (8, 1)
    expect(panel.image()).toBe(image);
    const before = panel.version;
    panel.write(data(0xff));
    expect(panel.version).toBeGreaterThan(before);
    expect(panel.image()).not.toBe(image);
  });

  it('forgets everything when its power goes', () => {
    const panel = new Ssd1306();
    panel.write(SWITCH_ON);
    panel.write(data(0xff));
    panel.reset();
    expect(panel.lit).toBe(false);
    panel.write(SWITCH_ON);
    expect(lit(panel)).toEqual([]);
    expect(panel.read(1)).toEqual(new Uint8Array([0x00]));
  });
});
