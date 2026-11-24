import { useMemo } from 'react';
import { useT } from '../i18n';
import { downloadText, toCsv } from './csv';
import { parsePlot } from './plot';

/** Line colours on the instrument screen, easy to tell apart. */
const COLOURS = ['#8ff0a4', '#ffd166', '#6cc7ff', '#ff8fa3', '#c8a2ff', '#f5f5f5'];
const WIDTH = 320;
const HEIGHT = 150;

/** The numbers a program prints, drawn as lines, newest on the right. */
export function SerialPlot({ text }: { text: string }) {
  const { t, number } = useT();
  const plot = useMemo(() => parsePlot(text), [text]);
  const values = plot.series.flat().filter(Number.isFinite);
  if (values.length === 0) {
    return (
      <div
        className="screen grid h-44 place-items-center p-3 text-center text-sm text-paper/60"
        data-testid="serial-plot"
      >
        {t('code.plotEmpty')}
      </div>
    );
  }
  let low = Math.min(...values);
  let high = Math.max(...values);
  if (high === low) {
    high += 1;
    low -= 1;
  }
  const points = plot.series[0]!.length;
  const x = (i: number) => (points < 2 ? WIDTH : (i / (points - 1)) * WIDTH);
  const y = (v: number) => HEIGHT - 6 - ((v - low) / (high - low)) * (HEIGHT - 12);
  const path = (series: number[]) =>
    series
      .map((v, i) =>
        Number.isFinite(v)
          ? `${i === 0 || !Number.isFinite(series[i - 1]!) ? 'M' : 'L'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`
          : '',
      )
      .join('');

  return (
    <div className="screen p-2" data-testid="serial-plot" data-series={plot.names.length}>
      <div className="flex justify-between px-1 font-mono text-xs text-paper/60 tabular-nums">
        <span>{number(Math.round(high * 100) / 100)}</span>
        <span>{t('code.plotPoints', { count: number(points) })}</span>
      </div>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="block h-36 w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label={t('code.plot')}
      >
        {[0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            x1={0}
            x2={WIDTH}
            y1={HEIGHT * f}
            y2={HEIGHT * f}
            stroke="var(--color-screen-line)"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {plot.series.map((series, s) => (
          <path
            key={plot.names[s]}
            d={path(series)}
            fill="none"
            stroke={COLOURS[s]}
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
          />
        ))}
      </svg>
      <div className="flex justify-between px-1 font-mono text-xs text-paper/60 tabular-nums">
        <span>{number(Math.round(low * 100) / 100)}</span>
      </div>
      <button
        type="button"
        data-testid="plot-csv"
        className="float-right mt-1 rounded-md px-2 py-1 text-xs text-paper/80 hover:bg-paper/10"
        onClick={() => {
          // Every line still in the monitor, not only those drawn.
          const all = parsePlot(text, Infinity);
          const rows = (all.series[0] ?? []).map((_, i) => [i + 1, ...all.series.map((s) => s[i])]);
          downloadText('serial-plot.csv', toCsv(['sample', ...all.names], rows));
        }}
      >
        {t('code.plotCsv')}
      </button>
      <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1 px-1 text-xs">
        {plot.names.map((name, s) => {
          const latest = [...plot.series[s]!].reverse().find(Number.isFinite);
          return (
            <li key={name} className="flex items-center gap-1.5 font-mono">
              <span className="h-2 w-3 rounded-sm" style={{ background: COLOURS[s] }} />
              <span className="text-paper/70">{name}</span>
              <span className="font-semibold text-paper tabular-nums">
                {latest === undefined ? '–' : number(latest)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
