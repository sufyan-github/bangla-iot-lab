import type { PinDrive, PinListener, ProgrammableBoard } from '@banglalab/board-emulators';

/**
 * An ESP32 board whose program is the board's real firmware, run in an emulator
 * of the whole chip: esp32sim (https://github.com/mikroverk/esp32sim, MIT),
 * built for the lab with a few extra exports (third_party/esp32sim).
 *
 * EXPERIMENTAL. What it gains over the lab's own board library is that the
 * firmware is the real one: the Arduino core, FreeRTOS and the chip's start-up
 * code all run. What it costs is speed: a sketch whose loop never waits ran at
 * about a fifth of real time on a laptop. Its authors call its support for
 * this chip "early". Known differences here:
 * - the simulation shows the board the circuit once a millisecond;
 * - a PWM output is shown switching at 2 kHz at most, with its duty kept;
 * - parts that talk I2C or SPI are not connected to it.
 */

/** The emulator and the chip's own start-up code (Espressif's mask ROM ELF, Apache-2.0). */
export interface Esp32Emulator {
  module: WebAssembly.Module;
  rom: Uint8Array;
}

/** The three images a build of an ESP32 program produces. */
export interface Esp32Firmware {
  bootloader: Uint8Array;
  partitions: Uint8Array;
  app: Uint8Array;
}

/** How the lab stores a built firmware: the three images in base64, in JSON. */
export const ESP32_FIRMWARE_FORMAT = 'esp32-firmware-1';

/** Reads a stored firmware. Returns null when the text is not one. */
export function parseEsp32Firmware(text: string): Esp32Firmware | null {
  if (!text.trimStart().startsWith('{')) return null;
  try {
    const stored = JSON.parse(text) as Record<string, unknown>;
    if (stored.format !== ESP32_FIRMWARE_FORMAT) return null;
    const image = (name: string) => {
      const value = stored[name];
      if (typeof value !== 'string') throw new Error(`no ${name}`);
      return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
    };
    return { bootloader: image('bootloader'), partitions: image('partitions'), app: image('app') };
  } catch {
    return null;
  }
}

const PINS = 40;
/** Fastest switching shown for a PWM output, hertz. */
const PWM_SHOWN_HZ = 2000;
/** Most pin edges taken from the emulator after one slice. */
const MAX_EVENTS = 4096;
const FLASH_MB = 4;

// What the emulator's loader calls each image.
const KIND = { rom: 0, bootloader: 1, partitions: 2, app: 3 } as const;

const RTCIO_BASE = 0x3ff48400;
/**
 * The low-power pads keep their pull resistors in their own registers, not
 * where the ordinary pads keep theirs: GPIO, then register offset, pull-up bit
 * and pull-down bit. From Espressif's soc/rtc_io_reg.h for the ESP32.
 */
const RTC_PULLS = new Map<number, readonly [number, number, number]>([
  [25, [0x84, 27, 28]],
  [26, [0x88, 27, 28]],
  [32, [0x8c, 22, 23]],
  [33, [0x8c, 27, 28]],
  [4, [0x94, 27, 28]],
  [0, [0x98, 27, 28]],
  [2, [0x9c, 27, 28]],
  [15, [0xa0, 27, 28]],
  [13, [0xa4, 27, 28]],
  [12, [0xa8, 27, 28]],
  [14, [0xac, 27, 28]],
  [27, [0xb0, 27, 28]],
]);

