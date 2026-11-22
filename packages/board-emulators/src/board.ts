/**
 * What a pin is doing electrically:
 * - `low` / `high`: output, driving the pin to 0 V or the board's supply
 * - `input`: high impedance
 * - `pullup` / `pulldown`: input with the internal resistor to the supply or to ground
 */
export type PinDrive = 'low' | 'high' | 'input' | 'pullup' | 'pulldown';

export type PinListener = (pin: number, drive: PinDrive, timeMs: number) => void;

/**
 * One exchange on an I2C bus with the board as master: bytes written to the
 * device at `address`, then `readLength` bytes read back from it. Both empty
 * asks only whether a device is there.
 */
export interface I2cTransfer {
  /** The board pins the program uses as the bus's data and clock lines. */
  sda: number;
  scl: number;
  address: number;
  write: Uint8Array;
  readLength: number;
}

/**
 * How an exchange went: 0 done, 2 no device answered the address, 3 the device
 * refused a byte, 4 the bus cannot work. `read` holds the bytes read back.
 */
export interface I2cResult {
  status: 0 | 2 | 3 | 4;
  read?: Uint8Array;
}

export type I2cHandler = (transfer: I2cTransfer) => I2cResult;

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
  /**
   * Optional. Called while the board is running, from one of its own listeners:
   * the run in progress is to stop at `timeMs`, earlier than it was asked to.
   * A sensor that answers within microseconds needs the board stopped at the
   * instant its answer begins.
   */
  stopAt?(timeMs: number): void;
  /**
   * Optional. Gives the board whoever answers for the devices on its I2C buses.
   * A board that does not offer this cannot talk to I2C parts.
   */
  onI2c?(handler: I2cHandler): void;
  /** Optional. Frees what the board holds, when it is taken out of a circuit. */
  dispose?(): void;
}
