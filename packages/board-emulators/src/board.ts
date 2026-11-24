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
 * One step on a 1-Wire bus on a board pin, with the board as master: a reset
 * (answered 1 when a device gave a presence pulse), writing a bit, or reading
 * one. `timeMs` is the board's own clock, for devices that take time to answer.
 */
export interface OneWireStep {
  pin: number;
  op: 'reset' | 'write' | 'read';
  bit: 0 | 1;
  timeMs: number;
}
export type OneWireHandler = (step: OneWireStep) => 0 | 1;

/** A board's UART as its program set it up, at a moment of the board's own clock. */
export interface UartPort {
  /** 1 or 2: Serial1, Serial2. */
  port: number;
  baud: number;
  rx: number;
  tx: number;
  timeMs: number;
}
/** Whoever answers for the modules wired to a board's UARTs. */
export interface UartHandler {
  /** Bytes the program sent out on the port's TX pin. */
  write(port: UartPort, bytes: Uint8Array): void;
  /** Bytes that have reached the port's RX pin since the last call, up to `port.timeMs`. */
  receive(port: UartPort): number[];
}

/**
 * One exchange on an SPI bus with the board as master: `bytes` go out on the
 * data-out pin, and as many come back on the data-in pin. The devices that take
 * part are chosen by the levels on their chip-select pins at this moment.
 */
export interface SpiTransfer {
  /** The board pins the program uses as the bus's clock, data out and data in. */
  sck: number;
  mosi: number;
  miso: number;
  bytes: Uint8Array;
  timeMs: number;
}
/** Answers an exchange with the bytes that came back, or nothing when no device answered. */
export type SpiHandler = (transfer: SpiTransfer) => Uint8Array | undefined;

/** Colour bytes a program sent down a WS2812-style LED data line on a pin. */
export interface LedStripFrame {
  pin: number;
  bytes: Uint8Array;
  /** 800 or 400 kilobits a second. */
  khz: number;
  timeMs: number;
}
export type LedStripHandler = (frame: LedStripFrame) => void;

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
  /** Optional. Gives the board whoever answers for the devices on its 1-Wire buses. */
  onOneWire?(handler: OneWireHandler): void;
  /** Optional. Gives the board whoever answers for the modules on its UARTs. */
  onUart?(handler: UartHandler): void;
  /** Optional. Gives the board whoever answers for the devices on its SPI buses. */
  onSpi?(handler: SpiHandler): void;
  /** Optional. Gives the board whoever receives what it sends to LED strips. */
  onLedStrip?(handler: LedStripHandler): void;
  /**
   * Optional. Called with all of the board's saved settings, as text, each time
   * the program changes them (the ESP32's Preferences). A board that offers
   * this takes the settings to start from when it is made.
   */
  onSettingsSaved?(listener: (settings: string) => void): void;
  /**
   * Optional. A request from the lab's browser panel to the board's own web
   * server, for a path such as "/led?on=1". Returns the request's number, or
   * why it cannot be sent: the board is not on Wi-Fi, or serves no pages.
   */
  request?(path: string): number | 'no-wifi' | 'no-server' | 'busy';
  /**
   * Optional. Gives the board the lab's MQTT broker. A board that does not offer
   * this cannot use MQTT.
   */
  onMqtt?(handler: MqttHandler): void;
  /**
   * Optional. Gives the board the lab's made-up web services, for the
   * program's own HTTP requests. A board that does not offer this cannot make any.
   */
  onWeb?(handler: WebHandler): void;
  /** Optional. Called with each answer the board's web server gives. */
  onHttpResponse?(listener: (response: HttpResponse) => void): void;
  /** Optional. Frees what the board holds, when it is taken out of a circuit. */
  dispose?(): void;
}

/** An answer from a board's web server. Status 0 means the program sent none. */
export interface HttpResponse {
  /** The request it answers. */
  id: number;
  path: string;
  status: number;
  type: string;
  /** Headers the program set, such as Location. */
  headers: Record<string, string>;
  body: string;
}

/**
 * A request the board's program makes, answered by the lab: the status and
 * body, or null when nothing answers at that address.
 */
export type WebHandler = (
  method: string,
  url: string,
  body: string,
) => { status: number; type: string; body: string } | null;

/** What a board asks of the lab's MQTT broker. Messages for the board come through `deliver`. */
export interface MqttHandler {
  /** False when the broker cannot be reached (the board is not on Wi-Fi). */
  connect(clientId: string, deliver: (topic: string, payload: string) => void): boolean;
  disconnect(): void;
  publish(topic: string, payload: string, retained: boolean): boolean;
  subscribe(filter: string, subscribe: boolean): boolean;
}