interface Exports {
  memory: WebAssembly.Memory;
  __indirect_function_table: WebAssembly.Table;
  esp32sim_alloc(length: number): number;
  esp32sim_free(pointer: number, length: number): void;
  esp32sim_new(board: number, length: number, flashMb: number, psramMb: number): number;
  esp32sim_delete(emulator: number): void;
  esp32sim_set_jit(emulator: number, on: number): void;
  esp32sim_load(emulator: number, kind: number, pointer: number, length: number): number;
  esp32sim_boot(emulator: number, appDirect: number): number;
  esp32sim_run(emulator: number, cycles: number, unixMs: number): number;
  esp32sim_cpu_hz(emulator: number): number;
  esp32sim_cycles(emulator: number): number;
  esp32sim_out_take(emulator: number): number;
  esp32sim_out_kind(emulator: number, index: number): number;
  esp32sim_out_ptr(emulator: number, index: number): number;
  esp32sim_out_len(emulator: number, index: number): number;
  esp32sim_in_text(emulator: number, pointer: number, length: number): void;
  lab_gpio_observe(emulator: number, on: number): void;
  lab_gpio_events(emulator: number, out: number, max: number): number;
  lab_gpio_state(emulator: number, pin: number): number;
  lab_gpio_set(emulator: number, pin: number, level: number): void;
  lab_gpio_release(emulator: number, pin: number): void;
  lab_adc_volts(emulator: number, pin: number, volts: number): void;
  lab_pwm_hz(emulator: number, pin: number): number;
  lab_pwm_duty(emulator: number, pin: number): number;
  lab_read32(emulator: number, address: number): number;
}

interface Pwm {
  duty: number;
  frequency: number;
  periodUs: number;
  cycleStart: number;
}

export class Esp32SimBoard implements ProgrammableBoard {
  private readonly wasm: Exports;
  private readonly emulator: number;
  private readonly hz: number;
  private readonly eventBuffer: number;
  private finished: string | null = null;
  /** Board time already shown to listeners, microseconds. */
  private shownUs = 0;
  private readonly reported: PinDrive[] = new Array<PinDrive>(PINS).fill('input');
  private readonly pwm = new Map<number, Pwm>();
  private readonly pinListeners = new Set<PinListener>();
  private readonly serialListeners = new Set<(text: string) => void>();
  private readonly decoder = new TextDecoder();
  private readonly encoder = new TextEncoder();

  /** Throws if the emulator cannot be started with this firmware. */
  constructor(emulator: Esp32Emulator, firmware: Esp32Firmware) {
    // The emulator can compile hot code of the firmware to WebAssembly as it runs.
    const free: number[] = [];
    const live = new Set<number>();
    const instance = new WebAssembly.Instance(emulator.module, {
      env: {
        host_log: (pointer: number, length: number) => {
          const line = this.decoder.decode(this.bytes(pointer, length));
          if (/panic|unimplemented/.test(line)) this.finished ??= line;
        },
        host_jit_compile: (pointer: number, length: number) => {
          try {
            const code = this.bytes(pointer, length).slice();
            const block = new WebAssembly.Instance(new WebAssembly.Module(code), {
              env: { memory: this.wasm.memory, table: this.wasm.__indirect_function_table },
            });
            const slot = free.pop() ?? this.wasm.__indirect_function_table.grow(1);
            this.wasm.__indirect_function_table.set(slot, block.exports.run as () => void);
            live.add(slot);
            return slot;
          } catch {
            return 0; // not compiled: the emulator interprets the block instead
          }
        },
        host_jit_release: (slot: number) => {
          if (!live.delete(slot)) return;
          this.wasm.__indirect_function_table.set(slot, null);
          free.push(slot);
        },
      },
    });
    this.wasm = instance.exports as unknown as Exports;
    if (typeof this.wasm.lab_gpio_events !== 'function') {
      throw new Error('this build of the emulator lacks the lab’s additions');
    }
    this.emulator = this.withBytes(this.encoder.encode('esp32'), (pointer, length) =>
      this.wasm.esp32sim_new(pointer, length, FLASH_MB, 0),
    );
    if (this.emulator === 0) throw new Error('the emulator could not be created');
    this.wasm.esp32sim_set_jit(this.emulator, 1);
    for (const [kind, image] of [
      [KIND.rom, emulator.rom],
      [KIND.bootloader, firmware.bootloader],
      [KIND.partitions, firmware.partitions],
      [KIND.app, firmware.app],
    ] as const) {
      const failed = this.withBytes(image, (pointer, length) =>
        this.wasm.esp32sim_load(this.emulator, kind, pointer, length),
      );
      if (failed) throw new Error('the emulator refused part of the firmware');
    }
    this.wasm.lab_gpio_observe(this.emulator, 1);
    if (this.wasm.esp32sim_boot(this.emulator, 0) !== 0) {
      throw new Error('the emulator could not start the firmware');
    }
    this.hz = this.wasm.esp32sim_cpu_hz(this.emulator);
    this.eventBuffer = this.wasm.esp32sim_alloc(MAX_EVENTS * 16);
  }

