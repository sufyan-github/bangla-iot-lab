import type { PinDrive, PinListener, ProgrammableBoard } from '@banglalab/board-emulators';
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
  private readonly decoder = new TextDecoder();
  private readonly exports: Exports;
  private readonly pauseData: number;

  /** Throws if the bytes are not a sketch module built pausable for this board. */
  constructor(bytes: BufferSource) {
    const module = new WebAssembly.Module(bytes);
    const env: Record<string, (...args: never[]) => unknown> = {
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
      host_serial_available: () => this.typed.length,
      host_serial_read: () => (this.typed.length ? this.typed.shift()! : -1),
      host_serial_peek: () => (this.typed.length ? this.typed[0]! : -1),
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
    const instance = new WebAssembly.Instance(module, { env, wasi_snapshot_preview1: system });
    this.exports = instance.exports as unknown as Exports;
    if (typeof this.exports.asyncify_start_unwind !== 'function' || !this.exports.malloc) {
      throw new Error('not a sketch for this board: it was not built to be paused');
    }
    this.exports._initialize?.();
    // Where a paused call stack is kept: two words (where it is up to, where it ends), then the room.
    this.pauseData = this.exports.malloc(8 + PAUSE_STACK_BYTES);
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
    if (this.finished) {
      this.passTime(target);
      return;
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
    } catch (error) {
      this.finished =
        error instanceof SketchEnded
          ? error.message
          : `the sketch crashed (${error instanceof Error ? error.message : String(error)})`;
      this.passTime(target);
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
    if (this.inHandler) {
      // A handler is not paused: its time is simply added.
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

const valid = (pin: number) => pin >= 0 && pin < PINS;
