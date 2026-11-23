/**
 * Modules on a serial line (UART): what each sends and when, a byte at a time
 * at its baud rate, and what it does with what it is sent.
 */

/** A module on a UART. Times are the board's clock, in milliseconds. */
export interface UartDevice {
  readonly baud: number;
  /** Bytes from the board, at the board's baud rate. */
  receive(bytes: Uint8Array, baud: number, timeMs: number): void;
  /** Bytes it has sent since the last call, up to `timeMs`. */
  transmit(timeMs: number): number[];
  /** As when switched on. */
  reset(): void;
  /** Text typed on the phone (Bluetooth or SMS), arriving at `timeMs`. */
  fromPhone?(text: string, timeMs: number): void;
  /** What it shows at `timeMs`, merged into its reading. */
  status?(timeMs: number): UartModuleStatus;
}

/** One message in a phone's conversation with a module. */
export interface PhoneMessage {
  /** Who wrote it: the phone, or the module (that is, the board's program). */
  from: 'phone' | 'module';
  text: string;
  /** For an SMS, the other side's number. */
  number?: string;
  /** An SMS that did not arrive: the module had no network. */
  undelivered?: boolean;
}

export interface UartModuleStatus {
  phone?: { connected: boolean; messages: PhoneMessage[] };
  player?: { track: number; playing: boolean; volume: number; ready: boolean };
  network?: { registered: boolean; signal: number };
}

/** Milliseconds a byte takes on the wire: a start bit, eight data bits and a stop bit. */
export const byteMs = (baud: number) => 10_000 / baud;

/**
 * What a board receives when its UART runs at a different speed from the
 * module's: not the bytes sent, but bits sampled at the wrong times. Not
 * modelled bit by bit; each byte arrives as some other byte.
 */
export function garbled(bytes: number[]): number[] {
  return bytes.map((byte) => ((byte * 37 + 11) & 0x7f) | 0x80);
}

/** Bytes to send, each with the time its stop bit ends. */
export class Outbox {
  private queue: { at: number; byte: number }[] = [];
  private freeAt = 0;
  constructor(private readonly baud: number) {}

  /** Sends `bytes` one after another, starting at `timeMs` or when the line is free. */
  send(bytes: Iterable<number>, timeMs: number): void {
    let at = Math.max(timeMs, this.freeAt);
    for (const byte of bytes) {
      at += byteMs(this.baud);
      this.queue.push({ at, byte });
    }
    this.freeAt = at;
  }

  take(timeMs: number): number[] {
    const out: number[] = [];
    while (this.queue.length && this.queue[0]!.at <= timeMs) out.push(this.queue.shift()!.byte);
    return out;
  }

  clear(): void {
    this.queue = [];
    this.freeAt = 0;
  }
}

// ---------------------------------------------------------------------------
// NEO-6M GPS receiver.
// ---------------------------------------------------------------------------

export interface GpsSky {
  /** Whether it can see enough satellites for a position. */
  fix: boolean;
  lat: number;
  lng: number;
  satellites: number;
}

/** REPORTED by u-blox for the NEO-6: NMEA at 9600 baud, once a second, as it starts. */
export const GPS_BAUD = 9600;
/** The date the lab's GPS starts on: an example, as the lab has no clock of its own. */
const GPS_START_UTC = Date.UTC(2026, 10, 23, 6, 0, 0);

/** "$GPRMC,...*hh\r\n": the body with its XOR checksum. */
export function nmea(body: string): string {
  let sum = 0;
  for (const char of body) sum ^= char.charCodeAt(0);
  return `$${body}*${sum.toString(16).toUpperCase().padStart(2, '0')}\r\n`;
}

