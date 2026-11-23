import { TERMINAL_ROWS, BREADBOARD_SPECS, type TerminalRow } from '@banglalab/shared';
import { ESP32_DEVKIT_PINS, ESP32_PINS_PER_ROW } from '@banglalab/simulation';
import { PITCH, type Box, type Point } from '../units';

/**
 * Size and pin positions of the 30-pin ESP32 development board, seen from
 * above with the USB socket on the left and the antenna on the right.
 *
 * Positions are in canvas units from the board's top-left corner. One hole
 * pitch (2.54 mm) is 24 units, as everywhere in the lab.
 *
 * Only two things here are exact: the pin pitch, and the module's outline,
 * which is from Espressif's module datasheet. Everything else is an estimate
 * of a board that differs from maker to maker. No board has been measured:
 * see docs/engineering/esp32-pin-model.md.
 */

/** Canvas units in one millimetre. */
export const UNITS_PER_MM = PITCH / 2.54;
const mm = (value: number) => Math.round(value * UNITS_PER_MM * 100) / 100;

export type Esp32BoardVariantId = 'rows-0.9in' | 'rows-1.0in';

export interface Esp32BoardVariant {
  id: Esp32BoardVariantId;
  name: string;
  /** Distance between the two pin rows, in hole pitches. */
  rowSpacing: number;
  /** True only when the dimensions were taken from a real board. Neither has been. */
  measured: boolean;
}

/**
 * The distance between the two rows differs between makers. Both values below
 * are the ones commonly quoted, and neither has been measured.
 */
export const ESP32_BOARD_VARIANTS: Record<Esp32BoardVariantId, Esp32BoardVariant> = {
  'rows-0.9in': {
    id: 'rows-0.9in',
    name: 'Rows 0.9 inch (22.86 mm) apart',
    rowSpacing: 9,
    measured: false,
  },
  'rows-1.0in': {
    id: 'rows-1.0in',
    name: 'Rows 1.0 inch (25.4 mm) apart',
    rowSpacing: 10,
    measured: false,
  },
};
/** Drawn unless another is asked for: the spacing most often quoted for the 30-pin board. */
export const ESP32_DEFAULT_VARIANT: Esp32BoardVariantId = 'rows-1.0in';

/** Estimates, in millimetres. */
const BOARD_LENGTH = 51.5;
/** From a long edge of the board to the centre of the pin row beside it. */
const EDGE_TO_ROW = 1.45;
/** From the USB end of the board to the centre of the first pin. */
const END_TO_FIRST_PIN = 7;
/** The module's outline: 18 mm × 25.5 mm. From the ESP32-WROOM-32 datasheet v3.8, Table 1. */
const MODULE = { length: 25.5, width: 18 };
/** The metal shield, read off the same datasheet's dimension drawing (Figure 7). */
const SHIELD = { length: 17.6, width: 15.8, inset: 0.9 };

export interface Esp32PinPlace {
  /** Terminal id, as in the pin table: "d23", "gnd1". */
  id: string;
  /** Printed label. */
  label: string;
  row: 'top' | 'bottom';
  /** 0 at the USB end, 14 at the antenna end. */
  column: number;
  /** Centre of the pin, from the board's top-left corner. */
  point: Point;
}

export interface Esp32BoardLayout {
  variant: Esp32BoardVariant;
  /** The circuit board itself. */
  width: number;
  height: number;
  pins: readonly Esp32PinPlace[];
  /** The module: its whole outline, its shield, and the bare antenna end. */
  module: Box;
  shield: Box;
  antenna: Box;
  /** The USB socket, which overhangs the left edge. */
  usb: Box;
  enButton: Box;
  bootButton: Box;
  regulator: Box;
  usbBridge: Box;
  powerLed: Point;
  pinLed: Point;
}

const box = (x: number, y: number, width: number, height: number): Box => ({
  x: mm(x),
  y: mm(y),
  width: mm(width),
  height: mm(height),
});

export function esp32BoardLayout(
  variantId: Esp32BoardVariantId = ESP32_DEFAULT_VARIANT,
): Esp32BoardLayout {
  const variant = ESP32_BOARD_VARIANTS[variantId];
  const boardWidth = variant.rowSpacing * 2.54 + 2 * EDGE_TO_ROW;
  const middle = boardWidth / 2;
  // Whole units, so every pin is an exact number of pitches from the first.
  const firstPin = Math.round(mm(END_TO_FIRST_PIN));
  const topY = Math.round(mm(EDGE_TO_ROW));
  const rowY = { top: topY, bottom: topY + variant.rowSpacing * PITCH };

  // Turned so the antenna points right, the board's left row runs along the top.
  const pins = ESP32_DEVKIT_PINS.map((pin): Esp32PinPlace => {
    const row = pin.side === 'left' ? 'top' : 'bottom';
    const column = ESP32_PINS_PER_ROW - 1 - pin.index;
    return {
      id: pin.id,
      label: pin.label,
      row,
      column,
      point: { x: firstPin + column * PITCH, y: rowY[row] },
    };
  });

  const moduleX = BOARD_LENGTH - MODULE.length;
  const moduleY = middle - MODULE.width / 2;
  return {
    variant,
    width: mm(BOARD_LENGTH),
    height: mm(boardWidth),
    pins,
    module: box(moduleX, moduleY, MODULE.length, MODULE.width),
    shield: box(moduleX + SHIELD.inset, middle - SHIELD.width / 2, SHIELD.length, SHIELD.width),
    antenna: box(
      moduleX + SHIELD.inset + SHIELD.length + 0.5,
      moduleY + 0.6,
      MODULE.length - SHIELD.inset - SHIELD.length - 1,
      MODULE.width - 1.2,
    ),
    usb: box(-1.2, middle - 3.9, 6, 7.8),
    enButton: box(0.9, middle - 10.4, 3.4, 4.4),
    bootButton: box(0.9, middle + 6, 3.4, 4.4),
    regulator: box(8.2, middle - 6.6, 3.6, 6.6),
    usbBridge: box(15.2, middle - 2.6, 5.2, 5.2),
    powerLed: { x: mm(21), y: mm(middle - 6.2) },
    pinLed: { x: mm(21), y: mm(middle + 6.2) },
  };
}

export interface BreadboardFit {
  /** Breadboard rows the two pin rows sit in. */
  topRow: TerminalRow;
  bottomRow: TerminalRow;
  /** Holes left for wires beside each pin: outside the board, in the same strip of five. */
  freeAbove: number;
  freeBelow: number;
}

/**
 * Every way the board can straddle the breadboard's centre channel, and the
 * holes each leaves free. With rows 0.9 inch apart there are two free holes
 * for each pair of pins (2 + 0, 1 + 1 or 0 + 2); with 1.0 inch there is one,
 * on one side only.
 */
export function esp32BreadboardFits(variantId: Esp32BoardVariantId): BreadboardFit[] {
  const { rowSpacing } = ESP32_BOARD_VARIANTS[variantId];
  const rowY = (row: TerminalRow) => BREADBOARD_SPECS.half.rowY[row]!;
  const upper = TERMINAL_ROWS.slice(0, 5);
  const lower = TERMINAL_ROWS.slice(5);
  return upper.flatMap((topRow, above) => {
    const below = lower.findIndex((row) => rowY(row) - rowY(topRow) === rowSpacing);
    if (below < 0) return [];
    return [
      { topRow, bottomRow: lower[below], freeAbove: above, freeBelow: lower.length - 1 - below },
    ];
  });
}
