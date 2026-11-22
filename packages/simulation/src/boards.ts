import type { ProgrammableType } from '@banglalab/shared';
import {
  ESP32_INPUT_MAX_VOLTAGE,
  ESP32_INPUT_RESISTANCE,
  ESP32_LOGIC_HIGH,
  ESP32_LOGIC_LOW,
  ESP32_PIN_MAX_CURRENT,
  ESP32_PIN_SINK_RESISTANCE,
  ESP32_PIN_SOURCE_RESISTANCE,
  ESP32_PULL_RESISTANCE,
  ESP32_BOARD_OVERHEAD_CURRENT,
  ESP32_SUPPLY_CURRENT,
  ESP32_USB_DIODE_CURRENT,
  ESP32_USB_DIODE_DROP,
  ESP32_USB_VOLTAGE,
  ESP32_VDD,
  ESP32_VIN_FROM_USB,
} from './esp32-pins';
import {
  LOGIC_HIGH,
  LOGIC_LOW,
  PIN_INPUT_RESISTANCE,
  PIN_MAX_CURRENT,
  PIN_OUTPUT_RESISTANCE,
  PIN_PULLUP_RESISTANCE,
  SUPPLY_MAX_CURRENT,
  SUPPLY_RESISTANCE,
} from './library';

/**
 * What the ESP32 board itself takes from its 5 V side with the radio off: the
 * middle of the chip's range and the rest of the board. About 80 mA.
 */
const ESP32_OWN_CURRENT =
  (ESP32_SUPPLY_CURRENT.wifiOff.min + ESP32_SUPPLY_CURRENT.wifiOff.max) / 2 +
  ESP32_BOARD_OVERHEAD_CURRENT;

/**
 * What the circuit needs to know about a board a program runs on: its supply
 * sockets, and how one of its pins behaves as an output and as an input.
 */
export interface BoardModel {
  /** Pin numbers a program can use run from 0 to one less than this. */
  pinCount: number;
  /** Voltage of a HIGH output and of the pull-up resistor. */
  vcc: number;
  /** Sockets that give out a supply voltage. The first is the one the pins run from. */
  supplies: readonly {
    terminal: string;
    volts: number;
    resistance: number;
    maxCurrent: number;
    /**
     * For a supply pin that sits behind a diode: the voltage before the diode and
     * what the board itself draws from the pin's side of it, as a resistance.
     * Such a pin gives current but never takes it back into its source, so the
     * pin may also be fed from outside.
     */
    behindDiode?: { sourceVolts: number; drop: number; dropAt: number; ownLoad: number };
  }[];
  /** Ground sockets: all the same piece of copper, known to the netlist as "<id>.gnd". */
  grounds: readonly string[];
  /** Resistance of an output driving HIGH and driving LOW. */
  sourceResistance: number;
  sinkResistance: number;
  /** Internal pull-up and pull-down. */
  pullResistance: number;
  inputResistance: number;
  /** Above `logicHigh` an input reads HIGH, below `logicLow` LOW; between, it keeps what it had. */
  logicHigh: number;
  logicLow: number;
  /** Absolute maximum current for one pin. */
  maxPinCurrent: number;
  /** Highest voltage a pin may be given. More can destroy the pin of a real board. */
  maxPinVoltage: number;
  /** False for a pin that has no output driver and no pull resistors. */
  canDrive(pin: number): boolean;
}

export const BOARD_MODELS: Record<ProgrammableType, BoardModel> = {
  /** ATmega328P at 5 V, typical datasheet values. */
  uno: {
    pinCount: 20,
    vcc: 5,
    supplies: [
      { terminal: '5v', volts: 5, resistance: SUPPLY_RESISTANCE, maxCurrent: SUPPLY_MAX_CURRENT },
    ],
    grounds: ['gnd', 'gnd2'],
    sourceResistance: PIN_OUTPUT_RESISTANCE,
    sinkResistance: PIN_OUTPUT_RESISTANCE,
    pullResistance: PIN_PULLUP_RESISTANCE,
    inputResistance: PIN_INPUT_RESISTANCE,
    logicHigh: LOGIC_HIGH,
    logicLow: LOGIC_LOW,
    maxPinCurrent: PIN_MAX_CURRENT,
    // ATmega328P absolute maximum: the supply plus half a volt.
    maxPinVoltage: 5.5,
    canDrive: () => true,
  },
  /**
   * ESP32 at 3.3 V, powered from USB. Every figure is from esp32-pins.ts, where
   * its source and how sure it is are recorded. None has been checked on a board.
   */
  esp32: {
    pinCount: 40,
    vcc: ESP32_VDD,
    supplies: [
      // The regulator's 3.3 V, and the USB 5 V after the board's diode.
      {
        terminal: '3v3',
        volts: ESP32_VDD,
        resistance: SUPPLY_RESISTANCE,
        maxCurrent: SUPPLY_MAX_CURRENT,
      },
      {
        terminal: 'vin',
        volts: ESP32_VIN_FROM_USB,
        resistance: SUPPLY_RESISTANCE,
        maxCurrent: SUPPLY_MAX_CURRENT,
        behindDiode: {
          sourceVolts: ESP32_USB_VOLTAGE,
          drop: ESP32_USB_DIODE_DROP,
          dropAt: ESP32_USB_DIODE_CURRENT,
          ownLoad: ESP32_VIN_FROM_USB / ESP32_OWN_CURRENT,
        },
      },
    ],
    grounds: ['gnd1', 'gnd2'],
    sourceResistance: ESP32_PIN_SOURCE_RESISTANCE,
    sinkResistance: ESP32_PIN_SINK_RESISTANCE,
    pullResistance: ESP32_PULL_RESISTANCE,
    inputResistance: ESP32_INPUT_RESISTANCE,
    logicHigh: ESP32_LOGIC_HIGH,
    logicLow: ESP32_LOGIC_LOW,
    maxPinCurrent: ESP32_PIN_MAX_CURRENT,
    // Not 5 V tolerant: 3.6 V at most.
    maxPinVoltage: ESP32_INPUT_MAX_VOLTAGE,
    // GPIO 34 to 39 are inputs only.
    canDrive: (pin) => pin < 34,
  },
};