  /** Frees the emulator. The board must not be used afterwards. */
  dispose(): void {
    this.wasm.esp32sim_delete(this.emulator);
  }

  get timeMs(): number {
    return (this.wasm.esp32sim_cycles(this.emulator) / this.hz) * 1000;
  }

  /** Why the program stopped, or null while it runs. */
  get stopped(): string | null {
    return this.finished;
  }

  pinDrive(pin: number): PinDrive {
    return pin >= 0 && pin < PINS ? this.reported[pin]! : 'input';
  }

  setDigitalInput(pin: number, high: boolean): void {
    if (pin >= 0 && pin < PINS) this.wasm.lab_gpio_set(this.emulator, pin, high ? 1 : 0);
  }

  releaseInput(pin: number): void {
    if (pin >= 0 && pin < PINS) this.wasm.lab_gpio_release(this.emulator, pin);
  }

  setPinVoltage(pin: number, volts: number): void {
    // Only the converter's pins take a voltage; the emulator ignores the rest.
    if (pin >= 32 && pin < PINS) this.wasm.lab_adc_volts(this.emulator, pin, volts);
    else if ([0, 2, 4, 12, 13, 14, 15, 25, 26, 27].includes(pin)) {
      this.wasm.lab_adc_volts(this.emulator, pin, volts);
    }
  }

  /** Text typed into the serial monitor, sent to the program as a line. */
  typeSerial(text: string): void {
    const message = JSON.stringify({ t: 'serial', src: 'uart0', line: text });
    this.withBytes(this.encoder.encode(message), (pointer, length) =>
      this.wasm.esp32sim_in_text(this.emulator, pointer, length),
    );
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
    const target = (timeMs / 1000) * this.hz;
    while (!this.finished) {
      const left = target - this.wasm.esp32sim_cycles(this.emulator);
      if (left < 1) break;
      const code = this.wasm.esp32sim_run(this.emulator, Math.min(left, 0x7fff_ffff), Date.now());
      if (code !== 0) this.finished ??= `the emulator stopped (code ${code})`;
    }
    this.takeSerial();
    this.takePins(timeMs * 1000);
  }

  // ------------------------------------------------------------------ internals

  private bytes(pointer: number, length: number): Uint8Array {
    return new Uint8Array(this.wasm.memory.buffer, pointer, length);
  }

  private withBytes<T>(data: Uint8Array, use: (pointer: number, length: number) => T): T {
    const pointer = this.wasm.esp32sim_alloc(data.length);
    this.bytes(pointer, data.length).set(data);
    try {
      return use(pointer, data.length);
    } finally {
      this.wasm.esp32sim_free(pointer, data.length);
    }
  }

  private takeSerial(): void {
    const count = this.wasm.esp32sim_out_take(this.emulator);
    let text = '';
    for (let i = 0; i < count; i++) {
      if (this.wasm.esp32sim_out_kind(this.emulator, i) !== 1) continue;
      const pointer = this.wasm.esp32sim_out_ptr(this.emulator, i);
      const length = this.wasm.esp32sim_out_len(this.emulator, i);
      try {
        const message = JSON.parse(this.decoder.decode(this.bytes(pointer, length))) as {
          t?: string;
          src?: string;
          data?: string;
        };
        if (message.t === 'serial' && message.src === 'uart0') text += message.data ?? '';
      } catch {
        // Not a message for the lab.
      }
    }
    if (text) for (const listener of this.serialListeners) listener(text);
  }

