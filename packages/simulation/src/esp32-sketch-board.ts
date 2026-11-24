import type {
  HttpResponse,
  I2cHandler,
  LedStripHandler,
  OneWireHandler,
  SpiHandler,
  UartHandler,
  PinDrive,
  PinListener,
  ProgrammableBoard,
} from '@banglalab/board-emulators';
import {
  ESP32_ADC_ATTENUATIONS,
  ESP32_DEVKIT_PINS,
  esp32AnalogRead,
  type Esp32AdcUnit,
} from './esp32-pins';

/**
 * An ESP32 board whose program is a sketch compiled against the lab's own
 * board library (spikes/esp32-api) into a WebAssembly module.
 *
 * EXPERIMENTAL. This is not the ESP32's own software: the student's code runs
 * exactly, and what the board does in answer is this file's model of it. Known
 * differences from a real board:
 * - code takes no time to run; each library call is charged 2 µs;
 * - an interrupt is delivered between two millisecond slices of the simulation,
 *   not at the instant of the edge;
 * - a PWM output faster than 2 kHz is shown switching at 2 kHz, with its duty kept;
 * - no I2C, SPI, Wi-Fi or Bluetooth.
 * The analog converter follows the pin model (esp32-pins.ts), not an ideal one.
 *
 * The module must be built pausable (binaryen's asyncify over the host calls
 * that let time pass), because a sketch's loop never returns and the
 * simulation runs it a slice at a time.
 */

// Pin modes and interrupt edges, as the library's Arduino.h defines them.
const INPUT = 0x01;
const OUTPUT = 0x03;
const PULLUP = 0x04;
const PULLDOWN = 0x08;
const OPEN_DRAIN = 0x10;
const RISING = 1;
const FALLING = 2;
const CHANGE = 3;

const PINS = 40;
/** Board time charged for one library call, microseconds. */
const CALL_COST_US = 2;
/** ESTIMATE: how long a station takes to join a network, from WiFi.begin(). */
const WIFI_JOIN_US = 1_500_000;
const WL_CONNECTED = 3;
const WL_DISCONNECTED = 6;
/** The addresses the lab gives: on the lab's made-up network, and as an access point. */
const STATION_ADDRESS = 192 | (168 << 8) | (1 << 16) | (50 << 24);
const AP_ADDRESS = 192 | (168 << 8) | (4 << 16) | (1 << 24);
/** Requests that may wait for the program, and the longest answer kept. */
const MAX_HTTP_QUEUE = 4;
const MAX_HTTP_BODY = 64 * 1024;
/** Bytes a UART's receive buffer holds, as Espressif's core sets it by default. */
const UART_BUFFER_BYTES = 256;
/** Fastest switching shown for a PWM output, hertz. Its duty is kept whatever the frequency. */
const PWM_SHOWN_HZ = 2000;
/** Room for the call stack of a paused sketch, bytes. */
const PAUSE_STACK_BYTES = 16 * 1024;

const ADC_OF_GPIO = new Map<number, Esp32AdcUnit>(
  ESP32_DEVKIT_PINS.flatMap((pin) =>
    pin.gpio !== null && pin.adc ? [[pin.gpio, pin.adc.unit] as const] : [],
  ),
);

interface Pwm {
  /** Fraction of the time the pin is HIGH, 0 to 1. */
  duty: number;
  /** The frequency the sketch asked for, hertz. */
  frequency: number;
  /** Length of one shown cycle, microseconds. */
  periodUs: number;
  /** Board time at which the present cycle began. */
  cycleStart: number;
}

interface Exports {
  memory: WebAssembly.Memory;
  __indirect_function_table: WebAssembly.Table;
  _initialize?: () => void;
  run: () => void;
  malloc: (bytes: number) => number;
  asyncify_start_unwind: (data: number) => void;
  asyncify_stop_unwind: () => void;
  asyncify_start_rewind: (data: number) => void;
  asyncify_stop_rewind: () => void;
}

