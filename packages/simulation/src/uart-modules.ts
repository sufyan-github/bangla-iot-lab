/**
 * Serial modules that talk to a person as well as to the board: an HC-05
 * Bluetooth module with a phone on the other side, a DFPlayer Mini MP3 player,
 * and a SIM800L GSM module that sends and receives text messages (SMS) on a
 * network the lab makes up. Each exchanges bytes with the board at its baud
 * rate, as the GPS does (see `uart-devices.ts`).
 */
import {
  Outbox,
  garbled,
  type PhoneMessage,
  type UartDevice,
  type UartModuleStatus,
} from './uart-devices';

/** The most messages a phone keeps; older ones scroll away. */
export const PHONE_KEEP = 40;

const encoder = new TextEncoder();
const bytesOf = (text: string) => [...encoder.encode(text)];

/** Text from a board, a byte at a time, split into lines; a part-written line is kept too. */
class LineReader {
  private decoder = new TextDecoder();
  private partial = '';
  constructor(private readonly done: (line: string) => void) {}

  push(bytes: Uint8Array | number[]): void {
    const text = this.decoder.decode(Uint8Array.from(bytes), { stream: true });
    for (const char of text) {
      if (char === '\n') {
        this.done(this.partial.replace(/\r$/, ''));
        this.partial = '';
      } else {
        this.partial += char;
      }
    }
  }

  /** The line still being written, without its carriage return. */
  get pending(): string {
    return this.partial.replace(/\r$/, '');
  }

  reset(): void {
    this.decoder = new TextDecoder();
    this.partial = '';
  }
}

function keep(messages: PhoneMessage[], message: PhoneMessage): void {
  messages.push(message);
  if (messages.length > PHONE_KEEP) messages.splice(0, messages.length - PHONE_KEEP);
}

// ---------------------------------------------------------------------------
// HC-05 Bluetooth module, with a phone paired to it.
// ---------------------------------------------------------------------------

/** REPORTED by sellers of the HC-05: 9600 baud in data mode, as it leaves the factory. */
export const HC05_BAUD = 9600;

export class Hc05 implements UartDevice {
  readonly baud = HC05_BAUD;
  private readonly outbox = new Outbox(HC05_BAUD);
  private readonly messages: PhoneMessage[] = [];
  private readonly lines = new LineReader((text) => keep(this.messages, { from: 'module', text }));
  private lastMs = 0;

  constructor(private connected: boolean) {}

  setConnected(connected: boolean): void {
    if (!connected) this.lines.reset();
    this.connected = connected;
  }

  /** What the board sends goes over the air to the phone, when one is connected. */
  receive(bytes: Uint8Array, baud: number): void {
    if (!this.connected) return;
    this.lines.push(baud === this.baud ? bytes : garbled([...bytes]));
  }

  /** A line typed on the phone: its text and a newline, as most Bluetooth terminal apps send. */
  fromPhone(text: string, timeMs: number): void {
    if (!this.connected) return;
    keep(this.messages, { from: 'phone', text });
    this.outbox.send(bytesOf(`${text}\n`), Math.max(timeMs, this.lastMs));
  }

  transmit(timeMs: number): number[] {
    if (timeMs < this.lastMs) this.reset();
    this.lastMs = timeMs;
    return this.outbox.take(timeMs);
  }

  reset(): void {
    // The phone keeps the conversation; the module loses what it had not passed on.
    this.outbox.clear();
    this.lines.reset();
    this.lastMs = 0;
  }

  status(): UartModuleStatus {
    const pending = this.lines.pending;
    return {
      phone: {
        connected: this.connected,
        messages: pending
          ? [...this.messages, { from: 'module', text: pending }]
          : [...this.messages],
      },
    };
  }
}

// ---------------------------------------------------------------------------
// DFPlayer Mini MP3 player.
// ---------------------------------------------------------------------------

/** REPORTED by DFRobot: 9600 baud. */
export const MP3_BAUD = 9600;
/** The lab's memory card holds short tracks of this length: the lab's choice, not the module's. */
export const MP3_TRACK_MS = 8000;
/** ESTIMATE: how long the module takes to read its card after power-up or a reset. */
export const MP3_START_MS = 1000;
/** ESTIMATE: its volume (0 to 30) when it starts. */
export const MP3_START_VOLUME = 25;

