import { describe, expect, it } from 'vitest';
import { resistorBands } from './resistor-bands';

const BLACK = '#1c1c1c';
const BROWN = '#7b4a21';
const RED = '#d8342a';
const ORANGE = '#ef7d1a';
const YELLOW = '#f2cf1d';
const VIOLET = '#8a4fbf';
const GOLD = '#c9a227';

describe('resistor colour code', () => {
  it.each([
    [330, [ORANGE, ORANGE, BROWN]],
    [220, [RED, RED, BROWN]],
    [1_000, [BROWN, BLACK, RED]],
    [4_700, [YELLOW, VIOLET, RED]],
    [47_000, [YELLOW, VIOLET, ORANGE]],
    [100_000, [BROWN, BLACK, YELLOW]],
    [10, [BROWN, BLACK, BLACK]],
    [4.7, [YELLOW, VIOLET, GOLD]],
  ])('%d Ω', (ohms, expected) => {
    expect(resistorBands(ohms)).toEqual([...expected, GOLD]);
  });

  it('rounds to two significant digits', () => {
    expect(resistorBands(999)).toEqual([BROWN, BLACK, RED, GOLD]); // 1.0 kΩ
  });
});
