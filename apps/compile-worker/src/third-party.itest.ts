import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The starter firmware is distributed with its LGPL source in
 * third_party/arduino-avr. That copy is only "corresponding source" if it is the
 * same as what the compiler actually reads, which is the pinned upstream fetch in
 * vendor/. This test fails the build if the two ever differ.
 */
const VENDOR = path.resolve(import.meta.dirname, '../vendor');
const COPY = path.resolve(import.meta.dirname, '../../../third_party/arduino-avr');

const PAIRS = [
  ['ArduinoCore-avr-1.8.8/cores/arduino', 'ArduinoCore-avr/cores/arduino'],
  ['ArduinoCore-avr-1.8.8/variants/standard', 'ArduinoCore-avr/variants/standard'],
  ['Servo-1.3.0/src', 'Servo/src'],
  ['LiquidCrystal-1.0.7/src', 'LiquidCrystal/src'],
] as const;

async function files(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(directory, path.join(entry.parentPath, entry.name)))
    .sort();
}

describe('source distributed with the starter firmware', () => {
  for (const [copy, vendor] of PAIRS) {
    it(`${copy} is the pinned upstream source, file for file`, async () => {
      const copied = await files(path.join(COPY, copy));
      expect(copied.length).toBeGreaterThan(0);
      expect(copied).toEqual(await files(path.join(VENDOR, vendor)));
      for (const file of copied) {
        const ours = await readFile(path.join(COPY, copy, file));
        const theirs = await readFile(path.join(VENDOR, vendor, file));
        expect(ours.equals(theirs), `${copy}/${file} differs from upstream`).toBe(true);
      }
    });
  }
});
