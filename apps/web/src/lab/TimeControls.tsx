import { useState } from 'react';
import { useT } from '../i18n';
import { useLab } from './store';

/** How far one press of "step" moves time on, in milliseconds. */
const STEPS = [1, 10, 100] as const;

const icon = {
  pause: 'M8 5v14M16 5v14',
  play: 'M7 4.5v15l12-7.5z',
  step: 'M6 5v14l9-7zM18 5v14',
  restart: 'M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4.5v4h4',
} as const;

function Glyph({ name }: { name: keyof typeof icon }) {
  const filled = name === 'play' || name === 'step';
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <path
        d={icon[name]}
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={filled ? 1 : 2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Pause, step and start again (D-112), for a running circuit that changes over
 * time: a capacitor charging, a board's program, a clock. Held still, the lab
 * shows the time it stands at, and each step moves it on by the amount chosen.
 */
export function TimeControls() {
  const running = useLab((s) => s.running);
  const timeDependent = useLab((s) => s.timeDependent);
  const paused = useLab((s) => s.paused);
  const timeMs = useLab((s) => s.labTimeMs);
  const [stepMs, setStepMs] = useState<(typeof STEPS)[number]>(10);
  const { t, number, locale } = useT();
  // Seconds to the millisecond, in the reader's digits: "১.২৩০ s".
  const seconds = new Intl.NumberFormat(locale === 'bn' ? 'bn-BD' : 'en-GB', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
    useGrouping: false,
  }).format(Math.round(timeMs) / 1000);
  if (!running || !timeDependent) return null;
  const { setPaused, stepTime, restart } = useLab.getState();
  const button =
    'grid h-10 w-10 place-items-center rounded-lg text-ink hover:bg-paper disabled:opacity-40';
  return (
    <div
      role="group"
      aria-label={t('time.label')}
      data-testid="time-controls"
      data-paused={paused}
      className="pointer-events-auto flex items-center gap-1 rounded-xl border border-line bg-surface p-1 shadow-[var(--shadow-raised)]"
    >
      <button
        type="button"
        data-testid="time-pause"
        aria-pressed={paused}
        aria-label={t(paused ? 'time.resume' : 'time.pause')}
        title={t(paused ? 'time.resume' : 'time.pause')}
        onClick={() => setPaused(!paused)}
        className={`${button} ${paused ? 'bg-amber-soft ring-2 ring-amber' : ''}`}
      >
        <Glyph name={paused ? 'play' : 'pause'} />
      </button>
      <button
        type="button"
        data-testid="time-step"
        disabled={!paused}
        aria-label={t('time.step', { ms: number(stepMs) })}
        title={t('time.step', { ms: number(stepMs) })}
        onClick={() => stepTime(stepMs)}
        className={button}
      >
        <Glyph name="step" />
      </button>
      <label className="sr-only" htmlFor="time-step-size">
        {t('time.stepSize')}
      </label>
      <select
        id="time-step-size"
        data-testid="time-step-size"
        value={stepMs}
        onChange={(event) => setStepMs(Number(event.target.value) as (typeof STEPS)[number])}
        className="h-10 rounded-lg border border-line bg-surface px-1.5 text-sm tabular-nums"
      >
        {STEPS.map((ms) => (
          <option key={ms} value={ms}>
            {t('time.ms', { ms: number(ms) })}
          </option>
        ))}
      </select>
      <button
        type="button"
        data-testid="time-restart"
        aria-label={t('time.restart')}
        title={t('time.restart')}
        onClick={restart}
        className={button}
      >
        <Glyph name="restart" />
      </button>
      <span
        data-testid="time-now"
        className="min-w-[5.5rem] px-2 text-right font-mono text-sm text-ink-soft tabular-nums"
        aria-live={paused ? 'polite' : 'off'}
      >
        {t('time.at', { seconds })}
      </span>
    </div>
  );
}
