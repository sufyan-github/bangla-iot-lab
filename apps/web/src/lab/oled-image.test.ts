import { describe, expect, it } from 'vitest';
import { oledImage } from './oled-image';

const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const decode = (url: string) =>
  Uint8Array.from(atob(url.replace('data:image/bmp;base64,', '')), (c) => c.charCodeAt(0));

describe('OLED picture as a bitmap', () => {
  it('is a two-colour bitmap of 128 × 64 with the rows bottom first', () => {
    const picture = new Uint8Array(1024);
    picture[0] = 0b1000_0000; // the top-left pixel
    picture[1023] = 0b0000_0011; // the last two pixels of the bottom row
    const image = oledImage(base64(picture), 1);
    expect(image.litPixels).toBe(3);
    const file = decode(image.url);
    const view = new DataView(file.buffer);
    expect(String.fromCharCode(file[0]!, file[1]!)).toBe('BM');
    expect(file.length).toBe(62 + 1024);
    expect(view.getUint32(2, true)).toBe(file.length);
    expect(view.getUint32(10, true)).toBe(62);
    expect([view.getInt32(18, true), view.getInt32(22, true)]).toEqual([128, 64]);
    expect(view.getUint16(28, true)).toBe(1);
    // The bottom row comes first in the file, the top row last.
    expect(file[62 + 15]).toBe(0b0000_0011);
    expect(file[62 + 63 * 16]).toBe(0b1000_0000);
  });

  it('dims the lit colour with the contrast, and keeps a made picture', () => {
    const picture = base64(new Uint8Array(1024).fill(0xff));
    const bright = decode(oledImage(picture, 1).url);
    const dim = decode(oledImage(picture, 0.45).url);
    // Colour 1 of the table, stored blue, green, red.
    expect([...bright.subarray(58, 61)]).toEqual([0xff, 0xf4, 0xe6]);
    expect(dim[58]!).toBeLessThan(bright[58]!);
    expect(dim[58]!).toBeGreaterThan(0x40);
    expect(oledImage(picture, 1)).toBe(oledImage(picture, 1));
  });
});
