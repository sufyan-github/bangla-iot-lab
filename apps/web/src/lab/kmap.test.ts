import { describe, expect, it } from 'vitest';
import { kmapLayout } from './kmap';

describe('K-map layout', () => {
  it('puts inputs in Gray-code order, so neighbours differ in one input', () => {
    expect(kmapLayout(2)).toMatchObject({
      rowNames: 'A',
      colNames: 'B',
      cells: [
        [0, 1],
        [2, 3],
      ],
    });
    expect(kmapLayout(3)).toMatchObject({
      rowNames: 'A',
      colNames: 'BC',
      colLabels: ['00', '01', '11', '10'],
      cells: [
        [0, 1, 3, 2],
        [4, 5, 7, 6],
      ],
    });
    const four = kmapLayout(4)!;
    expect(four.rowNames + four.colNames).toBe('ABCD');
    expect(four.cells[2]).toEqual([12, 13, 15, 14]);
    // Each cell differs from the next one across (wrapping round) in exactly one bit.
    for (const row of four.cells)
      row.forEach((cell, i) => {
        const next = row[(i + 1) % row.length]!;
        const differ = cell ^ next;
        expect(differ & (differ - 1)).toBe(0);
      });
  });

  it('has none for one input or more than four', () => {
    expect(kmapLayout(1)).toBeNull();
    expect(kmapLayout(5)).toBeNull();
  });
});