/**
 * A ten-byte message as DFRobot's manual gives it: 7Eh, FFh, a length of 6, the
 * command, whether an acknowledgement is wanted, a 16-bit parameter, a 16-bit
 * checksum (the negated sum of the six bytes after 7Eh), and EFh.
 */
export function mp3Message(command: number, parameter = 0, feedback = 0): number[] {
  const body = [0xff, 0x06, command, feedback, (parameter >> 8) & 0xff, parameter & 0xff];
  const sum = -body.reduce((a, b) => a + b, 0) & 0xffff;
  return [0x7e, ...body, sum >> 8, sum & 0xff, 0xef];
}

/** Commands and replies, from DFRobot's manual. */
export const MP3 = {
  next: 0x01,
  previous: 0x02,
  track: 0x03,
  volumeUp: 0x04,
  volumeDown: 0x05,
  volume: 0x06,
  eq: 0x07,
  loopTrack: 0x08,
  device: 0x09,
  sleep: 0x0a,
  reset: 0x0c,
  play: 0x0d,
  pause: 0x0e,
  folder: 0x0f,
  stop: 0x16,
  finished: 0x3d,
  online: 0x3f,
  error: 0x40,
  ack: 0x41,
  queryState: 0x42,
  queryVolume: 0x43,
  queryEq: 0x44,
  queryFiles: 0x48,
  queryTrack: 0x4c,
} as const;

/** Error codes sent with 40h; the lab's library gives them the names DFRobot's examples use. */
const MP3_BUSY = 1;
const MP3_FILE_INDEX_OUT = 5;

export class Mp3Player implements UartDevice {
  readonly baud = MP3_BAUD;
  private readonly outbox = new Outbox(MP3_BAUD);
  private command: number[] = [];
  private lastMs = 0;
  /** When it will have read its card; before then it answers only that it is busy. */
  private readyAt = MP3_START_MS;
  private announced = false;
  private track = 0;
  private playing = false;
  /** How far into the track it has played, as of `since`. */
  private position = 0;
  private since = 0;
  private volume = MP3_START_VOLUME;
  private eq = 0;
  private loopTrack = false;

  constructor(private tracks: number) {}

  setTracks(tracks: number): void {
    this.tracks = tracks;
  }

  /** Moves time on: says it is ready, and finishes a track that has run its length. */
  private advance(timeMs: number): void {
    if (timeMs < this.lastMs) this.reset();
    this.lastMs = timeMs;
    if (!this.announced && timeMs >= this.readyAt) {
      this.announced = true;
      // "Card online": the parameter says which storage it found (2, a memory card).
      this.outbox.send(mp3Message(MP3.online, 0x0002), this.readyAt);
    }
    if (this.playing && this.position + (timeMs - this.since) >= MP3_TRACK_MS) {
      const endedAt = this.since + (MP3_TRACK_MS - this.position);
      if (this.loopTrack) {
        this.position = 0;
        this.since = endedAt;
      } else {
        this.playing = false;
        this.position = 0;
        this.outbox.send(mp3Message(MP3.finished, this.track), endedAt);
      }
    }
  }

  private start(track: number, timeMs: number): void {
    this.track = track;
    this.playing = true;
    this.position = 0;
    this.since = timeMs;
  }

  receive(bytes: Uint8Array, baud: number, timeMs: number): void {
    this.advance(timeMs);
    if (baud !== this.baud) return;
    for (const byte of bytes) {
      this.command.push(byte);
      if (this.command[0] !== 0x7e) {
        this.command = [];
        continue;
      }
      if (this.command.length < 10) continue;
      const message = this.command;
      this.command = [];
      const sum = -message.slice(1, 7).reduce((a, b) => a + b, 0) & 0xffff;
      if (message[9] !== 0xef || ((message[7]! << 8) | message[8]!) !== sum) continue;
      this.obey(message[3]!, (message[5]! << 8) | message[6]!, message[4] === 1, timeMs);
    }
  }

