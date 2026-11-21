import { ESP32_DEVKIT_PINS } from '@banglalab/simulation';
import { describe, expect, it } from 'vitest';
import { PITCH } from '../geometry';
import {
  ESP32_BOARD_VARIANTS,
  ESP32_DEFAULT_VARIANT,
  UNITS_PER_MM,
  esp32BoardLayout,
  esp32BreadboardFits,
  type Esp32BoardVariantId,
} from './geometry';

const VARIANTS = Object.keys(ESP32_BOARD_VARIANTS) as Esp32BoardVariantId[];

describe('ESP32 board geometry', () => {
  it('offers the two row spacings, neither of them measured', () => {
    expect(VARIANTS).toEqual(['rows-0.9in', 'rows-1.0in']);
    expect(ESP32_BOARD_VARIANTS['rows-0.9in'].rowSpacing * 2.54).toBeCloseTo(22.86, 6);
    expect(ESP32_BOARD_VARIANTS['rows-1.0in'].rowSpacing * 2.54).toBeCloseTo(25.4, 6);
    for (const id of VARIANTS) expect(ESP32_BOARD_VARIANTS[id].measured).toBe(false);
    expect(ESP32_BOARD_VARIANTS[ESP32_DEFAULT_VARIANT]).toBeDefined();
  });

  it.each(VARIANTS)('%s: 30 pins, 15 in each row', (id) => {
    const { pins } = esp32BoardLayout(id);
    expect(pins).toHaveLength(30);
    for (const row of ['top', 'bottom'] as const) {
      const columns = pins.filter((pin) => pin.row === row).map((pin) => pin.column);
      expect(columns.sort((a, b) => a - b)).toEqual([...Array(15).keys()]);
    }
  });

  it.each(VARIANTS)(
    '%s: pins exactly one hole pitch apart, rows the stated distance apart',
    (id) => {
      const { pins, variant } = esp32BoardLayout(id);
      const at = (row: string, column: number) =>
        pins.find((pin) => pin.row === row && pin.column === column)!.point;
      for (const row of ['top', 'bottom']) {
        for (let column = 1; column < 15; column++) {
          expect(at(row, column).x - at(row, column - 1).x).toBe(PITCH);
          expect(at(row, column).y).toBe(at(row, 0).y);
        }
      }
      for (let column = 0; column < 15; column++) {
        expect(at('bottom', column).x).toBe(at('top', column).x);
        expect(at('bottom', column).y - at('top', column).y).toBe(variant.rowSpacing * PITCH);
      }
    },
  );

  it('has the ids and labels of the pin table, each once', () => {
    const { pins } = esp32BoardLayout();
    expect(new Set(pins.map((pin) => pin.id)).size).toBe(30);
    expect(pins.map((pin) => [pin.id, pin.label])).toEqual(
      ESP32_DEVKIT_PINS.map((pin) => [pin.id, pin.label]),
    );
    // Labels are unique too, apart from GND, which is printed once in each row.
    const labels = pins.map((pin) => pin.label).filter((label) => label !== 'GND');
    expect(new Set(labels).size).toBe(labels.length);
    expect(pins.filter((pin) => pin.label === 'GND').map((pin) => pin.row)).toEqual([
      'top',
      'bottom',
    ]);
  });

  it('runs each row from the USB end to the antenna end', () => {
    const { pins } = esp32BoardLayout();
    const row = (name: string) =>
      pins
        .filter((pin) => pin.row === name)
        .sort((a, b) => a.column - b.column)
        .map((pin) => pin.label);
    expect(row('top')).toEqual(
      'VIN GND D13 D12 D14 D27 D26 D25 D33 D32 D35 D34 VN VP EN'.split(' '),
    );
    expect(row('bottom')).toEqual(
      '3V3 GND D15 D2 D4 RX2 TX2 D5 D18 D19 D21 RX0 TX0 D22 D23'.split(' '),
    );
  });

  it.each(VARIANTS)('%s: every part lies on the board, and the module clears the pins', (id) => {
    const layout = esp32BoardLayout(id);
    const { width, height, module, shield, antenna, pins } = layout;
    // 51.5 mm long; as wide as the rows plus 1.45 mm outside each.
    expect(width / UNITS_PER_MM).toBeCloseTo(51.5, 1);
    expect(height / UNITS_PER_MM).toBeCloseTo(layout.variant.rowSpacing * 2.54 + 2.9, 1);
    for (const pin of pins) {
      expect(pin.point.x).toBeGreaterThan(0);
      expect(pin.point.x).toBeLessThan(width);
      expect(pin.point.y).toBeGreaterThan(0);
      expect(pin.point.y).toBeLessThan(height);
    }
    // The module is 25.5 mm × 18 mm and ends at the board's antenna edge.
    expect(module.width / UNITS_PER_MM).toBeCloseTo(25.5, 1);
    expect(module.height / UNITS_PER_MM).toBeCloseTo(18, 1);
    expect(module.x + module.width).toBeCloseTo(width, 1);
    const top = pins.find((pin) => pin.row === 'top')!.point.y;
    const bottom = pins.find((pin) => pin.row === 'bottom')!.point.y;
    // Room for a printed label between each pin row and the module.
    expect(module.y - top).toBeGreaterThan(20);
    expect(bottom - (module.y + module.height)).toBeGreaterThan(20);
    for (const part of [shield, antenna]) {
      expect(part.x).toBeGreaterThanOrEqual(module.x);
      expect(part.x + part.width).toBeLessThanOrEqual(module.x + module.width);
      expect(part.y).toBeGreaterThanOrEqual(module.y);
      expect(part.y + part.height).toBeLessThanOrEqual(module.y + module.height);
    }
    expect(shield.x + shield.width).toBeLessThan(antenna.x);
    for (const part of [layout.enButton, layout.bootButton, layout.regulator, layout.usbBridge]) {
      expect(part.x).toBeGreaterThan(0);
      expect(part.x + part.width).toBeLessThan(module.x);
      expect(part.y).toBeGreaterThan(top);
      expect(part.y + part.height).toBeLessThan(bottom);
    }
  });

  it('leaves two free holes per pin pair at 0.9 inch, however the board is placed', () => {
    expect(esp32BreadboardFits('rows-0.9in')).toEqual([
      { topRow: 'a', bottomRow: 'h', freeAbove: 0, freeBelow: 2 },
      { topRow: 'b', bottomRow: 'i', freeAbove: 1, freeBelow: 1 },
      { topRow: 'c', bottomRow: 'j', freeAbove: 2, freeBelow: 0 },
    ]);
  });

  it('leaves one free hole per pin pair at 1.0 inch, on one side only', () => {
    expect(esp32BreadboardFits('rows-1.0in')).toEqual([
      { topRow: 'a', bottomRow: 'i', freeAbove: 0, freeBelow: 1 },
      { topRow: 'b', bottomRow: 'j', freeAbove: 1, freeBelow: 0 },
    ]);
  });
});
