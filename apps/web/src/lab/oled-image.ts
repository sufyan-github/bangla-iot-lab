/**
 * Turns an OLED display's picture (128 × 64, one bit a pixel, base64) into an
 * image a browser can draw: a two-colour bitmap as a data address. The picture
 * from the simulation already has the layout a bitmap wants, a row of sixteen
 * bytes with the leftmost pixel in the highest bit; only the order of the rows
 * differs, because a bitmap file starts at the bottom.
 */
const WIDTH = 128;
const HEIGHT = 64;
const ROW_BYTES = WIDTH / 8;
const HEADER_BYTES = 62;
/** The colour of a lit pixel at full brightness: the white of the common module. */
const LIT = [0xe6, 0xf4, 0xff] as const;
const DARK = [0x05, 0x07, 0x0a] as const;

export interface OledImage {
  url: string;
  /** How many pixels are lit. */
  litPixels: number;
}

const made = new Map<string, OledImage>();
/** Pictures kept ready: a display shows the same one for many frames. */
const KEPT = 6;

export function oledImage(pixels: string, brightness: number): OledImage {
  const level = Math.round(Math.min(1, Math.max(0, brightness)) * 20) / 20;
  const key = `${level}:${pixels}`;
  const ready = made.get(key);
  if (ready) return ready;

  const picture = Uint8Array.from(atob(pixels), (c) => c.charCodeAt(0));
  const file = new Uint8Array(HEADER_BYTES + ROW_BYTES * HEIGHT);
  const view = new DataView(file.buffer);
  file.set([0x42, 0x4d]); // "BM"
  view.setUint32(2, file.length, true);
  view.setUint32(10, HEADER_BYTES, true);
  view.setUint32(14, 40, true); // size of the description that follows
  view.setInt32(18, WIDTH, true);
  view.setInt32(22, HEIGHT, true);
  view.setUint16(26, 1, true);
  view.setUint16(28, 1, true); // one bit a pixel
  view.setUint32(34, ROW_BYTES * HEIGHT, true);
  view.setUint32(46, 2, true); // two colours, as blue, green, red
  file.set([DARK[2], DARK[1], DARK[0], 0], 54);
  const mix = (lit: number, dark: number) => Math.round(dark + (lit - dark) * level);
  file.set([mix(LIT[2], DARK[2]), mix(LIT[1], DARK[1]), mix(LIT[0], DARK[0]), 0], 58);
  let litPixels = 0;
  for (let y = 0; y < HEIGHT; y++) {
    const row = picture.subarray(y * ROW_BYTES, (y + 1) * ROW_BYTES);
    file.set(row, HEADER_BYTES + (HEIGHT - 1 - y) * ROW_BYTES);
    for (const byte of row) for (let bits = byte; bits; bits &= bits - 1) litPixels++;
  }
  let text = '';
  for (const byte of file) text += String.fromCharCode(byte);
  const image = { url: `data:image/bmp;base64,${btoa(text)}`, litPixels };
  if (made.size >= KEPT) made.delete(made.keys().next().value!);
  made.set(key, image);
  return image;
}