  private obey(command: number, parameter: number, feedback: boolean, timeMs: number): void {
    const reply = (code: number, value = 0) => this.outbox.send(mp3Message(code, value), timeMs);
    if (command === MP3.reset) {
      this.reset();
      this.lastMs = timeMs;
      this.readyAt = timeMs + MP3_START_MS;
      return;
    }
    if (timeMs < this.readyAt) {
      reply(MP3.error, MP3_BUSY);
      return;
    }
    if (feedback) reply(MP3.ack);
    const elapsed = () => this.position + (timeMs - this.since);
    switch (command) {
      case MP3.next:
        this.start((this.track % this.tracks) + 1, timeMs);
        break;
      case MP3.previous:
        this.start(this.track > 1 ? this.track - 1 : this.tracks, timeMs);
        break;
      case MP3.track:
      case MP3.loopTrack:
      case MP3.folder: {
        // A folder's files are not modelled: the file number picks the track.
        const track = command === MP3.folder ? parameter & 0xff : parameter;
        if (track < 1 || track > this.tracks) {
          reply(MP3.error, MP3_FILE_INDEX_OUT);
          break;
        }
        this.loopTrack = command === MP3.loopTrack;
        this.start(track, timeMs);
        break;
      }
      case MP3.volumeUp:
        this.volume = Math.min(30, this.volume + 1);
        break;
      case MP3.volumeDown:
        this.volume = Math.max(0, this.volume - 1);
        break;
      case MP3.volume:
        this.volume = Math.min(30, parameter);
        break;
      case MP3.eq:
        this.eq = parameter % 6;
        break;
      case MP3.play:
        if (this.playing) break;
        if (this.track === 0) this.start(1, timeMs);
        else {
          this.playing = true;
          this.since = timeMs;
        }
        break;
      case MP3.pause:
        if (this.playing) {
          this.position = elapsed();
          this.playing = false;
        }
        break;
      case MP3.stop:
      case MP3.sleep:
        this.playing = false;
        this.position = 0;
        break;
      case MP3.queryState:
        // 2 in the high byte for the memory card; 1 playing, 2 paused, 0 stopped.
        reply(command, 0x0200 | (this.playing ? 1 : this.position > 0 ? 2 : 0));
        break;
      case MP3.queryVolume:
        reply(command, this.volume);
        break;
      case MP3.queryEq:
        reply(command, this.eq);
        break;
      case MP3.queryFiles:
        reply(command, this.tracks);
        break;
      case MP3.queryTrack:
        reply(command, this.track);
        break;
      default:
        // Other commands (the output device, repeat-all, shuffle) are accepted and change nothing here.
        break;
    }
  }

  transmit(timeMs: number): number[] {
    this.advance(timeMs);
    return this.outbox.take(timeMs);
  }

  reset(): void {
    this.outbox.clear();
    this.command = [];
    this.lastMs = 0;
    this.readyAt = MP3_START_MS;
    this.announced = false;
    this.track = 0;
    this.playing = false;
    this.position = 0;
    this.volume = MP3_START_VOLUME;
    this.eq = 0;
    this.loopTrack = false;
  }

  status(timeMs: number): UartModuleStatus {
    if (timeMs >= this.lastMs) this.advance(timeMs);
    return {
      player: {
        track: this.track,
        playing: this.playing,
        volume: this.volume,
        ready: this.lastMs >= this.readyAt,
      },
    };
  }
}

// ---------------------------------------------------------------------------
// SIM800L GSM module, on a network the lab makes up.
// ---------------------------------------------------------------------------

/** The number of the lab's own phone, which sends SMS to the module: not a real number. */
export const LAB_PHONE_NUMBER = '+8801000000000';
/** ESTIMATE: how long it takes to find the network after power-up. */
export const GSM_REGISTER_MS = 3000;
/** ESTIMATE: how long sending one SMS takes. */
export const GSM_SMS_MS = 3000;
/** Baud rates the module can lock on to (REPORTED by SIMCom: auto-bauding from 1200 to 115200). */
const GSM_BAUDS = [1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200];
/** The date the lab's network gives, as the GPS's: an example. */
const NETWORK_START_UTC = Date.UTC(2026, 10, 23, 6, 0, 0);

interface StoredSms {
  number: string;
  text: string;
  read: boolean;
  at: number;
}

/**
 * Its text-mode character set is GSM 7-bit: plain Latin letters, digits and
 * signs arrive; anything else (Bangla, for one) is not modelled and becomes "?".
 */
