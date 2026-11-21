import { ConsoleLogger, GPIOPinState, LogLevel, Simulator, USBCDC, type RP2040 } from 'rp2040js';
import type { PinDrive } from './board';

const FLASH_START = 0x10000000;
const CLOCK_HZ = 125_000_000;
const CYCLE_NANOS = 1e9 / CLOCK_HZ;

export const PICO_PIN_COUNT = 30;
/** Supply voltage of the board's logic, volts. */
export const PICO_VCC = 3.3;

const DRIVE: Record<GPIOPinState, PinDrive> = {
  [GPIOPinState.Low]: 'low',
  [GPIOPinState.High]: 'high',
  [GPIOPinState.Input]: 'input',
  [GPIOPinState.InputPullUp]: 'pullup',
  // The circuit model has no pull-down or bus-keeper yet; both are weak enough to treat as open.
  [GPIOPinState.InputPullDown]: 'input',
  [GPIOPinState.InputBusKeeper]: 'input',
};

export interface PicoRun {
  /** What the program printed. */
  output: string;
  /** The traceback, if the program raised an error; otherwise empty. */
  error: string;
  /** False when the time limit ran out before the program ended. */
  finished: boolean;
}

/** Copies the payload of every block of a UF2 file into the chip's flash memory. */
function loadUf2(chip: RP2040, file: Uint8Array): void {
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
  if (file.length === 0 || file.length % 512 !== 0)
    throw new Error('UF2: file size is not a multiple of 512');
  for (let offset = 0; offset < file.length; offset += 512) {
    if (
      view.getUint32(offset, true) !== 0x0a324655 ||
      view.getUint32(offset + 4, true) !== 0x9e5d5157
    ) {
      throw new Error('UF2: bad block signature');
    }
    const address = view.getUint32(offset + 12, true) - FLASH_START;
    const size = view.getUint32(offset + 16, true);
    if (size > 476 || address < 0 || address + size > chip.flash.length) {
      throw new Error('UF2: block does not fit in flash');
    }
    chip.flash.set(file.subarray(offset + 32, offset + 32 + size), address);
  }
}

/**
 * A Raspberry Pi Pico running MicroPython: an emulated RP2040 (rp2040js) with
 * the official firmware, talked to over its USB serial port as a real board is.
 *
 * Trial status (Phase 1, task 10): boots MicroPython 1.26 and 1.29, runs
 * programs through the raw REPL, and has exact GPIO, PWM and sleep timing. It
 * is not yet connected to the circuit simulation or the editor. Not emulated:
 * the Pico W's radio, and anything that needs the second processor core.
 */
export class PicoBoard {
  private readonly chip: RP2040;
  private readonly clock: Simulator['clock'];
  private readonly serial: USBCDC;
  private readonly serialListeners = new Set<(text: string) => void>();
  private readonly decoder = new TextDecoder();
  private awakeNanos = 0;
  /** A read request from the firmware that is waiting for something to be typed. */
  private heldRead: { endpoint: number; size: number } | null = null;
  private readonly answerRead: (endpoint: number, size: number) => void;

  /**
   * @param bootrom The RP2040 boot ROM (revision B1) as 32-bit words.
   * @param firmware A MicroPython UF2 file for the Pico.
   */
  constructor(bootrom: Uint32Array, firmware: Uint8Array) {
    const simulator = new Simulator();
    this.chip = simulator.rp2040;
    this.clock = simulator.clock;
    this.chip.logger = new ConsoleLogger(LogLevel.Error);
    this.chip.loadBootrom(bootrom);
    loadUf2(this.chip, firmware);

    this.serial = new USBCDC(this.chip.usbCtrl);
    this.serial.onDeviceConnected = () => this.write('\r');
    this.serial.onSerialData = (data) => {
      const text = this.decoder.decode(data, { stream: true });
      if (text) for (const listener of this.serialListeners) listener(text);
    };

    // rp2040js answers every read request from the firmware at once, with zero bytes when
    // nothing has been typed. A real computer makes the board wait instead. Without that
    // the firmware asks again in a tight loop, the processor never sleeps, and a program
    // that is only waiting costs as much to emulate as one that is working flat out.
    this.answerRead = this.chip.usbCtrl.onEndpointRead!;
    const serialEndpoint = () => (this.serial as unknown as { outEndpoint: number }).outEndpoint;
    this.chip.usbCtrl.onEndpointRead = (endpoint, size) => {
      if (endpoint === serialEndpoint() && this.serial.txFIFO.itemCount === 0) {
        this.heldRead = { endpoint, size };
      } else {
        this.answerRead(endpoint, size);
      }
    };

    this.chip.core.PC = FLASH_START;
  }

  /** Simulated time since power-on, in milliseconds. */
  get timeMs(): number {
    return this.clock.nanos / 1e6;
  }

  /** Simulated time the processor has spent executing rather than asleep, in milliseconds. */
  get awakeMs(): number {
    return this.awakeNanos / 1e6;
  }