  /** What a pin is doing, from its programmed state. */
  private driveOf(pin: number): PinDrive | null {
    const state = this.wasm.lab_gpio_state(this.emulator, pin) >>> 0;
    if (state === 0xffff_ffff) return null;
    if (state & 2) return state & 1 ? 'high' : 'low';
    let up = (state & 4) !== 0;
    let down = (state & 8) !== 0;
    const rtc = RTC_PULLS.get(pin);
    if (rtc) {
      const register = this.wasm.lab_read32(this.emulator, RTCIO_BASE + rtc[0]) >>> 0;
      up ||= ((register >>> rtc[1]) & 1) === 1;
      down ||= ((register >>> rtc[2]) & 1) === 1;
    }
    return up ? 'pullup' : down ? 'pulldown' : 'input';
  }

  private report(pin: number, drive: PinDrive, atUs: number): void {
    if (this.reported[pin] === drive) return;
    this.reported[pin] = drive;
    for (const listener of this.pinListeners) listener(pin, drive, atUs / 1000);
  }

  /** Tells the listeners what the pins did up to `nowUs`. */
  private takePins(nowUs: number): void {
    // Edges of plain outputs, at the times they happened.
    const count = this.wasm.lab_gpio_events(this.emulator, this.eventBuffer, MAX_EVENTS);
    const view = new DataView(this.wasm.memory.buffer, this.eventBuffer, MAX_EVENTS * 16);
    for (let i = 0; i < Math.min(count, MAX_EVENTS); i++) {
      const atUs = (view.getFloat64(i * 16, true) / this.hz) * 1e6;
      const pin = view.getUint32(i * 16 + 8, true);
      const level = view.getUint32(i * 16 + 12, true);
      // An edge on a pin that is not driving is an input being set: not ours to report.
      if (pin < PINS && (this.reported[pin] === 'high' || this.reported[pin] === 'low')) {
        if (!this.pwm.has(pin)) this.report(pin, level ? 'high' : 'low', atUs);
      }
    }
    for (let pin = 0; pin < PINS; pin++) {
      const hz = this.wasm.lab_pwm_hz(this.emulator, pin);
      const duty = this.wasm.lab_pwm_duty(this.emulator, pin) >>> 0;
      if (hz > 0 && duty !== 0xffff_ffff) {
        this.showPwm(pin, duty / 65535, hz, nowUs);
        continue;
      }
      this.pwm.delete(pin);
      // The state at the end of the slice is the truth, whatever the edges said.
      const drive = this.driveOf(pin);
      if (drive) this.report(pin, drive, nowUs);
    }
    this.shownUs = nowUs;
  }

  /** Switches a PWM output through the slice that just ran. */
  private showPwm(pin: number, duty: number, frequency: number, nowUs: number): void {
    const periodUs = 1e6 / Math.min(Math.max(frequency, 1), PWM_SHOWN_HZ);
    let pwm = this.pwm.get(pin);
    if (!pwm || pwm.periodUs !== periodUs) {
      pwm = { duty, frequency, periodUs, cycleStart: this.shownUs };
      this.pwm.set(pin, pwm);
    }
    pwm.duty = duty;
    pwm.frequency = frequency;
    if (duty <= 0 || duty >= 1) {
      this.report(pin, duty >= 1 ? 'high' : 'low', nowUs);
      return;
    }
    if (this.reported[pin] !== 'high' && this.reported[pin] !== 'low') {
      pwm.cycleStart = this.shownUs;
      this.report(pin, 'high', this.shownUs);
    }
    const high = periodUs * duty;
    for (;;) {
      const fall = pwm.cycleStart + high;
      const next = pwm.cycleStart + periodUs;
      if (fall > this.shownUs && fall <= nowUs) this.report(pin, 'low', fall);
      if (next > nowUs) break;
      pwm.cycleStart = next;
      this.report(pin, 'high', next);
    }
  }

  /** The PWM a pin is putting out, or null. For displays and tests. */
  pwmOf(pin: number): { duty: number; frequency: number } | null {
    const pwm = this.pwm.get(pin);
    return pwm ? { duty: pwm.duty, frequency: pwm.frequency } : null;
  }
}
