import {
  AVRADC,
  AVRIOPort,
  AVRSPI,
  AVRTWI,
  AVRTimer,
  AVRUSART,
  CPU,
  PinState,
  adcConfig,
  avrInstruction,
  portBConfig,
  portCConfig,
  portDConfig,
  spiConfig,
  timer0Config,
  twiConfig,
  timer1Config,
  timer2Config,
  usart0Config,
} from 'avr8js';
import { parseIntelHex } from './intel-hex';
import type {
  I2cHandler,
  LedStripHandler,
  PinDrive,
  PinListener,
  ProgrammableBoard,
  SpiHandler,
} from './board';

const FLASH_SIZE = 0x8000; // ATmega328P: 32 KiB
const CLOCK_HZ = 16_000_000;
/** The UNO's I2C pins (A4, A5) and SPI pins (D13 clock, D11 out, D12 in), in Arduino numbering. */
const SDA = 18;
const SCL = 19;
const SCK = 13;
const MOSI = 11;
const MISO = 12;
/** The most bytes a device is asked for at once; the program takes what it needs. */
const I2C_READ_AHEAD = 32;

/**
 * WS2812-style LED data, timed in clock cycles (62.5 ns each). A HIGH pulse
 * this long or longer is a 1 bit, a shorter one a 0 (the WS2812B's own dividing
 * line sits between its 0.4 and 0.8 microsecond pulses).
 */
const LED_ONE_CYCLES = 10;
/** A HIGH longer than 2 microseconds is no LED bit: an ordinary change of the pin. */
const LED_MAX_HIGH_CYCLES = 32;
/** The line resting LOW for 50 microseconds ends a frame, and the LEDs take their colours. */
const LED_LATCH_CYCLES = 800;
/** Bits further apart than this on average were sent at 400 kHz rather than 800. */
const LED_400KHZ_PERIOD_CYCLES = 30;

/** A pin's LED data as it arrives. */
interface LedLine {
  /** Cycle the pulse being timed went HIGH, or null. */
  rise: number | null;
  /** Changes with every edge, so a check scheduled for an earlier one is dropped. */
  edge: number;
  bits: number[];
  firstRise: number;
  lastRise: number;
  lastFall: number;
  latchPending: boolean;
}

export const UNO_PIN_COUNT = 20;
/** Supply voltage of the board's logic, volts. */
export const UNO_VCC = 5;

const DRIVE: Record<PinState, PinDrive> = {
  [PinState.Low]: 'low',
  [PinState.High]: 'high',
  [PinState.Input]: 'input',
  [PinState.InputPullUp]: 'pullup',
};

/**
 * An Arduino UNO-compatible board: an emulated ATmega328P at 16 MHz with its
 * GPIO ports, timers (so `delay`, `millis` and PWM work), ADC and serial port.
 *
 * Pins use Arduino numbering: 0-13 are the digital pins (port D then port B)
 * and 14-19 are A0-A5 (port C). Its I²C (TWI) and SPI hardware reach the
 * circuit's devices through the same handlers as the ESP32's, and WS2812 LED
 * data is read from the timing of a pin's pulses. Not emulated:
 * EEPROM, external interrupts driven from the circuit.
 */
export class UnoBoard implements ProgrammableBoard {
  private readonly cpu: CPU;
  private readonly adc: AVRADC;
  private readonly ports: { port: AVRIOPort; firstPin: number; pinCount: number }[];
  private readonly pinListeners = new Set<PinListener>();
  private readonly serialListeners = new Set<(text: string) => void>();
  private readonly decoder = new TextDecoder();
  private i2c: I2cHandler | null = null;
  private spi: SpiHandler | null = null;
  private ledStrip: LedStripHandler | null = null;
  private readonly ledLines = new Map<number, LedLine>();