function gsmText(text: string): string {
  return text.replace(/[^\x20-\x7e\n]/g, '?');
}

export class Sim800l implements UartDevice {
  /** It answers at the rate of the first "AT" it hears; until then it waits. */
  private synced: number | null = null;
  private outbox = new Outbox(9600);
  private outboxBaud = 9600;
  private lastMs = 0;
  private line = '';
  private echo = true;
  private textMode = false;
  /** How new messages are announced: 1 stored, with +CMTI; 2 sent straight to the board, with +CMT. */
  private newMessages = 1;
  /** The number an SMS is being written to, after AT+CMGS. */
  private composing: string | null = null;
  private body: number[] = [];
  private sent = 0;
  private readonly stored = new Map<number, StoredSms>();
  private readonly messages: PhoneMessage[] = [];

  constructor(private signal: number) {}

  get baud(): number {
    return this.synced ?? 9600;
  }

  setSignal(signal: number): void {
    this.signal = signal;
  }

  private registered(timeMs: number): boolean {
    return this.signal > 0 && timeMs >= GSM_REGISTER_MS;
  }

  private outboxFor(baud: number): Outbox {
    if (baud !== this.outboxBaud) {
      // An Outbox has one speed; the module locks on to a rate once after each start.
      this.outbox = new Outbox(baud);
      this.outboxBaud = baud;
    }
    return this.outbox;
  }

  private say(text: string, timeMs: number): void {
    this.outboxFor(this.baud).send(bytesOf(text), timeMs);
  }

  private stamp(timeMs: number): string {
    const time = new Date(NETWORK_START_UTC + timeMs);
    const two = (n: number) => String(n).padStart(2, '0');
    return `${two(time.getUTCFullYear() % 100)}/${two(time.getUTCMonth() + 1)}/${two(time.getUTCDate())},${two(time.getUTCHours())}:${two(time.getUTCMinutes())}:${two(time.getUTCSeconds())}+24`;
  }

  receive(bytes: Uint8Array, baud: number, timeMs: number): void {
    if (timeMs < this.lastMs) this.reset();
    this.lastMs = timeMs;
    if (this.synced === null) {
      // Auto-bauding: it learns the rate from "AT" (REPORTED by SIMCom); other bytes are lost.
      if (!GSM_BAUDS.includes(baud)) return;
      const text = String.fromCharCode(...bytes).toUpperCase();
      const at = text.indexOf('AT');
      if (at < 0) return;
      this.synced = baud;
      bytes = bytes.subarray(at);
    } else if (baud !== this.synced) {
      return;
    }
    for (const byte of bytes) this.take(byte, timeMs);
  }

  private take(byte: number, timeMs: number): void {
    if (this.composing !== null) {
      if (byte === 0x1a) {
        this.finishSms(timeMs);
      } else if (byte === 0x1b) {
        this.composing = null;
        this.body = [];
        this.say('\r\nOK\r\n', timeMs);
      } else if (byte === 0x0a && this.body.length === 0) {
        // The line feed after the command's carriage return ends the command line, not the text.
      } else {
        if (this.echo) this.outboxFor(this.baud).send([byte], timeMs);
        this.body.push(byte);
      }
      return;
    }
    if (this.echo && byte !== 0x0a) this.outboxFor(this.baud).send([byte], timeMs);
    if (byte === 0x0d) {
      const line = this.line.trim();
      this.line = '';
      if (line) this.command(line, timeMs);
    } else if (byte !== 0x0a) {
      this.line += String.fromCharCode(byte);
    }
  }