  /** Runs the board until its clock reaches `timeMs`. */
  runUntil(timeMs: number): void {
    const { core } = this.chip;
    const target = timeMs * 1e6;
    while (this.clock.nanos < target) {
      if (core.waiting) {
        // Asleep: jump straight to the next timer, or to the target if none comes sooner.
        const remaining = target - this.clock.nanos;
        const next = this.clock.nanosToNextAlarm;
        this.clock.tick(next > 0 && next < remaining ? next : remaining);
      } else {
        const nanos = core.executeInstruction() * CYCLE_NANOS;
        this.clock.tick(nanos);
        this.awakeNanos += nanos;
      }
    }
  }

  runFor(milliseconds: number): void {
    this.runUntil(this.timeMs + milliseconds);
  }

  private pin(pin: number) {
    const gpio = this.chip.gpio[pin];
    if (!gpio) throw new RangeError(`Pico has no GPIO ${pin}`);
    return gpio;
  }

  pinDrive(pin: number): PinDrive {
    return DRIVE[this.pin(pin).value];
  }

  /** Called whenever a pin changes what it drives. Returns a function that stops listening. */
  onPinChange(listener: (pin: number, drive: PinDrive, timeMs: number) => void): () => void {
    const removers = this.chip.gpio.map((gpio, pin) =>
      gpio.addListener((state, previous) => {
        if (DRIVE[state] !== DRIVE[previous]) listener(pin, DRIVE[state], this.timeMs);
      }),
    );
    return () => removers.forEach((remove) => remove());
  }

  /** Sets the logic level the program sees when it reads an input pin. */
  setDigitalInput(pin: number, high: boolean): void {
    this.pin(pin).setInputValue(high);
  }

  /** Sets the voltage on an analog input: channel 0-2 is GPIO 26-28. */
  setAnalogInput(channel: number, volts: number): void {
    if (channel < 0 || channel > 2) throw new RangeError(`Pico has no analog input ${channel}`);
    const fraction = Math.min(1, Math.max(0, volts / PICO_VCC));
    this.chip.adc.channelValues[channel] = Math.round(fraction * 4095);
  }

  /** Called with text the board sends over USB serial. */
  onSerial(listener: (text: string) => void): () => void {
    this.serialListeners.add(listener);
    return () => this.serialListeners.delete(listener);
  }

  /** Types text into the board's USB serial port. */
  write(text: string): void {
    for (const byte of new TextEncoder().encode(text)) this.serial.sendSerialByte(byte);
    if (this.heldRead) {
      const { endpoint, size } = this.heldRead;
      this.heldRead = null;
      this.answerRead(endpoint, size);
    }
  }

  /** Runs time forward until `done()` or `limitMs` has passed. Returns whether `done()` became true. */
  private runUntilTrue(done: () => boolean, limitMs: number): boolean {
    const deadline = this.timeMs + limitMs;
    while (!done()) {
      if (this.timeMs >= deadline) return false;
      this.runFor(1);
    }
    return true;
  }

  /** Starts the board and waits for MicroPython's prompt. Returns false if it never appears. */
  boot(limitMs = 3000): boolean {
    let seen = '';
    const stop = this.onSerial((text) => (seen += text));
    const ready = this.runUntilTrue(() => seen.includes('>>> '), limitMs);
    stop();
    return ready;
  }

  /** Stops a running program, as Ctrl-C does on a real board. */
  interrupt(): void {
    this.write('\x03');
  }

  /**
   * Runs a program to completion through MicroPython's raw REPL (the same
   * mechanism tools like Thonny use) and returns what it printed. Time is
   * advanced as far as needed, up to `limitMs` of simulated time.
   */
  run(source: string, limitMs: number): PicoRun {
    let seen = '';
    const stop = this.onSerial((text) => (seen += text));
    try {
      this.write('\x01'); // Ctrl-A: raw REPL
      if (!this.runUntilTrue(() => seen.includes('raw REPL'), 1000)) {
        return { output: '', error: 'The board did not respond.', finished: false };
      }
      this.runFor(5);
      seen = '';
      this.write(`${source}\x04`); // Ctrl-D: run it
      // The reply is "OK", the output, an end mark, any traceback, and a second end mark.
      const END = String.fromCharCode(4);
      const reply = () => {
        const ok = seen.indexOf('OK');
        return ok < 0 ? null : seen.slice(ok + 2).split(END);
      };
      const finished = this.runUntilTrue(() => (reply()?.length ?? 0) >= 3, limitMs);
      const [output = '', error = ''] = reply() ?? [];
      if (!finished) this.interrupt();
      this.write('\x02'); // Ctrl-B: back to the normal prompt
      this.runFor(20);
      return {
        output: output.replace(/\r\n/g, '\n'),
        error: error.replace(/\r\n/g, '\n').trim(),
        finished,
      };
    } finally {
      stop();
    }
  }
}
