/**
 * Numbers a program prints, read as the Arduino serial plotter reads them:
 * each complete line is one moment; its numbers, separated by spaces, commas
 * or tabs, are its values. A value may be named, "temp:24.5", and keeps that
 * name; unnamed ones are called by their place (1, 2, …). Lines without a
 * number are skipped.
 */
export interface Plot {
  names: string[];
  /** For each name, its values, one per line that had it (NaN where a line did not). */
  series: number[][];
}

/** The most lines kept, and series drawn. */
export const MAX_POINTS = 200;
export const MAX_SERIES = 6;

const NUMBER = /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i;

/** `limit` is how many of the latest lines are kept: the plotter draws 200, a data log takes all. */
export function parsePlot(text: string, limit = MAX_POINTS): Plot {
  // The last line may still be arriving: leave it until its end comes.
  const lines = text
    .split('\n')
    .slice(0, -1)
    .slice(Number.isFinite(limit) ? -limit * 2 : 0);
  const names: string[] = [];
  const rows: Map<string, number>[] = [];
  for (const line of lines) {
    const values = new Map<string, number>();
    let place = 0;
    for (const token of line.trim().split(/[\s,;]+/)) {
      if (!token) continue;
      const colon = token.lastIndexOf(':');
      const name = colon > 0 ? token.slice(0, colon) : null;
      const raw = colon > 0 ? token.slice(colon + 1) : token;
      if (!NUMBER.test(raw)) continue;
      place++;
      const key = name ?? String(place);
      values.set(key, Number(raw));
      if (!names.includes(key) && names.length < MAX_SERIES) names.push(key);
    }
    if (values.size > 0) rows.push(values);
  }
  const kept = Number.isFinite(limit) ? rows.slice(-limit) : rows;
  return { names, series: names.map((name) => kept.map((row) => row.get(name) ?? NaN)) };
}