  constructor(hex: string) {
    const flash = parseIntelHex(hex, FLASH_SIZE);
    this.cpu = new CPU(new Uint16Array(flash.buffer));
    new AVRTimer(this.cpu, timer0Config);
    new AVRTimer(this.cpu, timer1Config);
    new AVRTimer(this.cpu, timer2Config);
    this.adc = new AVRADC(this.cpu, adcConfig);

    this.ports = [
      { port: new AVRIOPort(this.cpu, portDConfig), firstPin: 0, pinCount: 8 },
      { port: new AVRIOPort(this.cpu, portBConfig), firstPin: 8, pinCount: 6 },
      { port: new AVRIOPort(this.cpu, portCConfig), firstPin: 14, pinCount: 6 },
    ];
    for (const { port, firstPin, pinCount } of this.ports) {
      let previous = this.portDrives(port, pinCount);
      port.addListener(() => {
        const drives = this.portDrives(port, pinCount);
        for (let bit = 0; bit < pinCount; bit++) {
          if (drives[bit] !== previous[bit]) {
            this.pinChanged(firstPin + bit, previous[bit]!, drives[bit]!);
          }
        }
        previous = drives;
      });
    }

    this.attachTwi(new AVRTWI(this.cpu, twiConfig, CLOCK_HZ));
    const spi = new AVRSPI(this.cpu, spiConfig, CLOCK_HZ);
    spi.onByte = (value) => {
      const reply = this.spi?.({
        sck: SCK,
        mosi: MOSI,
        miso: MISO,
        bytes: Uint8Array.of(value),
        timeMs: this.timeMs,
      });
      // The byte comes back after the time it takes to clock it out.
      this.cpu.addClockEvent(() => spi.completeTransfer(reply?.[0] ?? 0xff), spi.transferCycles);
    };

    const usart = new AVRUSART(this.cpu, usart0Config, CLOCK_HZ);
    usart.onByteTransmit = (byte) => {
      const text = this.decoder.decode(Uint8Array.of(byte), { stream: true });
      if (text) for (const listener of this.serialListeners) listener(text);
    };
  }

  /**
   * The TWI hardware tells of each step (start, address, byte, stop); the
   * circuit's devices answer whole exchanges. Bytes written are gathered until
   * the stop, or until a repeated start turns to reading, when they go with the
   * read as one exchange, as a register read does.
   */
  private attachTwi(twi: AVRTWI): void {
    let address = 0;
    let writing = false;
    let written: number[] = [];
    let reading: number[] = [];
    const exchange = (write: number[], readLength: number) =>
      this.i2c?.({ sda: SDA, scl: SCL, address, write: Uint8Array.from(write), readLength }) ?? {
        status: 2 as const,
      };
    const flush = () => {
      if (writing && written.length > 0) exchange(written, 0);
      written = [];
      writing = false;
    };
    twi.eventHandler = {
      start: () => twi.completeStart(),
      stop: () => {
        flush();
        twi.completeStop();
      },
      connectToSlave: (addr, write) => {
        if (write) {
          flush();
          address = addr;
          writing = true;
          // Whether a device answers its address.
          twi.completeConnect(exchange([], 0).status === 0);
          return;
        }
        // A read: any bytes just written to the same device go with it.
        const before = writing && addr === address ? written : [];
        written = [];
        writing = false;
        address = addr;
        const result = exchange(before, I2C_READ_AHEAD);
        reading = result.status === 0 ? [...(result.read ?? [])] : [];
        twi.completeConnect(result.status === 0);
      },
      writeByte: (value) => {
        written.push(value);
        twi.completeWrite(true);
      },
      readByte: () => twi.completeRead(reading.shift() ?? 0xff),
    };
  }

  /**
   * Every pin change goes through here. A HIGH pulse shorter than 2
   * microseconds is read as one bit of WS2812 LED data and is not passed on as a
   * pin change: the circuit could not show so short a pulse anyway. Any longer
   * HIGH is passed on with the time it began, so the circuit hears of it at
   * most 2 microseconds late. Nothing else waits.
   */
  private pinChanged(pin: number, from: PinDrive, to: PinDrive): void {
    const now = this.cpu.cycles;
    let line = this.ledLines.get(pin);
    if (from === 'low' && to === 'high') {
      if (!line) {
        line = {
          rise: null,
          edge: 0,
          bits: [],
          firstRise: 0,
          lastRise: 0,
          lastFall: 0,
          latchPending: false,
        };
        this.ledLines.set(pin, line);
      }
      const timed = line;
      timed.rise = now;
      const edge = ++timed.edge;
      this.cpu.addClockEvent(() => {
        if (timed.edge !== edge) return;
        // Too long for a bit: any LED data before it is broken off.
        timed.rise = null;
        timed.bits = [];
        this.notify(pin, 'high', now);
      }, LED_MAX_HIGH_CYCLES + 1);
      return;
    }
    if (line && line.rise !== null) {
      const rise = line.rise;
      line.rise = null;
      line.edge++;
      if (to === 'low') {
        if (line.bits.length === 0) line.firstRise = rise;
        line.lastRise = rise;
        line.bits.push(now - rise >= LED_ONE_CYCLES ? 1 : 0);
        line.lastFall = now;
        if (!line.latchPending) this.awaitLatch(pin, line, LED_LATCH_CYCLES);
        return;
      }
      // The pin stopped driving instead: an ordinary short pulse after all.
      line.bits = [];
      this.notify(pin, 'high', rise);
    }
    this.notify(pin, to, now);
  }

