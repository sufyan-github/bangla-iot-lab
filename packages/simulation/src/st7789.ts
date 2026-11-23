import { ST7789_COLUMNS, ST7789_ROWS, TFT_SIZE } from './library';

/**
 * The ST7789 display controller, as a program sees it over SPI: a byte sent
 * with DC LOW is a command, and the bytes after it with DC HIGH are its
 * parameters or pixels. Written from Sitronix's ST7789V datasheet (the command
 * list and the memory's address counter). Nothing here has been compared with
 * a real display.
 *
 * Memory holds 240 columns by 320 rows; the 1.54-inch panel shows the first 240
 * rows. Pixels are kept as 16-bit RGB 565.
 */
export const ST7789 = {
  nop: 0x00,
  softwareReset: 0x01,
  sleepIn: 0x10,
  sleepOut: 0x11,
  partialMode: 0x12,
  normalMode: 0x13,
  inversionOff: 0x20,
  inversionOn: 0x21,
  displayOff: 0x28,
  displayOn: 0x29,
  columnAddress: 0x2a,
  rowAddress: 0x2b,
  memoryWrite: 0x2c,
  memoryAccess: 0x36,
  pixelFormat: 0x3a,
  memoryWriteContinue: 0x3c,
} as const;

/** Bits of the memory access setting (MADCTL). */
const MY = 0x80;
const MX = 0x40;
const MV = 0x20;
const BGR = 0x08;

export class St7789 {
  private readonly memory = new Uint16Array(ST7789_COLUMNS * ST7789_ROWS);
  private sleeping = true;
  private displayOn = false;
  private inverted = false;
  private access = 0;
  /** COLMOD: 0x55 is 16 bits a pixel, 0x66 is 18. */
  private format = 0x66;
  private columns: [number, number] = [0, ST7789_COLUMNS - 1];
  private rows: [number, number] = [0, ST7789_ROWS - 1];
  private column = 0;
  private row = 0;
  /** The command whose parameters are arriving, and those that have come. */
  private command: number | null = null;
  private params: number[] = [];
  /** Bytes of a pixel still being sent. */
  private pixel: number[] = [];
  /** Goes up whenever what the panel shows may have changed. */
  version = 0;

  /** The state the chip starts in after power-on or a reset. Memory is left as it was. */
  reset(): void {
    this.sleeping = true;
    this.displayOn = false;
    this.inverted = false;
    this.access = 0;
    this.format = 0x66;
    this.columns = [0, ST7789_COLUMNS - 1];
    this.rows = [0, ST7789_ROWS - 1];
    this.column = 0;
    this.row = 0;
    this.command = null;
    this.params = [];
    this.pixel = [];
    this.version++;
  }

  /** Power lost: the chip forgets its settings and its memory. */
  powerOff(): void {
    this.memory.fill(0);
    this.reset();
  }

  /** True while the panel is showing memory: awake, with the display on. */
  get showing(): boolean {
    return !this.sleeping && this.displayOn;
  }

  /** Bytes sent while the chip is selected, all at one level of DC (HIGH for data). */
  write(bytes: Uint8Array, data: boolean): void {
    for (const byte of bytes) {
      if (data) this.data(byte);
      else this.begin(byte);
    }
  }

  private begin(command: number): void {
    this.command = command;
    this.params = [];
    this.pixel = [];
    switch (command) {
      case ST7789.softwareReset:
        this.reset();
        break;
      case ST7789.sleepIn:
        this.sleeping = true;
        break;
      case ST7789.sleepOut:
        this.sleeping = false;
        break;
      case ST7789.inversionOff:
        this.inverted = false;
        break;
      case ST7789.inversionOn:
        this.inverted = true;
        break;
      case ST7789.displayOff:
        this.displayOn = false;
        break;
      case ST7789.displayOn:
        this.displayOn = true;
        break;
      case ST7789.memoryWrite:
        this.column = this.columns[0];
        this.row = this.rows[0];
        break;
      default:
        return;
    }
    this.version++;
  }