/** Degrees as NMEA writes them: ddmm.mmmmm or dddmm.mmmmm, and the hemisphere. */
function nmeaDegrees(value: number, longitude: boolean): [string, string] {
  const hemisphere = longitude ? (value < 0 ? 'W' : 'E') : value < 0 ? 'S' : 'N';
  const absolute = Math.abs(value);
  let whole = Math.floor(absolute);
  let minutes = Number(((absolute - whole) * 60).toFixed(5));
  if (minutes >= 60) {
    whole += 1;
    minutes -= 60;
  }
  const degrees = String(whole).padStart(longitude ? 3 : 2, '0');
  return [`${degrees}${minutes.toFixed(5).padStart(8, '0')}`, hemisphere];
}

/**
 * The sentences a NEO-6M sends in one second, in its default order: RMC, VTG,
 * GGA, GSA, GLL. Without a fix the position fields are empty and the status
 * says so, as on the real receiver.
 */
export function gpsBurst(sky: GpsSky, second: number): string {
  const time = new Date(GPS_START_UTC + second * 1000);
  const two = (n: number) => String(n).padStart(2, '0');
  const hhmmss = `${two(time.getUTCHours())}${two(time.getUTCMinutes())}${two(time.getUTCSeconds())}.00`;
  const ddmmyy = `${two(time.getUTCDate())}${two(time.getUTCMonth() + 1)}${two(time.getUTCFullYear() % 100)}`;
  const [lat, ns] = sky.fix ? nmeaDegrees(sky.lat, false) : ['', ''];
  const [lng, ew] = sky.fix ? nmeaDegrees(sky.lng, true) : ['', ''];
  const satellites = two(sky.fix ? Math.max(4, sky.satellites) : Math.min(3, sky.satellites));
  return [
    nmea(
      `GPRMC,${hhmmss},${sky.fix ? 'A' : 'V'},${lat},${ns},${lng},${ew},0.000,,${ddmmyy},,,${sky.fix ? 'A' : 'N'}`,
    ),
    nmea(`GPVTG,,T,,M,0.000,N,0.000,K,${sky.fix ? 'A' : 'N'}`),
    nmea(
      `GPGGA,${hhmmss},${lat},${ns},${lng},${ew},${sky.fix ? 1 : 0},${satellites},${sky.fix ? '1.20' : '99.99'},${sky.fix ? '9.0,M,-51.0,M' : ',,,'},,`,
    ),
    nmea(
      `GPGSA,A,${sky.fix ? 3 : 1},,,,,,,,,,,,,${sky.fix ? '2.10,1.20,1.70' : '99.99,99.99,99.99'}`,
    ),
    nmea(`GPGLL,${lat},${ns},${lng},${ew},${hhmmss},${sky.fix ? 'A,A' : 'V,N'}`),
  ].join('');
}

export class Neo6m implements UartDevice {
  readonly baud = GPS_BAUD;
  private readonly outbox = new Outbox(GPS_BAUD);
  /** The last second whose sentences have been queued. */
  private second = 0;

  constructor(private sky: GpsSky) {}

  setSky(sky: GpsSky): void {
    this.sky = sky;
  }

  receive(): void {
    // Configuration messages (UBX) are not modelled: the receiver keeps its defaults.
  }

  private lastMs = 0;

  transmit(timeMs: number): number[] {
    // A board started again has its clock back at 0: the module starts over with it.
    if (timeMs < this.lastMs) this.reset();
    this.lastMs = timeMs;
    // Each second starts a new burst of sentences, the first one second after power-up.
    while ((this.second + 1) * 1000 <= timeMs) {
      this.second += 1;
      const text = gpsBurst(this.sky, this.second);
      this.outbox.send(
        Array.from(text, (c) => c.charCodeAt(0)),
        this.second * 1000,
      );
    }
    return this.outbox.take(timeMs);
  }

  reset(): void {
    this.outbox.clear();
    this.second = 0;
    this.lastMs = 0;
  }
}

// ---------------------------------------------------------------------------
// PMS5003 particle sensor.
// ---------------------------------------------------------------------------