export class Esp32SketchBoard implements ProgrammableBoard {
  /** Board time, microseconds. */
  private now = 0;
  /** The time `runUntil` is running to. */
  private target = 0;
  /** While the sketch is paused inside a wait: the board time at which that wait ends. */
  private wakeAt: number | null = null;
  private started = false;
  private finished: string | null = null;
  /** True while an interrupt handler runs: it is never paused. */
  private inHandler = false;

  private readonly mode = new Int32Array(PINS);
  private readonly outputLevel = new Int32Array(PINS);
  private readonly inputLevel = new Int32Array(PINS);
  /**
   * What a pin should read after the sketch changed it, until the circuit has
   * answered: the simulation shows the board the circuit once a millisecond,
   * and a sketch may read a pin in the same instant it sets its pull-up.
   * -1 where there is nothing to assume.
   */
  private readonly assumed = new Int8Array(PINS).fill(-1);
  private readonly volts = new Float64Array(PINS);
  private readonly handler = new Int32Array(PINS);
  private readonly handlerMode = new Int32Array(PINS);
  private readonly pwm = new Map<number, Pwm>();
  /** What each pin was last reported as driving. */
  private readonly reported: PinDrive[] = new Array<PinDrive>(PINS).fill('input');
  private readonly typed: number[] = [];
  /** A pulseIn() in progress: which pin and level, when it began, and where it has got to. */
  private pulse: { pin: number; level: number; deadline: number; startedAt: number | null } | null =
    null;

  private readonly pinListeners = new Set<PinListener>();
  private readonly serialListeners = new Set<(text: string) => void>();
  private i2c: I2cHandler | null = null;
  private oneWire: OneWireHandler | null = null;
  private uart: UartHandler | null = null;
  private spi: SpiHandler | null = null;
  private ledStrip: LedStripHandler | null = null;
  /** Each UART the program has begun, and the bytes that have arrived and wait to be read. */
  private readonly uarts = new Map<
    number,
    { baud: number; rx: number; tx: number; buffer: number[] }
  >();
  private readonly decoder = new TextDecoder();
  private exports!: Exports;
  private pauseData = 0;
  /** The compiled sketch and what it is given, kept to start it again after deep sleep. */
  private readonly module: WebAssembly.Module;
  private readonly imports: WebAssembly.Imports;
  /**
   * While in deep sleep: the bytes of the sketch's RTC_DATA_ATTR variables and
   * where they go, and what wakes the board (a time, a pin's level, or both).
   */
  private sleeping: {
    rtcPointer: number;
    rtc: Uint8Array;
    wakeAt: number | null;
    ext0: { pin: number; level: number } | null;
  } | null = null;
  /** Why the board last started: ESP-IDF's numbers, 0 at power-on, 4 a timer, 2 a pin (ext0). */
  private wakeCause = 0;

  /**
   * Wi-Fi as the lab models it: mode 1 a station on a network, 2 the board's own
   * access point; the time the station started joining, in microseconds.
   */
  private wifi = { mode: 0, ssid: '', since: 0 };
  /** The web server's port once it listens, its waiting requests, and the one taken last. */
  private httpPort: number | null = null;
  private readonly httpQueue: { id: number; path: string }[] = [];
  private httpCurrent: { id: number; path: string } | null = null;
  private nextHttpId = 1;
  private readonly httpListeners = new Set<(response: HttpResponse) => void>();

  /** The saved settings (Preferences), as UTF-8 text, and who wants to hear of changes. */
  private settings: Uint8Array;
  private readonly settingsListeners = new Set<(settings: string) => void>();

