/** Colours of the resistor colour code, indexed by digit 0-9. */
const DIGIT_COLORS = [
  '#1c1c1c', // black
  '#7b4a21', // brown
  '#d8342a', // red
  '#ef7d1a', // orange
  '#f2cf1d', // yellow
  '#2e9d57', // green
  '#2f6fd0', // blue
  '#8a4fbf', // violet
  '#8d9396', // grey
  '#f4f4f4', // white
];
const GOLD = '#c9a227';
const SILVER = '#b9bfc4';

/**
 * Four-band colour code for a resistance: two digits, a multiplier and a gold
 * (±5 %) tolerance band. 330 Ω → orange, orange, brown, gold.
 */
export function resistorBands(ohms: number): [string, string, string, string] {
  let exponent = Math.floor(Math.log10(ohms)) - 1;
  let digits = Math.round(ohms / 10 ** exponent);
  if (digits >= 100) {
    digits = 10;
    exponent += 1;
  }
  const multiplier =
    exponent === -1
      ? GOLD
      : exponent === -2
        ? SILVER
        : (DIGIT_COLORS[exponent] ?? DIGIT_COLORS[0]!);
  return [DIGIT_COLORS[Math.floor(digits / 10)]!, DIGIT_COLORS[digits % 10]!, multiplier, GOLD];
}
