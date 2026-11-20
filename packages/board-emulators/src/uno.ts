import {
  AVRIOPort,
  AVRTimer,
  AVRUSART,
  CPU,
  PinState,
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

const FLASH_SIZE = 0x8000; // ATmega328P: 32 KiB
const CLOCK_HZ = 16_000_000;

export type PinListener = (pin: number, high: boolean, timeMs: number) => void;

/**
 * An Arduino UNO-compatible board: an emulated ATmega328P at 16 MHz with its
 * GPIO ports, timers and serial port.
 *
 * Digital pins use Arduino numbering: 0-7 are port D, 8-13 are port B and
 * 14-19 (A0-A5) are port C. Phase 0 exposes digital outputs and serial output
 * only; inputs, the ADC and PWM measurement arrive in Phase 1.
 */
export class UnoBoard {
  private readonly cpu: CPU;
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

    this.ports = [
      { port: new AVRIOPort(this.cpu, portDConfig), firstPin: 0, pinCount: 8 },
      { port: new AVRIOPort(this.cpu, portBConfig), firstPin: 8, pinCount: 6 },
      { port: new AVRIOPort(this.cpu, portCConfig), firstPin: 14, pinCount: 6 },
    ];
    for (const { port, firstPin, pinCount } of this.ports) {
      let previous = this.portLevels(port, pinCount);
      port.addListener(() => {
        const levels = this.portLevels(port, pinCount);
        for (let bit = 0; bit < pinCount; bit++) {
          if (levels[bit] !== previous[bit]) {
            for (const listener of this.pinListeners) {
              listener(firstPin + bit, levels[bit]!, this.timeMs);
            }
          }
        }
        previous = levels;
      });
    }

    const usart = new AVRUSART(this.cpu, usart0Config, CLOCK_HZ);
    usart.onByteTransmit = (byte) => {
      const text = this.decoder.decode(Uint8Array.of(byte), { stream: true });
      if (text) for (const listener of this.serialListeners) listener(text);
    };
  }

  private portLevels(port: AVRIOPort, pinCount: number): boolean[] {
    return Array.from({ length: pinCount }, (_, bit) => port.pinState(bit) === PinState.High);
  }

  /** Simulated time since reset, in milliseconds. */
  get timeMs(): number {
    return (this.cpu.cycles / CLOCK_HZ) * 1000;
  }

  /** True when the pin is an output driven high. */
  digitalRead(pin: number): boolean {
    const entry = this.ports.find((p) => pin >= p.firstPin && pin < p.firstPin + p.pinCount);
    if (!entry) throw new RangeError(`UNO has no digital pin ${pin}`);
    return entry.port.pinState(pin - entry.firstPin) === PinState.High;
  }

  /** Called whenever a pin changes level. Returns a function that stops listening. */
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
    const target = this.cpu.cycles + (milliseconds / 1000) * CLOCK_HZ;
    while (this.cpu.cycles < target) {
      avrInstruction(this.cpu);
      this.cpu.tick();
    }
  }
}
