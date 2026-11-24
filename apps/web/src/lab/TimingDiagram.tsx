import type { LogicSheet } from '@banglalab/shared';
import { useEffect, useMemo, useState } from 'react';
import { useT } from '../i18n';
import { TIMING_WINDOW_MS, timingSignals, type TimingStep, type TimingTrace } from './timing';

/** Drawing units across one line; the line stretches to the panel's width. */
const SPAN = 1000;
const HIGH_Y = 4;
const LOW_Y = 20;
const ROW = 24;

/** One line as steps: up for HIGH, down for LOW. */
function stepPath(steps: readonly TimingStep[], from: number, to: number): string {
  if (steps.length === 0) return '';
  const x = (time: number) => (((time - from) / (to - from)) * SPAN).toFixed(1);
  const y = (level: boolean) => (level ? HIGH_Y : LOW_Y);
  let path = `M${x(steps[0]!.time)} ${y(steps[0]!.level)}`;
  for (const step of steps.slice(1)) path += `H${x(step.time)}V${y(step.level)}`;
  return `${path}H${SPAN}`;
}

/**
 * The sheet's levels over the last few seconds, one line for each clock,
 * switch, flip-flop and lamp, now at the right. It can be held still to read.
 */
export function TimingDiagram({
  sheet,
  trace,
  clock,
}: {
  sheet: LogicSheet;
  trace: TimingTrace;
  /** The sheet's time now, in milliseconds, as the trace counts it. */
  clock: () => number;
}) {
  const { t, number } = useT();
  const signals = useMemo(() => timingSignals(sheet), [sheet]);
  const [now, setNow] = useState(clock);
  const [held, setHeld] = useState<{ now: number; steps: TimingStep[][] } | null>(null);
  useEffect(() => {
    if (held) return;
    const timer = setInterval(() => setNow(clock()), 100);
    return () => clearInterval(timer);
  }, [held, clock]);

  const to = held?.now ?? now;
  const from = to - TIMING_WINDOW_MS;
  const rows = held?.steps ?? signals.map((signal) => trace.steps(signal.port, from, to));
  // A faint line at each whole second, moving left as time passes.
  const seconds: number[] = [];
  for (let s = Math.ceil(from / 1000) * 1000; s <= to; s += 1000) {
    seconds.push(((s - from) / TIMING_WINDOW_MS) * SPAN);
  }

  return (
    <section className="space-y-2" data-testid="sheet-timing-diagram">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="flex-1 font-semibold">{t('sheet.timing')}</h3>
        <button
          type="button"
          data-testid="timing-hold"
          aria-pressed={held !== null}
          className="chip"
          onClick={() =>
            setHeld(
              held
                ? null
                : {
                    now: clock(),
                    steps: signals.map((signal) =>
                      trace.steps(signal.port, clock() - TIMING_WINDOW_MS, clock()),
                    ),
                  },
            )
          }
        >
          {t(held ? 'sheet.timingGoOn' : 'sheet.timingHold')}
        </button>
      </div>
      {signals.length === 0 ? (
        <p className="text-ink-soft">{t('sheet.timingEmpty')}</p>
      ) : (
        <div className="screen max-w-[60rem] p-3">
          {signals.map((signal, i) => (
            <div
              key={signal.port}
              className="flex items-center gap-2"
              data-testid="timing-row"
              data-signal={signal.label}
              data-changes={rows[i]!.length}
              data-level={rows[i]!.at(-1)?.level ? 'high' : 'low'}
            >
              <span className="w-14 shrink-0 font-mono text-xs text-chalk/75">{signal.label}</span>
              <svg
                viewBox={`0 0 ${SPAN} ${ROW}`}
                preserveAspectRatio="none"
                className="block h-6 min-w-0 flex-1"
                aria-hidden
              >
                {seconds.map((x) => (
                  <line
                    key={x}
                    x1={x}
                    x2={x}
                    y1={0}
                    y2={ROW}
                    stroke="var(--color-screen-line)"
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
                <path
                  d={stepPath(rows[i]!, from, to)}
                  fill="none"
                  stroke={i % 2 === 0 ? '#8ff0a4' : '#ffd166'}
                  strokeWidth={2}
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
            </div>
          ))}
          <div className="ml-16 flex justify-between font-mono text-xs text-chalk/60">
            <span>{t('sheet.secondsAgo', { count: number(TIMING_WINDOW_MS / 1000) })}</span>
            <span>{t('sheet.now')}</span>
          </div>
        </div>
      )}
    </section>
  );
}
