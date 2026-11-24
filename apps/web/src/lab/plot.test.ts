import { describe, expect, it } from 'vitest';
import { MAX_POINTS, parsePlot } from './plot';

describe('the serial plotter reads numbers as the Arduino one does', () => {
  it('takes unnamed numbers by their place, and skips text and the unfinished last line', () => {
    const plot = parsePlot('starting\n12 30\n13,31\n14\t32\n15 3');
    expect(plot.names).toEqual(['1', '2']);
    expect(plot.series).toEqual([
      [12, 13, 14],
      [30, 31, 32],
    ]);
  });

  it('keeps named values by name, with gaps where a line lacks one', () => {
    const plot = parsePlot('temp:24.5 hum:60\ntemp:25\nalarm! temp:-1.5e1 hum:61\n');
    expect(plot.names).toEqual(['temp', 'hum']);
    expect(plot.series[0]).toEqual([24.5, 25, -15]);
    expect(plot.series[1]).toEqual([60, NaN, 61]);
  });

  it('keeps only the most recent lines', () => {
    const text = Array.from({ length: MAX_POINTS + 50 }, (_, i) => `${i}\n`).join('');
    const plot = parsePlot(text);
    expect(plot.series[0]).toHaveLength(MAX_POINTS);
    expect(plot.series[0]!.at(-1)).toBe(MAX_POINTS + 49);
  });

  it('keeps every line when asked to, for a data log', () => {
    const text = Array.from({ length: 300 }, (_, i) => `${i}`).join('\n') + '\n';
    expect(parsePlot(text).series[0]).toHaveLength(200);
    expect(parsePlot(text, Infinity).series[0]).toHaveLength(300);
  });
});
