import { LESSONS, lessonText } from '@banglalab/lessons';
import { describe, expect, it } from 'vitest';
import { pinKind } from './pins';

describe('pin names in lesson text', () => {
  it('knows power, ground and signal pins by name', () => {
    for (const name of ['VCC', 'VIN', '3V3', '5V', '+', 'OUT+', 'B+']) {
      expect(pinKind(name), name).toBe('power');
    }
    for (const name of ['GND', '−', 'OUT−', 'IN−']) expect(pinKind(name), name).toBe('ground');
    for (const name of ['D4', 'D34', 'SDA', 'SCL', 'TX2', 'AO', 'Trig', 'ECHO', 'Q7', 'NO']) {
      expect(pinKind(name), name).toBe('signal');
    }
  });

  it('leaves other bold words alone: parts, buttons, gates, values', () => {
    for (const word of ['LED', 'Run', 'AND', 'XOR', 'OLED', 'L298N', 'DHT11', 'servo', 'চালু করো']) {
      expect(pinKind(word), word).toBeNull();
    }
    for (const word of ['5 V', '10 kΩ', 'ON', 'I2C', 'ESP1', '74HC595']) {
      expect(pinKind(word), word).toBeNull();
    }
  });

  it('finds the pins the lessons name most', () => {
    // Every bold word across the lessons, in both languages.
    const bold = new Set(
      LESSONS.flatMap((lesson) =>
        [lessonText(lesson, 'bn'), lessonText(lesson, 'en')].flatMap((text) =>
          [...text.matchAll(/\*\*([^*]+)\*\*/g)].map((match) => match[1]!),
        ),
      ),
    );
    for (const pin of ['GND', 'VCC', 'VIN', '3V3', 'D27', 'D34', 'D4', 'SDA', 'SCL']) {
      expect(bold.has(pin), pin).toBe(true);
      expect(pinKind(pin), pin).not.toBeNull();
    }
    // A sentence or a phrase in bold is never taken for a pin.
    for (const word of bold) if (/\s/.test(word)) expect(pinKind(word), word).toBeNull();
  });
});