  /** Checks back once the line may have rested LOW long enough to end a frame. */
  private awaitLatch(pin: number, line: LedLine, cycles: number): void {
    line.latchPending = true;
    this.cpu.addClockEvent(() => {
      line.latchPending = false;
      if (line.bits.length === 0) return;
      const rested = line.rise === null ? this.cpu.cycles - line.lastFall : 0;
      if (rested < LED_LATCH_CYCLES) {
        this.awaitLatch(pin, line, LED_LATCH_CYCLES - rested);
        return;
      }
      const bits = line.bits;
      line.bits = [];
      const length = Math.floor(bits.length / 8);
      if (length === 0 || !this.ledStrip) return;
      const bytes = new Uint8Array(length);
      for (let i = 0; i < length * 8; i++) bytes[i >> 3] = (bytes[i >> 3]! << 1) | bits[i]!;
      const period = bits.length > 1 ? (line.lastRise - line.firstRise) / (bits.length - 1) : 0;
      this.ledStrip({
        pin,
        bytes,
        khz: period > LED_400KHZ_PERIOD_CYCLES ? 400 : 800,
        timeMs: this.timeMs,
      });
    }, cycles);
  }

  private notify(pin: number, drive: PinDrive, cycles: number): void {
    const timeMs = (cycles / CLOCK_HZ) * 1000;
    for (const listener of this.pinListeners) listener(pin, drive, timeMs);
  }

  /** Gives the board the circuit's WS2812-style LEDs, on any pin. */
  onLedStrip(handler: LedStripHandler): void {
    this.ledStrip = handler;
  }

  /** Gives the board the circuit's I²C devices, on A4 (SDA) and A5 (SCL). */
  onI2c(handler: I2cHandler): void {
    this.i2c = handler;
  }

  /** Gives the board the circuit's SPI devices, on D13 (SCK), D11 (MOSI) and D12 (MISO). */
  onSpi(handler: SpiHandler): void {
    this.spi = handler;
  }

  private portDrives(port: AVRIOPort, pinCount: number): PinDrive[] {
    return Array.from({ length: pinCount }, (_, bit) => DRIVE[port.pinState(bit)]);
  }

  private locate(pin: number) {
    const entry = this.ports.find((p) => pin >= p.firstPin && pin < p.firstPin + p.pinCount);
    if (!entry) throw new RangeError(`UNO has no pin ${pin}`);
    return { port: entry.port, bit: pin - entry.firstPin };
  }

  /** Simulated time since reset, in milliseconds. */
  get timeMs(): number {
    return (this.cpu.cycles / CLOCK_HZ) * 1000;
  }

  pinDrive(pin: number): PinDrive {
    const { port, bit } = this.locate(pin);
    return DRIVE[port.pinState(bit)];
  }

  /** True when the pin is an output driven high. */
  digitalRead(pin: number): boolean {
    return this.pinDrive(pin) === 'high';
  }

  /** Sets the logic level the program sees when it reads an input pin. */
  setDigitalInput(pin: number, high: boolean): void {
    const { port, bit } = this.locate(pin);
    port.setPin(bit, high);
  }

  /** Sets the voltage on an analog input, A0-A5 (channel 0-5). */
  setAnalogInput(channel: number, volts: number): void {
    if (channel < 0 || channel > 5) throw new RangeError(`UNO has no analog input A${channel}`);
    this.adc.channelValues[channel] = Math.min(UNO_VCC, Math.max(0, volts));
  }

  /** The voltage on a pin, for analog reads: only A0-A5 (pins 14-19) can measure. */
  setPinVoltage(pin: number, volts: number): void {
    if (pin >= 14 && pin <= 19) this.setAnalogInput(pin - 14, volts);
  }

  /** Called whenever a pin changes what it drives. Returns a function that stops listening. */
  onPinChange(listener: PinListener): () => void {
    this.pinListeners.add(listener);
    return () => this.pinListeners.delete(listener);
  }

  /** Called with text the program writes to its serial port. */
  onSerial(listener: (text: string) => void): () => void {
    this.serialListeners.add(listener);
    return () => this.serialListeners.delete(listener);
  }

  /** Runs the processor for a span of simulated time. */
  runFor(milliseconds: number): void {
    this.runUntil(this.timeMs + milliseconds);
  }

  /** Runs the processor until its clock reaches `timeMs`. Never drifts, however it is sliced. */
  runUntil(timeMs: number): void {
    this.target = (timeMs / 1000) * CLOCK_HZ;
    while (this.cpu.cycles < this.target) {
      avrInstruction(this.cpu);
      this.cpu.tick();
    }
  }
  private target = 0;

  /** Stops the run in progress early. Called from a pin listener. */
  stopAt(timeMs: number): void {
    this.target = Math.min(this.target, (timeMs / 1000) * CLOCK_HZ);
  }
}
