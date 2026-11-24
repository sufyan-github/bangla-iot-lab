/**
 * A Karnaugh map's layout for a truth table of two to four inputs (A the
 * highest bit of a row's number): which inputs go down the side and which
 * across the top, in Gray-code order, so neighbouring cells differ in one input.
 */
export interface KMapLayout {
  /** The inputs down the side and across the top, by letter. */
  rowNames: string;
  colNames: string;
  /** The labels in order, "00", "01", "11", "10". */
  rowLabels: string[];
  colLabels: string[];
  /** The truth-table row in each cell, [row][col]. */
  cells: number[][];
}

const GRAY: Record<number, string[]> = { 1: ['0', '1'], 2: ['00', '01', '11', '10'] };

export function kmapLayout(inputs: number): KMapLayout | null {
  if (inputs < 2 || inputs > 4) return null;
  const letters = 'ABCD'.slice(0, inputs);
  const rowBits = Math.floor(inputs / 2);
  const colBits = inputs - rowBits;
  const rowLabels = GRAY[rowBits]!;
  const colLabels = GRAY[colBits]!;
  return {
    rowNames: letters.slice(0, rowBits),
    colNames: letters.slice(rowBits),
    rowLabels,
    colLabels,
    cells: rowLabels.map((r) => colLabels.map((c) => parseInt(r + c, 2))),
  };
}
