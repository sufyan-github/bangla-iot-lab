import {
  AVRADC,
  AVRIOPort,
  AVRTimer,
  AVRUSART,
  CPU,
  PinState,
  adcConfig,
  avrInstruction,
  portBConfig,
  portCConfig,
  portDConfig,
  timer0Config,
  timer1Config,
  timer2Config,
  usart0Config,
} from 'avr8js';
import { parseIntelHex } from './intel-hex';
import type { PinDrive, PinListener, ProgrammableBoard } from './board';

const FLASH_SIZE = 0x8000; // ATmega328P: 32 KiB
const CLOCK_HZ = 16_000_000;

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
 * and 14-19 are A0-A5 (port C). Not emulated: SPI, I²C, EEPROM, external
 * interrupts driven from the circuit.
 */
export class UnoBoard implements ProgrammableBoard {
  private readonly cpu: CPU;
  private readonly adc: AVRADC;
  private readonly ports: { port: AVRIOPort; firstPin: number; pinCount: number }[];
  private readonly pinListeners = new Set<PinListener>();
  private readonly serialListeners = new Set<(text: string) => void>();
  private readonly decoder = new TextDecoder();

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
            for (const listener of this.pinListeners) {
              listener(firstPin + bit, drives[bit]!, this.timeMs);
            }
          }
        }
        previous = drives;
      });
    }

    const usart = new AVRUSART(this.cpu, usart0Config, CLOCK_HZ);
    usart.onByteTransmit = (byte) => {
      const text = this.decoder.decode(Uint8Array.of(byte), { stream: true });
      if (text) for (const listener of this.serialListeners) listener(text);
    };
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
    const target = (timeMs / 1000) * CLOCK_HZ;
    while (this.cpu.cycles < target) {
      avrInstruction(this.cpu);
      this.cpu.tick();
    }
  }
}