  private data(byte: number): void {
    switch (this.command) {
      case ST7789.columnAddress:
      case ST7789.rowAddress: {
        this.params.push(byte);
        if (this.params.length === 4) {
          const [a, b, c, d] = this.params as [number, number, number, number];
          const range: [number, number] = [(a << 8) | b, (c << 8) | d];
          if (this.command === ST7789.columnAddress) this.columns = range;
          else this.rows = range;
        }
        return;
      }
      case ST7789.memoryAccess:
        if (this.params.push(byte) === 1) {
          this.access = byte;
          this.version++;
        }
        return;
      case ST7789.pixelFormat:
        if (this.params.push(byte) === 1) this.format = byte;
        return;
      case ST7789.memoryWrite:
      case ST7789.memoryWriteContinue:
        this.pixelByte(byte);
        return;
      default:
        // Parameters of commands not modelled are taken and ignored.
        return;
    }
  }

  private pixelByte(byte: number): void {
    this.pixel.push(byte);
    const wide = (this.format & 0x07) === 0x06;
    if (this.pixel.length < (wide ? 3 : 2)) return;
    const [first, g, last] = wide
      ? // 18 bits: six of each colour, in the top of three bytes.
        [this.pixel[0]! >> 3, this.pixel[1]! >> 2, this.pixel[2]! >> 3]
      : [
          this.pixel[0]! >> 3,
          ((this.pixel[0]! & 0x07) << 3) | (this.pixel[1]! >> 5),
          this.pixel[1]! & 0x1f,
        ];
    this.pixel = [];
    // With BGR set, the first colour sent is blue.
    const [r, b] = this.access & BGR ? [last, first] : [first, last];
    this.store((r << 11) | (g << 5) | b);
  }

  /** Puts a pixel where the address counter points, and moves the counter on. */
  private store(colour: number): void {
    // The window counts columns first; with MV the two directions swap in memory,
    // and MX and MY then mirror memory's own columns and rows.
    let x = this.access & MV ? this.row : this.column;
    let y = this.access & MV ? this.column : this.row;
    if (this.access & MX) x = ST7789_COLUMNS - 1 - x;
    if (this.access & MY) y = ST7789_ROWS - 1 - y;
    if (x >= 0 && x < ST7789_COLUMNS && y >= 0 && y < ST7789_ROWS) {
      this.memory[y * ST7789_COLUMNS + x] = colour;
      if (y < TFT_SIZE) this.version++;
    }
    if (this.column < this.columns[1]) {
      this.column++;
    } else {
      this.column = this.columns[0];
      this.row = this.row < this.rows[1] ? this.row + 1 : this.rows[0];
    }
  }

  /**
   * The picture on the panel: `TFT_SIZE` × `TFT_SIZE` pixels, each two bytes of
   * RGB 565 high byte first, left to right and top to bottom. Black while the
   * panel is asleep or off. The panel is mounted turned half round, so memory's
   * last column and row are at the top left, which makes rotation 0 of
   * Adafruit's library upright.
   */
  image(): Uint8Array {
    const picture = new Uint8Array(TFT_SIZE * TFT_SIZE * 2);
    if (!this.showing) return picture;
    let at = 0;
    for (let y = 0; y < TFT_SIZE; y++) {
      const row = (TFT_SIZE - 1 - y) * ST7789_COLUMNS;
      for (let x = 0; x < TFT_SIZE; x++) {
        const stored = this.memory[row + (ST7789_COLUMNS - 1 - x)]!;
        // An IPS panel like this shows colours inverted unless the chip inverts them back.
        const shown = this.inverted ? stored : ~stored & 0xffff;
        picture[at++] = shown >> 8;
        picture[at++] = shown & 0xff;
      }
    }
    return picture;
  }

  /** One pixel of the picture as 0xRRGGBB, for tests. */
  colourAt(x: number, y: number): number {
    const picture = this.image();
    const at = (y * TFT_SIZE + x) * 2;
    const value = (picture[at]! << 8) | picture[at + 1]!;
    const r = (value >> 11) & 0x1f;
    const g = (value >> 5) & 0x3f;
    const b = value & 0x1f;
    return (((r * 255 + 15) / 31) << 16) | (((g * 255 + 31) / 63) << 8) | ((b * 255 + 15) / 31);
  }
}