  /**
   * Throws if the bytes are not a sketch module built pausable for this board.
   * `settings` are the saved settings the board starts with, as kept from before.
   */
  constructor(bytes: BufferSource, settings = '') {
    this.settings = new TextEncoder().encode(settings);
    const module = new WebAssembly.Module(bytes);
    this.module = module;
    const env: Record<string, (...args: never[]) => unknown> = {
      host_settings_load: (pointer: number, capacity: number) => {
        if (pointer) {
          const length = Math.min(capacity >>> 0, this.settings.length);
          new Uint8Array(this.exports.memory.buffer, pointer, length).set(
            this.settings.subarray(0, length),
          );
        }
        return this.settings.length;
      },
      host_settings_save: (pointer: number, length: number) => {
        this.settings = new Uint8Array(this.exports.memory.buffer, pointer, length >>> 0).slice();
        const text = new TextDecoder().decode(this.settings);
        for (const listener of this.settingsListeners) listener(text);
      },
      host_pin_mode: (pin: number, mode: number) => this.pinMode(pin, mode),
      host_digital_write: (pin: number, level: number) => this.digitalWrite(pin, level),
      host_digital_read: (pin: number) => this.digitalRead(pin),
      host_analog_read: (pin: number, attenuation: number, bits: number) =>
        this.analog(pin, attenuation, bits).count,
      host_analog_read_millivolts: (pin: number, attenuation: number) =>
        this.analog(pin, attenuation, 12).millivolts,
      host_pwm: (pin: number, duty: number, maxDuty: number, frequency: number) =>
        this.setPwm(pin, (duty >>> 0) / Math.max(1, maxDuty >>> 0), frequency),
      host_touch_read: () => 60, // nothing touches a pad in the lab yet
      host_pulse_in: (pin: number, level: number, timeout: number) =>
        this.pulseIn(pin, level, timeout >>> 0),
      host_attach_interrupt: (pin: number, fn: number, mode: number) => {
        if (!valid(pin)) return;
        this.handler[pin] = fn;
        this.handlerMode[pin] = mode;
      },
      host_detach_interrupt: (pin: number) => {
        if (valid(pin)) this.handler[pin] = 0;
      },
      host_serial_write: (pointer: number, length: number) => {
        const bytes = new Uint8Array(this.exports.memory.buffer, pointer, length >>> 0).slice();
        const text = this.decoder.decode(bytes, { stream: true });
        if (text) for (const listener of this.serialListeners) listener(text);
      },
      host_i2c_transfer: (
        sda: number,
        scl: number,
        address: number,
        writePointer: number,
        writeLength: number,
        readPointer: number,
        readLength: number,
      ) => {
        if (!this.i2c) return 2; // nothing is listening on any bus
        const memory = () => new Uint8Array(this.exports.memory.buffer);
        const write = memory().slice(writePointer, writePointer + (writeLength >>> 0));
        const result = this.i2c({ sda, scl, address, write, readLength: readLength >>> 0 });
        if (result.status === 0 && result.read && readLength > 0) {
          memory().set(result.read.subarray(0, readLength >>> 0), readPointer);
        }
        return result.status;
      },
      host_onewire: (pin: number, op: number, value: number) => {
        // Nothing listening: no presence pulse, and the released line reads HIGH.
        if (!this.oneWire) return op === 2 ? 1 : 0;
        return this.oneWire({
          pin,
          op: op === 0 ? 'reset' : op === 1 ? 'write' : 'read',
          bit: value ? 1 : 0,
          timeMs: this.now / 1000,
        });
      },
      host_uart_begin: (port: number, baud: number, rx: number, tx: number) => {
        this.uarts.set(port, { baud: baud >>> 0, rx, tx, buffer: [] });
      },
      host_uart_write: (port: number, pointer: number, length: number) => {
        const uart = this.uarts.get(port);
        if (!uart || !this.uart) return;
        const bytes = new Uint8Array(this.exports.memory.buffer, pointer, length >>> 0).slice();
        this.uart.write(
          { port, baud: uart.baud, rx: uart.rx, tx: uart.tx, timeMs: this.now / 1000 },
          bytes,
        );
      },
      host_spi_transfer: (
        sck: number,
        mosi: number,
        miso: number,
        outPointer: number,
        inPointer: number,
        length: number,
      ) => {
        const memory = () => new Uint8Array(this.exports.memory.buffer);
        const bytes = memory().slice(outPointer, outPointer + (length >>> 0));
        const back = this.spi?.({ sck, mosi, miso, bytes, timeMs: this.now / 1000 });
        if (!inPointer) return;
        // Nothing answering leaves the data-in line where it rests.
        const reply = new Uint8Array(length >>> 0);
        if (back) reply.set(back.subarray(0, reply.length));
        memory().set(reply, inPointer);
      },
      host_led_strip: (pin: number, pointer: number, length: number, khz: number) => {
        if (!valid(pin) || !this.ledStrip) return;
        const bytes = new Uint8Array(this.exports.memory.buffer, pointer, length >>> 0).slice();
        this.ledStrip({ pin, bytes, khz, timeMs: this.now / 1000 });
      },
      host_uart_available: (port: number) => this.uartBuffer(port).length,
      host_uart_read: (port: number) => {
        const buffer = this.uartBuffer(port);
        return buffer.length ? buffer.shift()! : -1;
      },
      host_uart_peek: (port: number) => {
        const buffer = this.uartBuffer(port);
        return buffer.length ? buffer[0]! : -1;
      },
      host_serial_available: () => this.typed.length,
      host_serial_read: () => (this.typed.length ? this.typed.shift()! : -1),
      host_serial_peek: () => (this.typed.length ? this.typed[0]! : -1),
      host_deep_sleep: (
        wakeAfterUs: bigint,
        ext0Pin: number,
        ext0Level: number,
        rtcPointer: number,
        rtcLength: number,
      ) => {
        const after = Number(wakeAfterUs);
        this.sleeping = {
          rtcPointer,
          rtc: new Uint8Array(this.exports.memory.buffer, rtcPointer, rtcLength >>> 0).slice(),
          wakeAt: after >= 0 ? this.now + after : null,
          ext0: valid(ext0Pin) ? { pin: ext0Pin, level: ext0Level ? 1 : 0 } : null,
        };
        // Asleep, the chip lets go of every pin.
        for (let pin = 0; pin < PINS; pin++) {
          this.outputLevel[pin] = 0;
          this.pinMode(pin, INPUT);
        }
        throw new DeepSleep();
      },
      host_wakeup_cause: () => this.wakeCause,
      host_wifi_begin: (mode: number, pointer: number, length: number) => {
        const ssid = new TextDecoder().decode(
          new Uint8Array(this.exports.memory.buffer, pointer, length >>> 0),
        );
        this.wifi = { mode, ssid, since: this.now };
      },
      host_wifi_status: () => this.wifiStatus(),
      host_wifi_address: () =>
        this.wifi.mode === 2
          ? AP_ADDRESS
          : this.wifiStatus() === WL_CONNECTED
            ? STATION_ADDRESS
            : 0,
      host_http_listen: (port: number) => {
        this.httpPort = port;
      },
      host_http_next: (pointer: number, capacity: number) => {
        const next = this.httpQueue[0];
        if (!next || this.httpPort === null) return 0;
        const bytes = new TextEncoder().encode(`GET ${next.path}`);
        if (pointer && capacity >>> 0 >= bytes.length) {
          new Uint8Array(this.exports.memory.buffer, pointer, bytes.length).set(bytes);
          this.httpQueue.shift();
          this.httpCurrent = next;
        }
        return bytes.length;
      },
      host_http_respond: (
        status: number,
        typePointer: number,
        typeLength: number,
        bodyPointer: number,
        bodyLength: number,
      ) => {
        const request = this.httpCurrent;
        this.httpCurrent = null;
        if (!request) return;
        const text = (pointer: number, length: number) =>
          new TextDecoder().decode(
            new Uint8Array(this.exports.memory.buffer, pointer, length >>> 0),
          );
        const [type = '', ...headerLines] = text(typePointer, typeLength).split('\n');
        const headers: Record<string, string> = {};
        for (const line of headerLines) {
          const colon = line.indexOf(':');
          if (colon > 0) headers[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
        }
        const body = text(bodyPointer, Math.min(bodyLength >>> 0, MAX_HTTP_BODY));
        const response = { id: request.id, path: request.path, status, type, headers, body };
        for (const listener of this.httpListeners) listener(response);
      },
      host_micros: () => BigInt(Math.floor(this.now)),
      host_delay_micros: (microseconds: bigint) => this.wait(Number(microseconds)),
      host_tick: () => this.wait(CALL_COST_US),
    };
    // The C library asks for a few system calls a sketch never makes; exit ends the program.
    const system: Record<string, () => number> = {};
    for (const wanted of WebAssembly.Module.imports(module)) {
      if (wanted.module === 'wasi_snapshot_preview1') {
        system[wanted.name] =
          wanted.name === 'proc_exit'
            ? () => {
                throw new SketchEnded('the sketch ended itself');
              }
            : () => 52; // "not supported"
      } else if (wanted.module !== 'env' || !(wanted.name in env)) {
        throw new Error(`not a sketch for this board: it asks for ${wanted.module}.${wanted.name}`);
      }
    }
    this.imports = { env, wasi_snapshot_preview1: system };
    this.instantiate();
  }

  /** A fresh copy of the sketch, as at power-on: its memory, globals and constructors. */
  private instantiate(): void {
    const instance = new WebAssembly.Instance(this.module, this.imports);
    this.exports = instance.exports as unknown as Exports;
    if (typeof this.exports.asyncify_start_unwind !== 'function' || !this.exports.malloc) {
      throw new Error('not a sketch for this board: it was not built to be paused');
    }
    // The sketch's global constructors run here, before run(): a library may already
    // set up its pins (OneWire does), which takes time but cannot pause anything yet.
    this.starting = true;
    try {
      this.exports._initialize?.();
    } finally {
      this.starting = false;
    }
    // Where a paused call stack is kept: two words (where it is up to, where it ends), then the room.
    this.pauseData = this.exports.malloc(8 + PAUSE_STACK_BYTES);
  }

  /**
   * When a board in deep sleep wakes, if it does by `target`: at its timer, or
   * at once when the ext0 pin is at its level. Null while it sleeps on.
   */
  private wakeTime(target: number): number | null {
    const sleep = this.sleeping!;
    if (sleep.ext0 && this.inputLevel[sleep.ext0.pin] === sleep.ext0.level) return this.now;
    return sleep.wakeAt !== null && sleep.wakeAt <= target ? sleep.wakeAt : null;
  }

  /**
   * Wakes from deep sleep: the sketch starts again from setup(), as after a
   * reset, with only its RTC_DATA_ATTR variables kept.
   */
  private wakeUp(): void {
    const sleep = this.sleeping!;
    const timer = sleep.wakeAt !== null && this.now >= sleep.wakeAt;
    this.sleeping = null;
    this.handler.fill(0);
    this.handlerMode.fill(0);
    this.pwm.clear();
    this.uarts.clear();
    this.pulse = null;
    this.wakeAt = null;
    this.rewinding = false;
    this.started = false;
    this.instantiate();
    new Uint8Array(this.exports.memory.buffer, sleep.rtcPointer, sleep.rtc.length).set(sleep.rtc);
    this.wakeCause = timer ? 4 : 2;
  }

  get timeMs(): number {
    return this.now / 1000;
  }

  /** Why the program stopped, or null while it runs. */
  get stopped(): string | null {
    return this.finished;
  }

  pinDrive(pin: number): PinDrive {
    return valid(pin) ? this.reported[pin]! : 'input';
  }

  setDigitalInput(pin: number, high: boolean): void {
    if (!valid(pin)) return;
    const before = this.inputLevel[pin]!;
    const after = high ? 1 : 0;
    this.inputLevel[pin] = after;
    if (before === after) return;
    if (this.pulse?.pin === pin && this.wakeAt !== null) this.wakeAt = this.now; // pulseIn is watching
    const fn = this.handler[pin]!;
    const edge = after ? RISING : FALLING;
    if (fn && this.started && !this.finished) {
      const mode = this.handlerMode[pin]!;
      if (mode === CHANGE || mode === edge) this.callHandler(fn);
    }
  }

  setPinVoltage(pin: number, volts: number): void {
    if (valid(pin)) this.volts[pin] = volts;
  }

  /** Text typed into the serial monitor, sent to the sketch as a line. */
  typeSerial(text: string): void {
    for (const byte of new TextEncoder().encode(`${text}\n`)) this.typed.push(byte);
  }

  onPinChange(listener: PinListener): () => void {
    this.pinListeners.add(listener);
    return () => this.pinListeners.delete(listener);
  }

  onSettingsSaved(listener: (settings: string) => void): void {
    this.settingsListeners.add(listener);
  }

  onI2c(handler: I2cHandler): void {
    this.i2c = handler;
  }

  onOneWire(handler: OneWireHandler): void {
    this.oneWire = handler;
  }

  onUart(handler: UartHandler): void {
    this.uart = handler;
  }

  onSpi(handler: SpiHandler): void {
    this.spi = handler;
  }

  onLedStrip(handler: LedStripHandler): void {
    this.ledStrip = handler;
  }

  /**
   * A UART's receive buffer, with what has arrived on its RX pin up to now. Like
   * Espressif's core it holds 256 bytes; what arrives while it is full is lost.
   */
  private uartBuffer(port: number): number[] {
    const uart = this.uarts.get(port);
    if (!uart) return [];
    if (this.uart) {
      const arrived = this.uart.receive({
        port,
        baud: uart.baud,
        rx: uart.rx,
        tx: uart.tx,
        timeMs: this.now / 1000,
      });
      for (const byte of arrived)
        if (uart.buffer.length < UART_BUFFER_BYTES) uart.buffer.push(byte);
    }
    return uart.buffer;
  }

  /** The Arduino status: connected once a station has had time to join; disconnected otherwise. */
  private wifiStatus(): number {
    if (this.wifi.mode === 1 && this.now - this.wifi.since >= WIFI_JOIN_US) return WL_CONNECTED;
    return WL_DISCONNECTED;
  }

  request(path: string): number | 'no-wifi' | 'no-server' | 'busy' {
    const reachable = this.wifi.mode === 2 || this.wifiStatus() === WL_CONNECTED;
    if (!reachable) return 'no-wifi';
    if (this.httpPort === null) return 'no-server';
    if (this.httpQueue.length >= MAX_HTTP_QUEUE) return 'busy';
    const id = this.nextHttpId++;
    this.httpQueue.push({ id, path: path.startsWith('/') ? path : `/${path}` });
    return id;
  }

  onHttpResponse(listener: (response: HttpResponse) => void): void {
    this.httpListeners.add(listener);
  }

  onSerial(listener: (text: string) => void): () => void {
    this.serialListeners.add(listener);
    return () => this.serialListeners.delete(listener);
  }

  runUntil(timeMs: number): void {
    const target = timeMs * 1000;
    if (target <= this.now) return;
    this.target = target;
    // The circuit has been shown to the board since the last slice.
    this.assumed.fill(-1);
    for (;;) {
      if (this.finished) {
        this.passTime(target);
        return;
      }
      if (this.sleeping) {
        const wake = this.wakeTime(target);
        if (wake === null) {
          this.passTime(target);
          return;
        }
        this.passTime(wake);
        this.wakeUp();
      }
      if (this.wakeAt !== null && this.wakeAt > target) {
        // Still inside the same wait: only time passes.
        this.passTime(target);
        return;
      }
      try {
        if (!this.started) {
          this.started = true;
          this.exports.run();
        } else if (this.wakeAt !== null) {
          this.passTime(this.wakeAt);
          this.wakeAt = null;
          this.exports.asyncify_start_rewind(this.pauseData);
          this.exports.run();
        }
        // run() comes back only when the sketch was paused inside a wait.
        this.exports.asyncify_stop_unwind();
        return;
      } catch (error) {
        // Deep sleep ends the run: the board sleeps, and may wake within this same stretch.
        if (error instanceof DeepSleep) continue;
        this.finished =
          error instanceof SketchEnded
            ? error.message
            : `the sketch crashed (${error instanceof Error ? error.message : String(error)})`;
        this.passTime(target);
        return;
      }
    }
  }

  /** Stops the run in progress early. Called from a pin listener, while the sketch runs. */
  stopAt(timeMs: number): void {
    this.target = Math.min(this.target, Math.max(this.now, timeMs * 1000));
  }

  // ------------------------------------------------------------------ time

  /**
   * Lets `microseconds` of board time pass, from inside a host call. If the
   * simulation's slice ends first, the sketch is paused here and this same call
   * is made again when it carries on.
   */
  private wait(microseconds: number): void {
    if (this.inHandler || this.starting) {
      // A handler, or the start before run(), is not paused: its time is simply added.
      this.passTime(this.now + microseconds);
      return;
    }
    if (this.resuming()) return; // carrying on from the pause below: the wait is over
    const until = this.now + Math.max(0, microseconds);
    if (until <= this.target) {
      this.passTime(until);
      return;
    }
    this.pauseUntil(until);
  }

  /** True once, when a paused call is entered again to carry on. */
  private resuming(): boolean {
    if (!this.rewinding) return false;
    this.rewinding = false;
    this.exports.asyncify_stop_rewind();
    return true;
  }
  private rewinding = false;
  /** True while the sketch's global constructors run. */
  private starting = false;

  private pauseUntil(until: number): void {
    this.passTime(this.target);
    this.wakeAt = until;
    const view = new Int32Array(this.exports.memory.buffer, this.pauseData, 2);
    view[0] = this.pauseData + 8;
    view[1] = this.pauseData + 8 + PAUSE_STACK_BYTES;
    this.rewinding = true; // the next entry into this call is the way back in
    this.exports.asyncify_start_unwind(this.pauseData);
  }

  /** Moves the clock, switching PWM outputs on the way. */
  private passTime(until: number): void {
    for (const [pin, pwm] of this.pwm) {
      if (pwm.duty <= 0 || pwm.duty >= 1) continue;
      const high = pwm.periodUs * pwm.duty;
      for (;;) {
        const fall = pwm.cycleStart + high;
        const next = pwm.cycleStart + pwm.periodUs;
        if (fall > this.now && fall <= until) this.report(pin, 'low', fall);
        if (next > until) break;
        pwm.cycleStart = next;
        this.report(pin, 'high', next);
      }
    }
    this.now = Math.max(this.now, until);
  }

  // ------------------------------------------------------------------ pins

  private driveOf(pin: number): PinDrive {
    const mode = this.mode[pin]!;
    if ((mode & OUTPUT) === OUTPUT) {
      const level = this.outputLevel[pin]!;
      // An open-drain output only pulls LOW; HIGH lets go of the pin.
      if (mode & OPEN_DRAIN) return level ? 'input' : 'low';
      return level ? 'high' : 'low';
    }
    if (mode & PULLUP) return 'pullup';
    if (mode & PULLDOWN) return 'pulldown';
    return 'input';
  }

  private report(pin: number, drive: PinDrive, atUs = this.now): void {
    if (this.reported[pin] === drive) return;
    this.reported[pin] = drive;
    // Left alone, a pull-up reads HIGH, a pull-down LOW and an output what it drives.
    this.assumed[pin] = drive === 'high' || drive === 'pullup' ? 1 : drive === 'input' ? -1 : 0;
    for (const listener of this.pinListeners) listener(pin, drive, atUs / 1000);
  }

  private pinMode(pin: number, mode: number): void {
    if (!valid(pin)) return;
    this.mode[pin] = mode;
    this.pwm.delete(pin);
    this.report(pin, this.driveOf(pin));
  }

  private digitalWrite(pin: number, level: number): void {
    if (!valid(pin)) return;
    this.outputLevel[pin] = level ? 1 : 0;
    this.pwm.delete(pin);
    this.report(pin, this.driveOf(pin));
  }

  private digitalRead(pin: number): number {
    if (!valid(pin)) return 0;
    // An output reads back what the circuit shows on the pin, as an input does.
    const assumed = this.assumed[pin]!;
    return assumed >= 0 ? assumed : this.inputLevel[pin]!;
  }

  private setPwm(pin: number, duty: number, frequency: number): void {
    if (!valid(pin)) return;
    const clamped = Math.min(1, Math.max(0, duty));
    this.mode[pin] = OUTPUT;
    const shown = Math.min(Math.max(frequency, 1), PWM_SHOWN_HZ);
    const previous = this.pwm.get(pin);
    this.pwm.set(pin, {
      duty: clamped,
      frequency,
      periodUs: 1e6 / shown,
      cycleStart: previous && previous.periodUs === 1e6 / shown ? previous.cycleStart : this.now,
    });
    if (clamped <= 0) this.report(pin, 'low');
    else if (clamped >= 1) this.report(pin, 'high');
    else if (!previous || previous.duty <= 0 || previous.duty >= 1) {
      // Starting to switch: a new cycle begins HIGH now.
      this.pwm.get(pin)!.cycleStart = this.now;
      this.report(pin, 'high');
    }
  }

  /** The PWM a pin is putting out, or null. For displays and tests. */
  pwmOf(pin: number): { duty: number; frequency: number } | null {
    const pwm = this.pwm.get(pin);
    return pwm ? { duty: pwm.duty, frequency: pwm.frequency } : null;
  }

  private analog(pin: number, attenuation: number, bits: number) {
    const unit = ADC_OF_GPIO.get(pin);
    // A pin with no converter reads nothing.
    if (unit === undefined) return { count: 0, millivolts: 0 };
    return esp32AnalogRead(this.volts[pin]!, {
      attenuation: ESP32_ADC_ATTENUATIONS[attenuation] ?? 11,
      bits,
      unit,
    });
  }

  // ------------------------------------------------------------------ pulseIn and interrupts

  /**
   * Waits for a pulse at `level` on a pin and returns its length in
   * microseconds, or 0 if none arrives in time. The call is entered again each
   * time the sketch carries on, so where it has got to is kept on the board.
   */
  private pulseIn(pin: number, level: number, timeout: number): number {
    if (!valid(pin) || this.inHandler) return 0;
    const wanted = level ? 1 : 0;
    if (this.resuming()) {
      // Woken by a change on the pin, or by the end of the time allowed.
    } else {
      this.pulse = { pin, level: wanted, deadline: this.now + timeout, startedAt: null };
    }
    const pulse = this.pulse!;
    const seen = this.inputLevel[pin]!;
    if (pulse.startedAt === null && seen === wanted) pulse.startedAt = this.now;
    else if (pulse.startedAt !== null && seen !== wanted) {
      this.pulse = null;
      return Math.round(this.now - pulse.startedAt);
    }
    if (this.now >= pulse.deadline) {
      this.pulse = null;
      return 0;
    }
    this.pauseUntil(pulse.deadline);
    return 0; // not used: the call is made again when the sketch carries on
  }

  private callHandler(fn: number): void {
    this.inHandler = true;
    try {
      (this.exports.__indirect_function_table.get(fn) as () => void)();
    } catch (error) {
      this.finished = `the sketch crashed in an interrupt handler (${error instanceof Error ? error.message : String(error)})`;
    } finally {
      this.inHandler = false;
    }
  }
}

class SketchEnded extends Error {}
/** Thrown out of the sketch when it goes into deep sleep; the board starts it again on waking. */
class DeepSleep extends Error {}

const valid = (pin: number) => pin >= 0 && pin < PINS;
