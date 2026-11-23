/**
 * Turns a colour display's picture (240 × 240, two bytes of RGB 565 a pixel,
 * high byte first, base64) into an image a browser can draw: a 16-bit bitmap
 * whose colour masks say where red, green and blue are, as a data address.
 * Only the byte order of each pixel and the order of the rows change, because
 * a bitmap stores the low byte first and starts at the bottom.
 */
const SIZE = 240;
const ROW_BYTES = SIZE * 2;
/** File header, the description of the picture, and its three colour masks. */
const HEADER_BYTES = 14 + 40 + 12;

export interface TftImage {
  url: string;
  /** How many pixels are not black. */
  litPixels: number;
}

const made = new Map<string, TftImage>();
/** Pictures kept ready: a display shows the same one for many frames. */
const KEPT = 4;

export function tftImage(pixels: string): TftImage {
  const ready = made.get(pixels);
  if (ready) return ready;

  const picture = Uint8Array.from(atob(pixels), (c) => c.charCodeAt(0));
  const file = new Uint8Array(HEADER_BYTES + ROW_BYTES * SIZE);
  const view = new DataView(file.buffer);
  file.set([0x42, 0x4d]); // "BM"
  view.setUint32(2, file.length, true);
  view.setUint32(10, HEADER_BYTES, true);
  view.setUint32(14, 40, true); // size of the description that follows
  view.setInt32(18, SIZE, true);
  view.setInt32(22, SIZE, true);
  view.setUint16(26, 1, true);
  view.setUint16(28, 16, true); // sixteen bits a pixel
  view.setUint32(30, 3, true); // laid out by the colour masks below
  view.setUint32(34, ROW_BYTES * SIZE, true);
  view.setUint32(54, 0xf800, true); // red
  view.setUint32(58, 0x07e0, true); // green
  view.setUint32(62, 0x001f, true); // blue
  let litPixels = 0;
  for (let y = 0; y < SIZE; y++) {
    const from = y * ROW_BYTES;
    const to = HEADER_BYTES + (SIZE - 1 - y) * ROW_BYTES;
    for (let i = 0; i < ROW_BYTES; i += 2) {
      const high = picture[from + i] ?? 0;
      const low = picture[from + i + 1] ?? 0;
      file[to + i] = low;
      file[to + i + 1] = high;
      if (high | low) litPixels++;
    }
  }
  let text = '';
  for (let i = 0; i < file.length; i += 0x8000) {
    text += String.fromCharCode(...file.subarray(i, i + 0x8000));
  }
  const image = { url: `data:image/bmp;base64,${btoa(text)}`, litPixels };
  if (made.size >= KEPT) made.delete(made.keys().next().value!);
  made.set(pixels, image);
  return image;
}
