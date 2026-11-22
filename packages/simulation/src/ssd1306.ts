/**
 * The controller of a 128 × 64 OLED display (SSD1306), as seen over I2C: every
 * write is a stream of control bytes, commands and picture data.
 *
 * From the controller's datasheet (Solomon Systech, "SSD1306", command table).
 * Modelled: the picture memory and all three ways of filling it, the address
 * windows, display on and off, the charge pump, inverse, "all pixels on",
 * contrast, mirroring left-right and top-bottom, and the start line.
 * Not modelled: scrolling, the multiplex ratio and display offset (taken as the
 * values for a 64-line panel), clock and pre-charge settings, and fading.
 */
export const OLED_WIDTH = 128;
export const OLED_HEIGHT = 64;
const PAGES = OLED_HEIGHT / 8;

/** Commands followed by this many bytes of their own. Every other command stands alone. */
const ARGUMENTS: Record<number, number> = {
  0x20: 1, // memory mode
  0x21: 2, // column window
  0x22: 2, // page window
  0x23: 1, // fade and blink
  0x26: 6, // scroll right
  0x27: 6, // scroll left
  0x29: 5, // scroll up and right
  0x2a: 5, // scroll up and left
  0x81: 1, // contrast
  0x8d: 1, // charge pump
  0xa3: 2, // scroll area
  0xa8: 1, // multiplex ratio
  0xd3: 1, // display offset
  0xd5: 1, // clock
  0xd6: 1, // zoom
  0xd9: 1, // pre-charge
  0xda: 1, // row wiring
  0xdb: 1, // deselect level
};

type MemoryMode = 'horizontal' | 'vertical' | 'page';

export class Ssd1306 {
  /** Picture memory: eight pages of 128 bytes; bit 0 of a byte is the top row of its page. */
  private readonly memory = new Uint8Array(PAGES * OLED_WIDTH);
  private mode: MemoryMode = 'page';
  private column = 0;
  private page = 0;
  private columnStart = 0;
  private columnEnd = OLED_WIDTH - 1;
  private pageStart = 0;
  private pageEnd = PAGES - 1;
  private startLine = 0;
  /** The chip wakes up drawing the other way round from how a module's panel is mounted. */
  private mirrored = true;
  private flipped = true;
  private inverse = false;
  private allOn = false;
  private displayOn = false;
  private chargePump = false;
  private contrastValue = 0x7f;
  /** A command waiting for the rest of its bytes. */
  private pending: number[] = [];
  /** Goes up with every change to what the panel shows. */
  private changes = 0;
  private drawn = -1;
  private cached = new Uint8Array((OLED_WIDTH * OLED_HEIGHT) / 8);
  /** False once anything has been written since the last reset. */
  private pristine = true;

  /**
   * True when the panel is lit: switched on, with its charge pump making the
   * panel voltage. A module has no other source for that voltage.
   */
  get lit(): boolean {
    return this.displayOn && this.chargePump;
  }

  /** The contrast setting, 0 to 255. */
  get contrast(): number {
    return this.contrastValue;
  }

  /** A number that changes whenever the picture does. */
  get version(): number {
    return this.changes;
  }

  /** Power lost: everything goes back to how the chip wakes up. */
  reset(): void {
    if (this.pristine) return;
    this.memory.fill(0);
    this.mode = 'page';
    this.column = this.page = 0;
    this.columnStart = this.pageStart = 0;
    this.columnEnd = OLED_WIDTH - 1;
    this.pageEnd = PAGES - 1;
    this.startLine = 0;
    this.mirrored = this.flipped = true;
    this.inverse = this.allOn = false;
    this.displayOn = this.chargePump = false;
    this.contrastValue = 0x7f;
    this.pending = [];
    this.changes++;
    this.pristine = true;
  }

  /**
   * One I2C write, after the address. The first byte, and each byte after a
   * "one more" control byte, says what follows: commands or picture data.
   */
  write(bytes: Uint8Array): void {
    if (bytes.length === 0) return;
    this.pristine = false;
    let at = 0;
    while (at < bytes.length) {
      const control = bytes[at++]!;
      const isData = (control & 0x40) !== 0;
      const single = (control & 0x80) !== 0;
      const end = single ? Math.min(at + 1, bytes.length) : bytes.length;
      for (; at < end; at++) {
        if (isData) this.store(bytes[at]!);
        else this.command(bytes[at]!);
      }
    }
  }

  /** One I2C read: the status byte, whose bit 6 says the display is off. */
  read(length: number): Uint8Array {
    return new Uint8Array(length).fill(this.displayOn ? 0x00 : 0x40);
  }

