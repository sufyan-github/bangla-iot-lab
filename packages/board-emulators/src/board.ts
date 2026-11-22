/**
 * What a pin is doing electrically:
 * - `low` / `high`: output, driving the pin to 0 V or the board's supply
 * - `input`: high impedance
 * - `pullup` / `pulldown`: input with the internal resistor to the supply or to ground
 */
export type PinDrive = 'low' | 'high' | 'input' | 'pullup' | 'pulldown';

export type PinListener = (pin: number, drive: PinDrive, timeMs: number) => void;

/**
 * A board that runs a program, as the circuit simulation sees it: something
 * that can be run up to a moment in time, says what each pin drives, and is
 * told what each pin sees. Pins are numbered as the program numbers them.
 */
export interface ProgrammableBoard {
  /** Simulated time since reset, in milliseconds. */
  readonly timeMs: number;
  pinDrive(pin: number): PinDrive;
  /** Sets the logic level the program sees when it reads an input pin. */
  setDigitalInput(pin: number, high: boolean): void;
  /**
   * Optional. Says that nothing in the circuit decides this pin's level: it is
   * unconnected, or behind an open switch, or the pin is driving it itself. A
   * board that models its own pull resistors then lets them decide, at once,
   * instead of being held to a level the circuit reported a moment ago.
   */
  releaseInput?(pin: number): void;
  /** Sets the voltage on a pin, for the program's analog reads. Ignored on a pin that cannot measure. */
  setPinVoltage(pin: number, volts: number): void;
  /** Called whenever a pin changes what it drives. Returns a function that stops listening. */
  onPinChange(listener: PinListener): () => void;
  /** Called with text the program writes to its serial port. */
  onSerial(listener: (text: string) => void): () => void;
  /** Runs the program until its clock reaches `timeMs`. */
  runUntil(timeMs: number): void;
  /** Optional. Frees what the board holds, when it is taken out of a circuit. */
  dispose?(): void;
}
