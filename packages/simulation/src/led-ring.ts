import { LED_RING_IDLE_MA, LED_RING_MA_PER_COLOUR } from './library';

/**
 * A ring of WS2812B LEDs. Each LED keeps the first three bytes that reach it
 * (green, red, blue) and passes everything after them on, so the first LED
 * takes the first three bytes, the second the next three, and what is left
 * over leaves by DOUT for whatever is wired there. From WorldSemi's WS2812B
 * datasheet; nothing here has been compared with a real ring.
 */
export class LedRing {
  /** Each LED's colour as 0xRRGGBB, the first LED (nearest DIN) first. */
  private colours: number[];

  constructor(leds: number) {
    this.colours = new Array<number>(leds).fill(0);
  }

  get leds(): number {
    return this.colours.length;
  }

  /** A ring of another size: the LEDs it still has keep their colours. */
  setLeds(leds: number): void {
    if (leds === this.colours.length) return;
    this.colours = Array.from({ length: leds }, (_, i) => this.colours[i] ?? 0);
  }

  /**
   * Bytes arriving on DIN after the line has rested: the LEDs take what is
   * theirs, and the rest is returned, to go out on DOUT. LEDs that receive no
   * whole colour keep the one they had.
   */
  receive(bytes: Uint8Array): Uint8Array {
    const whole = Math.min(this.colours.length, Math.floor(bytes.length / 3));
    for (let i = 0; i < whole; i++) {
      const [g, r, b] = [bytes[3 * i]!, bytes[3 * i + 1]!, bytes[3 * i + 2]!];
      this.colours[i] = (r << 16) | (g << 8) | b;
    }
    return bytes.subarray(this.colours.length * 3);
  }

  /** Without power every LED goes dark, and forgets its colour. */
  off(): void {
    this.colours.fill(0);
  }

  show(): number[] {
    return [...this.colours];
  }

  /**
   * ESTIMATE: what the LEDs draw for the colours they show, in milliamperes. A
   * colour at full strength takes about 20 mA, and each LED about 1 mA dark.
   */
  milliamps(): number {
    let total = this.colours.length * LED_RING_IDLE_MA;
    for (const colour of this.colours) {
      const sum = ((colour >> 16) & 0xff) + ((colour >> 8) & 0xff) + (colour & 0xff);
      total += (sum / 255) * LED_RING_MA_PER_COLOUR;
    }
    return total;
  }
}