  private command(byte: number): void {
    if (this.pending.length > 0) {
      this.pending.push(byte);
      if (this.pending.length - 1 < (ARGUMENTS[this.pending[0]!] ?? 0)) return;
      const [code, a = 0, b = 0] = this.pending;
      this.pending = [];
      this.withArguments(code!, a, b);
      return;
    }
    if (ARGUMENTS[byte] !== undefined) {
      this.pending = [byte];
      return;
    }
    if (byte <= 0x0f) this.column = (this.column & 0xf0) | byte;
    else if (byte <= 0x1f) this.column = ((byte & 0x0f) << 4) | (this.column & 0x0f);
    else if (byte >= 0x40 && byte <= 0x7f) this.startLine = byte & 0x3f;
    else if (byte >= 0xb0 && byte <= 0xb7) this.page = byte & 0x07;
    else if (byte === 0xa0 || byte === 0xa1) this.mirrored = byte === 0xa0;
    else if (byte === 0xc0 || byte === 0xc8) this.flipped = byte === 0xc0;
    else if (byte === 0xa4 || byte === 0xa5) this.allOn = byte === 0xa5;
    else if (byte === 0xa6 || byte === 0xa7) this.inverse = byte === 0xa7;
    else if (byte === 0xae || byte === 0xaf) this.displayOn = byte === 0xaf;
    else return; // scrolling on or off, "do nothing", or a byte that is no command
    this.column &= OLED_WIDTH - 1;
    this.changes++;
  }

  private withArguments(code: number, a: number, b: number): void {
    if (code === 0x20) {
      this.mode = (['horizontal', 'vertical', 'page', 'page'] as const)[a & 3]!;
    } else if (code === 0x21) {
      this.columnStart = a & (OLED_WIDTH - 1);
      this.columnEnd = b & (OLED_WIDTH - 1);
      this.column = this.columnStart;
    } else if (code === 0x22) {
      this.pageStart = a & (PAGES - 1);
      this.pageEnd = b & (PAGES - 1);
      this.page = this.pageStart;
    } else if (code === 0x81) {
      this.contrastValue = a;
    } else if (code === 0x8d) {
      this.chargePump = (a & 0x04) !== 0;
    } else {
      return; // accepted and without effect here
    }
    this.changes++;
  }

  /** Stores one byte of picture and moves on, the way the memory mode says. */
  private store(byte: number): void {
    this.memory[this.page * OLED_WIDTH + this.column] = byte;
    this.changes++;
    if (this.mode === 'page') {
      this.column = (this.column + 1) & (OLED_WIDTH - 1);
    } else if (this.mode === 'horizontal') {
      if (this.column !== this.columnEnd) {
        this.column = (this.column + 1) & (OLED_WIDTH - 1);
        return;
      }
      this.column = this.columnStart;
      this.page = this.page === this.pageEnd ? this.pageStart : (this.page + 1) & (PAGES - 1);
    } else {
      if (this.page !== this.pageEnd) {
        this.page = (this.page + 1) & (PAGES - 1);
        return;
      }
      this.page = this.pageStart;
      this.column =
        this.column === this.columnEnd ? this.columnStart : (this.column + 1) & (OLED_WIDTH - 1);
    }
  }

  /** True when the pixel `x` from the left and `y` from the top is lit. */
  pixel(x: number, y: number): boolean {
    if (!this.lit) return false;
    if (this.allOn) return true;
    // The panel is mounted so that the usual settings (0xA1 and 0xC8) show the picture
    // upright; without them it comes out mirrored or upside down.
    const column = this.mirrored ? OLED_WIDTH - 1 - x : x;
    const row = ((this.flipped ? OLED_HEIGHT - 1 - y : y) + this.startLine) & (OLED_HEIGHT - 1);
    const on = (this.memory[(row >> 3) * OLED_WIDTH + column]! >> (row & 7)) & 1;
    return (on === 1) !== this.inverse;
  }

  /**
   * The picture as the eye sees it: one bit for each pixel, row by row from the
   * top, the leftmost pixel in the highest bit of each byte. All dark when the
   * panel is not lit.
   */
  image(): Uint8Array {
    if (this.drawn === this.changes) return this.cached;
    const image = new Uint8Array((OLED_WIDTH * OLED_HEIGHT) / 8);
    if (this.lit) {
      for (let y = 0; y < OLED_HEIGHT; y++) {
        for (let x = 0; x < OLED_WIDTH; x++) {
          if (this.pixel(x, y)) image[y * (OLED_WIDTH / 8) + (x >> 3)]! |= 0x80 >> (x & 7);
        }
      }
    }
    this.cached = image;
    this.drawn = this.changes;
    return image;
  }
}