  private command(line: string, timeMs: number): void {
    const upper = line.toUpperCase();
    const ok = (info?: string) =>
      this.say(info ? `\r\n${info}\r\n\r\nOK\r\n` : '\r\nOK\r\n', timeMs);
    const error = () => this.say('\r\nERROR\r\n', timeMs);
    if (!upper.startsWith('AT')) return error();
    const rest = upper.slice(2);
    let match: RegExpMatchArray | null;
    if (rest === '') return ok();
    if (rest === 'E0' || rest === 'E1') {
      this.echo = rest === 'E1';
      return ok();
    }
    if (rest === 'I') return ok('SIM800 R14.18');
    if (rest === '+CSQ') return ok(`+CSQ: ${this.signal > 0 ? this.signal : 99},0`);
    if (rest === '+CREG?') return ok(`+CREG: 0,${this.registered(timeMs) ? 1 : 2}`);
    if (rest === '+CPIN?') return ok('+CPIN: READY');
    if (rest === '+COPS?') {
      return ok(this.registered(timeMs) ? '+COPS: 0,0,"LAB NETWORK"' : '+COPS: 0');
    }
    if ((match = rest.match(/^\+CMGF=([01])$/))) {
      this.textMode = match[1] === '1';
      return ok();
    }
    if (rest === '+CMGF?') return ok(`+CMGF: ${this.textMode ? 1 : 0}`);
    if (/^\+CSCS=/.test(rest)) return ok();
    if ((match = rest.match(/^\+CNMI=\d,(\d)/))) {
      this.newMessages = Number(match[1]);
      return ok();
    }
    if ((match = line.slice(2).match(/^\+CMGS="([+\d]+)"$/i))) {
      if (!this.textMode) return error();
      this.composing = match[1]!;
      this.body = [];
      return this.say('\r\n> ', timeMs);
    }
    if ((match = rest.match(/^\+CMGR=(\d+)$/))) {
      const sms = this.stored.get(Number(match[1]));
      if (!sms || !this.textMode) return ok();
      const state = sms.read ? 'REC READ' : 'REC UNREAD';
      sms.read = true;
      return ok(`+CMGR: "${state}","${sms.number}","","${this.stamp(sms.at)}"\r\n${sms.text}`);
    }
    if ((match = rest.match(/^\+CMGD=(\d+)(?:,(\d))?$/))) {
      if (match[2] && match[2] !== '0') this.stored.clear();
      else this.stored.delete(Number(match[1]));
      return ok();
    }
    if (/^\+CMGDA=/.test(rest)) {
      this.stored.clear();
      return ok();
    }
    return error();
  }

  private finishSms(timeMs: number): void {
    const number = this.composing!;
    const text = gsmText(new TextDecoder().decode(Uint8Array.from(this.body)));
    this.composing = null;
    this.body = [];
    if (!this.registered(timeMs)) {
      // 331 is "no network service" in the GSM standard's list of SMS errors.
      this.say('\r\n+CMS ERROR: 331\r\n', timeMs);
      return;
    }
    keep(this.messages, { from: 'module', text, number });
    this.sent = (this.sent % 255) + 1;
    this.say(`\r\n+CMGS: ${this.sent}\r\n\r\nOK\r\n`, timeMs + GSM_SMS_MS);
  }

  /** An SMS from the lab's phone. Without a network it is not delivered. */
  fromPhone(text: string, timeMs: number): void {
    const now = Math.max(timeMs, this.lastMs);
    if (!this.registered(now) || this.synced === null) {
      keep(this.messages, { from: 'phone', text, number: LAB_PHONE_NUMBER, undelivered: true });
      return;
    }
    keep(this.messages, { from: 'phone', text, number: LAB_PHONE_NUMBER });
    const body = gsmText(text);
    if (this.newMessages === 2 && this.textMode) {
      this.say(`\r\n+CMT: "${LAB_PHONE_NUMBER}","","${this.stamp(now)}"\r\n${body}\r\n`, now);
      return;
    }
    let index = 1;
    while (this.stored.has(index)) index++;
    this.stored.set(index, { number: LAB_PHONE_NUMBER, text: body, read: false, at: now });
    this.say(`\r\n+CMTI: "SM",${index}\r\n`, now);
  }

  transmit(timeMs: number): number[] {
    if (timeMs < this.lastMs) this.reset();
    this.lastMs = timeMs;
    return this.outbox.take(timeMs);
  }

  reset(): void {
    // Messages kept on the SIM card, and the phone's conversation, survive a restart.
    this.synced = null;
    this.outbox.clear();
    this.lastMs = 0;
    this.line = '';
    this.echo = true;
    this.textMode = false;
    this.newMessages = 1;
    this.composing = null;
    this.body = [];
  }

  status(timeMs: number): UartModuleStatus {
    const registered = this.registered(Math.max(timeMs, this.lastMs));
    return {
      phone: { connected: registered, messages: [...this.messages] },
      network: { registered, signal: this.signal },
    };
  }
}