/** REPORTED by the PMS library (fu-hsi, 1.1.0), which follows Plantower's protocol. */
export const PMS_BAUD = 9600;
/** ESTIMATE: a frame about once a second in active mode (Plantower gives 200 ms to 2.3 s). */
export const PMS_ACTIVE_INTERVAL_MS = 1000;

/**
 * A data frame: 42h 4Dh, a length of 28, thirteen 16-bit words high byte first
 * (PM1.0, PM2.5 and PM10 at CF=1, the same in the atmosphere, six particle
 * counts and a reserved word), then the sum of every byte before it.
 */
export function pmsFrame(pm25: number): Uint8Array {
  const round = (n: number) => Math.max(0, Math.min(0xffff, Math.round(n)));
  // ESTIMATE: PM1.0 and PM10 in proportion to PM2.5, and counts in proportion to them.
  const pm1 = round(pm25 * 0.7);
  const pm2 = round(pm25);
  const pm10 = round(pm25 * 1.3);
  const words = [
    pm1,
    pm2,
    pm10,
    pm1,
    pm2,
    pm10,
    round(pm25 * 150),
    round(pm25 * 45),
    round(pm25 * 8),
    round(pm25 * 1),
    round(pm25 * 0.3),
    round(pm25 * 0.1),
    0,
  ];
  const bytes = [0x42, 0x4d, 0x00, 0x1c];
  for (const word of words) bytes.push(word >> 8, word & 0xff);
  const sum = bytes.reduce((a, b) => a + b, 0) & 0xffff;
  bytes.push(sum >> 8, sum & 0xff);
  return Uint8Array.from(bytes);
}

export class Pms5003 implements UartDevice {
  readonly baud = PMS_BAUD;
  private readonly outbox = new Outbox(PMS_BAUD);
  private active = true;
  private asleep = false;
  /** The next time an active-mode frame is due. */
  private nextFrameAt = PMS_ACTIVE_INTERVAL_MS;
  /** Bytes of a command still being received. */
  private command: number[] = [];

  constructor(private pm25: number) {}

  setPm25(pm25: number): void {
    this.pm25 = pm25;
  }

  /** Commands: 42h 4Dh, the command, two data bytes, a 16-bit sum. */
  receive(bytes: Uint8Array, baud: number, timeMs: number): void {
    if (baud !== this.baud) return;
    for (const byte of bytes) {
      this.command.push(byte);
      if (this.command.length === 1 && byte !== 0x42) this.command = [];
      if (this.command.length === 2 && byte !== 0x4d) this.command = [];
      if (this.command.length < 7) continue;
      const [, , code, , value] = this.command as [number, number, number, number, number];
      this.command = [];
      if (code === 0xe1) {
        this.active = value === 1;
        this.nextFrameAt = timeMs + PMS_ACTIVE_INTERVAL_MS;
      } else if (code === 0xe2 && !this.active && !this.asleep) {
        this.outbox.send(pmsFrame(this.pm25), timeMs);
      } else if (code === 0xe4) {
        this.asleep = value === 0;
        this.nextFrameAt = timeMs + PMS_ACTIVE_INTERVAL_MS;
      }
    }
  }

  private lastMs = 0;

  transmit(timeMs: number): number[] {
    if (timeMs < this.lastMs) this.reset();
    this.lastMs = timeMs;
    while (this.active && !this.asleep && this.nextFrameAt <= timeMs) {
      this.outbox.send(pmsFrame(this.pm25), this.nextFrameAt);
      this.nextFrameAt += PMS_ACTIVE_INTERVAL_MS;
    }
    if (!this.active || this.asleep) this.nextFrameAt = Math.max(this.nextFrameAt, timeMs);
    return this.outbox.take(timeMs);
  }

  reset(): void {
    this.outbox.clear();
    this.active = true;
    this.asleep = false;
    this.nextFrameAt = PMS_ACTIVE_INTERVAL_MS;
    this.command = [];
    this.lastMs = 0;
  }
}
