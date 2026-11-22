/**
 * The DS18B20 on a 1-Wire bus, as Maxim's datasheet (rev. 050102) gives it:
 * a reset, then a ROM command, then a function command, a bit at a time, least
 * significant bit first. Several can share one wire: each answers only when its
 * ROM code is chosen, and the search lets the master find them all.
 */

/** The Dallas/Maxim CRC-8, X^8 + X^5 + X^4 + 1, over bytes sent least significant bit first. */
export function dallasCrc8(bytes: Iterable<number>): number {
  let crc = 0;
  for (let byte of bytes) {
    for (let i = 0; i < 8; i++) {
      const mix = (crc ^ byte) & 1;
      crc >>= 1;
      if (mix) crc ^= 0x8c;
      byte >>= 1;
    }
  }
  return crc;
}

/** Family code 28h, a 48-bit serial number taken from the part's name, and the CRC. */
export function ds18b20Rom(id: string): Uint8Array {
  let hash = 2166136261;
  const serial: number[] = [];
  for (let round = 0; round < 6; round++) {
    for (const char of `${id}#${round}`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
    serial.push(hash & 0xff);
  }
  const rom = [0x28, ...serial];
  return Uint8Array.from([...rom, dallasCrc8(rom)]);
}

/**
 * Celsius as the temperature register holds it at a resolution of 9 to 12 bits:
 * a two's complement count of sixteenths, with the bits below the resolution
 * left at 0 (the datasheet calls them undefined).
 */
export function ds18b20Register(celsius: number, bits: 9 | 10 | 11 | 12): number {
  const clamped = Math.min(125, Math.max(-55, celsius));
  const unused = 12 - bits;
  const sixteenths = Math.round(clamped * 16);
  return sixteenths & ~((1 << unused) - 1) & 0xffff;
}

/** REPORTED in the datasheet: maximum conversion time for 9, 10, 11 and 12 bits. */
export const DS18B20_CONVERSION_MS = { 9: 93.75, 10: 187.5, 11: 375, 12: 750 } as const;
/** REPORTED: the temperature register reads +85 °C until the first conversion. */
export const DS18B20_POWER_ON_REGISTER = 0x0550;

type Phase =
  | { kind: 'rom' }
  | { kind: 'match'; bit: number; matching: boolean }
  | { kind: 'search'; bit: number; step: 0 | 1 | 2 }
  | { kind: 'function' }
  | { kind: 'write-scratchpad'; bit: number }
  | { kind: 'status' }
  | { kind: 'converting' }
  | { kind: 'silent' };

export class Ds18b20 {
  readonly rom: Uint8Array;
  private temperature = DS18B20_POWER_ON_REGISTER;
  /** Alarm limits and configuration: as in the scratchpad, and as kept in EEPROM. */
  private th = 0x4b;
  private tl = 0x46;
  private config = 0x7f;
  private eeprom = { th: 0x4b, tl: 0x46, config: 0x7f };
  private alarm = false;
  private conversionEndsAt: number | null = null;
  private phase: Phase = { kind: 'silent' };
  /** Bits received towards the next command or data byte. */
  private incoming = 0;
  private incomingCount = 0;
  /** Bits the device is to send in the next read slots. */
  private outgoing: number[] = [];
  private written: number[] = [];

  constructor(
    id: string,
    private celsius: number,
  ) {
    this.rom = ds18b20Rom(id);
  }

  setCelsius(celsius: number): void {
    this.celsius = celsius;
  }

  /** As when switched on: the 85 °C register, and the settings from EEPROM. */
  powerOn(): void {
    this.temperature = DS18B20_POWER_ON_REGISTER;
    this.th = this.eeprom.th;
    this.tl = this.eeprom.tl;
    this.config = this.eeprom.config;
    this.alarm = false;
    this.conversionEndsAt = null;
    this.phase = { kind: 'silent' };
  }

  private get bits(): 9 | 10 | 11 | 12 {
    return (9 + ((this.config >> 5) & 0x03)) as 9 | 10 | 11 | 12;
  }

  /** A reset pulse: every device answers with presence, and listens for a ROM command. */
  reset(now: number): boolean {
    this.finishConversion(now);
    this.phase = { kind: 'rom' };
    this.incoming = 0;
    this.incomingCount = 0;
    this.outgoing = [];
    return true;
  }

  /** What the device does with the line in a read slot: 0 pulls it low, 1 leaves it. */
  read(now: number): 0 | 1 {
    this.finishConversion(now);
    if (this.outgoing.length > 0) return this.outgoing.shift() as 0 | 1;
    const phase = this.phase;
    if (phase.kind === 'converting') return this.conversionEndsAt === null ? 1 : 0;
    if (phase.kind === 'search') {
      const own = this.romBit(phase.bit);
      if (phase.step === 0) {
        phase.step = 1;
        return own;
      }
      if (phase.step === 1) {
        phase.step = 2;
        return (own ^ 1) as 0 | 1;
      }
    }
    return 1;
  }

  /** A write slot from the master. */
  write(bit: 0 | 1, now: number): void {
    this.finishConversion(now);
    const phase = this.phase;
    switch (phase.kind) {
      case 'rom':
      case 'function':
        this.incoming |= bit << this.incomingCount;
        if (++this.incomingCount === 8) {
          const command = this.incoming;
          this.incoming = 0;
          this.incomingCount = 0;
          if (phase.kind === 'rom') this.romCommand(command);
          else this.functionCommand(command, now);
        }
        return;
      case 'match':
        if (bit !== this.romBit(phase.bit)) phase.matching = false;
        if (++phase.bit === 64)
          this.phase = phase.matching ? { kind: 'function' } : { kind: 'silent' };
        return;
      case 'search':
        // The master chose a branch: a device whose code differs here drops out.
        if (phase.step !== 2) return;
        if (bit !== this.romBit(phase.bit)) {
          this.phase = { kind: 'silent' };
        } else if (++phase.bit === 64) {
          this.phase = { kind: 'function' };
        } else {
          phase.step = 0;
        }
        return;
      case 'write-scratchpad':
        this.written.push(bit);
        if (++phase.bit === 24) {
          const byte = (n: number) =>
            this.written.slice(8 * n, 8 * n + 8).reduce((v, b, i) => v | (b << i), 0);
          this.th = byte(0);
          this.tl = byte(1);
          // Only R1 and R0 can be written; the other bits stay as the datasheet fixes them.
          this.config = (byte(2) & 0x60) | 0x1f;
          this.phase = { kind: 'silent' };
        }
        return;
      default:
        return;
    }
  }

  private romBit(n: number): 0 | 1 {
    return ((this.rom[n >> 3]! >> (n & 7)) & 1) as 0 | 1;
  }

  private send(bytes: Iterable<number>): void {
    for (const byte of bytes) for (let i = 0; i < 8; i++) this.outgoing.push((byte >> i) & 1);
  }

  private romCommand(command: number): void {
    switch (command) {
      case 0x33: // Read ROM
        this.send(this.rom);
        this.phase = { kind: 'function' };
        return;
      case 0x55: // Match ROM
        this.phase = { kind: 'match', bit: 0, matching: true };
        return;
      case 0xcc: // Skip ROM
        this.phase = { kind: 'function' };
        return;
      case 0xf0: // Search ROM
        this.phase = { kind: 'search', bit: 0, step: 0 };
        return;
      case 0xec: // Alarm Search: only devices with their alarm flag set take part
        this.phase = this.alarm ? { kind: 'search', bit: 0, step: 0 } : { kind: 'silent' };
        return;
      default:
        this.phase = { kind: 'silent' };
    }
  }

  private functionCommand(command: number, now: number): void {
    switch (command) {
      case 0x44: // Convert T: read slots give 0 until it is done, then 1
        this.conversionEndsAt = now + DS18B20_CONVERSION_MS[this.bits];
        this.phase = { kind: 'converting' };
        return;
      case 0xbe: // Read Scratchpad
        this.send(this.scratchpad());
        this.phase = { kind: 'silent' };
        return;
      case 0x4e: // Write Scratchpad: TH, TL, configuration
        this.written = [];
        this.phase = { kind: 'write-scratchpad', bit: 0 };
        return;
      case 0x48: // Copy Scratchpad to EEPROM
        this.eeprom = { th: this.th, tl: this.tl, config: this.config };
        this.phase = { kind: 'status' };
        return;
      case 0xb8: // Recall E2
        this.th = this.eeprom.th;
        this.tl = this.eeprom.tl;
        this.config = this.eeprom.config;
        this.phase = { kind: 'status' };
        return;
      case 0xb4: // Read Power Supply: externally powered, so the line stays high
        this.phase = { kind: 'status' };
        return;
      default:
        this.phase = { kind: 'silent' };
    }
  }

  /** Byte 0–8 of the scratchpad: temperature, TH, TL, configuration, FFh, 0Ch, 10h, CRC. */
  scratchpad(): Uint8Array {
    const bytes = [
      this.temperature & 0xff,
      this.temperature >> 8,
      this.th,
      this.tl,
      this.config,
      0xff,
      0x0c,
      0x10,
    ];
    return Uint8Array.from([...bytes, dallasCrc8(bytes)]);
  }

  /** A conversion that has had its time ends here: the register takes the temperature. */
  private finishConversion(now: number): void {
    if (this.conversionEndsAt === null || now < this.conversionEndsAt) return;
    this.temperature = ds18b20Register(this.celsius, this.bits);
    // Only the whole degrees (bits 11 to 4) are compared with TH and TL.
    const whole = ((this.temperature << 16) >> 16) >> 4;
    const signed = (byte: number) => (byte << 24) >> 24;
    this.alarm = whole <= signed(this.tl) || whole > signed(this.th);
    this.conversionEndsAt = null;
  }
}
