/**
 * The controller inside a character LCD (HD44780), as seen through its 4-bit
 * interface: every pulse on the E pin delivers four data bits, with RS saying
 * whether they are part of a command or of a character.
 *
 * Modelled: the power-on handshake, clear, home, entry mode, display on/off,
 * cursor moves, addressing and character writes on a two-line display.
 * Not modelled: display shifting, custom characters, reading back, and the
 * 8-bit interface.
 */
export class Hd44780 {
  /** Display memory: line one at 0x00-0x27, line two at 0x40-0x67. */
  private readonly memory = new Uint8Array(0x68).fill(0x20);
  private address = 0;
  private increment = true;
  /** The controller powers up expecting 8-bit data; a 0x2 nibble switches it to 4-bit. */
  private fourBit = false;
  private highNibble: number | null = null;
  /** True while writes are aimed at the custom-character memory, which is not modelled. */
  private customCharacters = false;
  displayOn = false;

  /** One falling edge on E. `nibble` is D7..D4 as a number 0-15. */
  clock(rs: boolean, nibble: number): void {
    if (!this.fourBit) {
      // Only the "function set" handshake is meaningful before 4-bit mode is chosen.
      if (!rs && nibble === 0x2) this.fourBit = true;
      return;
    }
    if (this.highNibble === null) {
      this.highNibble = nibble;
      return;
    }
    const value = (this.highNibble << 4) | nibble;
    this.highNibble = null;
    if (rs) this.write(value);
    else this.command(value);
  }

  private command(value: number): void {
    if (value & 0x80) {
      this.address = value & 0x7f;
      this.customCharacters = false;
    } else if (value & 0x40) {
      this.customCharacters = true;
    } else if (value & 0x20) {
      if (value & 0x10) this.fourBit = false; // back to the 8-bit interface
    } else if (value & 0x10) {
      // Cursor move (display shift is ignored).
      if (!(value & 0x08)) this.step(value & 0x04 ? 1 : -1);
    } else if (value & 0x08) {
      this.displayOn = Boolean(value & 0x04);
    } else if (value & 0x04) {
      this.increment = Boolean(value & 0x02);
    } else if (value & 0x02) {
      this.address = 0;
    } else if (value & 0x01) {
      this.memory.fill(0x20);
      this.address = 0;
      this.increment = true;
    }
  }

  private write(value: number): void {
    if (this.customCharacters) return;
    if (this.address < this.memory.length && (this.address <= 0x27 || this.address >= 0x40)) {
      this.memory[this.address] = value;
    }
    this.step(this.increment ? 1 : -1);
  }

  /** Moves the cursor, running off the end of one line onto the other as the real chip does. */
  private step(by: number): void {
    let next = this.address + by;
    if (next === 0x28) next = 0x40;
    else if (next === 0x68) next = 0x00;
    else if (next === 0x3f) next = 0x27;
    else if (next < 0) next = 0x67;
    this.address = next;
  }

  /** The sixteen visible characters of each line. Characters outside ASCII show as a block. */
  lines(): [string, string] {
    const line = (start: number) =>
      Array.from(this.memory.subarray(start, start + 16), (code) =>
        code >= 0x20 && code <= 0x7d ? String.fromCharCode(code) : '▒',
      ).join('');
    return [line(0x00), line(0x40)];
  }
}
