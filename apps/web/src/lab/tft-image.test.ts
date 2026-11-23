import { describe, expect, it } from 'vitest';
import { tftImage } from './tft-image';

const base64 = (bytes: Uint8Array) => {
  let text = '';
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text);
};
const decode = (url: string) =>
  Uint8Array.from(atob(url.replace('data:image/bmp;base64,', '')), (c) => c.charCodeAt(0));

describe('colour display picture as a bitmap', () => {
  it('is a 16-bit bitmap of 240 × 240 with RGB 565 masks and the rows bottom first', () => {
    const picture = new Uint8Array(240 * 240 * 2);
    [picture[0], picture[1]] = [0xf8, 0x00]; // the top-left pixel, red
    [picture[picture.length - 2], picture[picture.length - 1]] = [0x00, 0x1f]; // bottom-right, blue
    const image = tftImage(base64(picture));
    expect(image.litPixels).toBe(2);
    const file = decode(image.url);
    const view = new DataView(file.buffer);
    expect(String.fromCharCode(file[0]!, file[1]!)).toBe('BM');
    expect(file.length).toBe(66 + 240 * 480);
    expect(view.getUint32(10, true)).toBe(66);
    expect([view.getInt32(18, true), view.getInt32(22, true)]).toEqual([240, 240]);
    expect(view.getUint16(28, true)).toBe(16);
    expect(view.getUint32(30, true)).toBe(3);
    expect([54, 58, 62].map((at) => view.getUint32(at, true))).toEqual([0xf800, 0x07e0, 0x001f]);
    // The bottom row comes first in the file, each pixel low byte first.
    expect(view.getUint16(66 + 239 * 2, true)).toBe(0x001f);
    expect(view.getUint16(66 + 239 * 480, true)).toBe(0xf800);
  });

  it('keeps a picture it has made', () => {
    const picture = base64(new Uint8Array(240 * 240 * 2).fill(0xff));
    expect(tftImage(picture)).toBe(tftImage(picture));
    expect(tftImage(picture).litPixels).toBe(240 * 240);
  });
});
