import { hintsFor, type Hint } from '@banglalab/lessons';
import type { MessageKey } from '@banglalab/i18n';
import { useEffect } from 'react';
import { create } from 'zustand';
import { useT } from '../i18n';
import { useLab } from './store';

/**
 * The lab's tutor, first stage (D-116): on request, a hint about what the
 * simulation cannot see wrong, told in three steps so the student does the
 * thinking first: a question, then where (ringed on the board), then how to
 * fix it.
 */
interface TutorState {
  /** The hints found when Hint was pressed, kept up to date as the circuit changes; null while closed. */
  hints: Hint[] | null;
  index: number;
  /** 0: the question only; 1: and where; 2: and how to fix it. */
  shown: 0 | 1 | 2;
}

export const useTutor = create<TutorState>(() => ({ hints: null, index: 0, shown: 0 }));

/** What was last put on each board: the hints about programs read only that. */
function uploadedPrograms() {
  const { programs } = useLab.getState();
  return Object.fromEntries(
    Object.entries(programs).flatMap(([id, program]) =>
      program.hex && program.hexSource ? [[id, { source: program.hexSource }]] : [],
    ),
  );
}

const currentHints = () => hintsFor(useLab.getState().circuit, uploadedPrograms());
const sameHint = (a: Hint, b: Hint | undefined) =>
  b !== undefined && a.rule === b.rule && a.places.join() === b.places.join();

export function openTutor() {
  useTutor.setState({ hints: currentHints(), index: 0, shown: 0 });
}

export const closeTutor = () => useTutor.setState({ hints: null, index: 0, shown: 0 });

const NO_PLACES: string[] = [];

/** The places to ring on the board: those of the hint shown, once "where" is asked. */
export function useTutorPlaces(): string[] {
  // The hint itself is selected, not a new list, so the selection stays the same between renders.
  const hint = useTutor((s) => (s.hints && s.shown >= 1 ? s.hints[s.index] : undefined));
  return hint?.places ?? NO_PLACES;
}

/** Keeps the hints up to date while the card is open: a hint goes once it is fixed. */
export function useTutorWatch(): void {
  useEffect(() => {
    const stop = useLab.subscribe((lab, before) => {
      const { hints, index, shown } = useTutor.getState();
      if (!hints || (lab.circuit === before.circuit && lab.programs === before.programs)) return;
      const next = currentHints();
      const same = next.findIndex((hint) => sameHint(hint, hints[index]));
      useTutor.setState(
        same >= 0 ? { hints: next, index: same, shown } : { hints: next, index: 0, shown: 0 },
      );
    });
    return () => {
      stop();
      closeTutor();
    };
  }, []);
}

/** The button beside Run. */
export function TutorButton() {
  const open = useTutor((s) => s.hints !== null);
  const { t } = useT();
  return (
    <button
      type="button"
      data-testid="tutor"
      aria-pressed={open}
      aria-label={t('tutor.button')}
      onClick={() => (open ? closeTutor() : openTutor())}
      className="btn btn-secondary shrink-0 px-3"
    >
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
      >
        {/* A lamp: the bulb, its base, and a filament. */}
        <path d="M9 18h6M10 21h4M8.5 14.5A6 6 0 1 1 15.5 14.5C14.6 15.3 14 16 14 17H10c0-1-.6-1.7-1.5-2.5z" />
        <path d="M10.5 11.5l1.5 2 1.5-2" />
      </svg>
      <span className="max-md:sr-only">{t('tutor.button')}</span>
    </button>
  );
}

/** The card over the board: one hint at a time, a step at a time. */
export function TutorCard() {
  const hints = useTutor((s) => s.hints);
  const index = useTutor((s) => s.index);
  const shown = useTutor((s) => s.shown);
  const { t, number } = useT();
  if (!hints) return null;
  const hint = hints[index];
  const text = (step: 'nudge' | 'fix') =>
    hint ? t(`tutor.${hint.rule}.${step}` as MessageKey, hint.params) : '';
  const go = (to: number) => useTutor.setState({ index: to, shown: 0 });
  return (
    <section
      role="status"
      data-testid="tutor-card"
      data-rule={hint?.rule ?? 'none'}
      className="pointer-events-auto w-[min(26rem,calc(100vw-2rem))] rounded-[var(--radius-card)] border-2 border-ink-soft bg-surface p-3 shadow-[var(--shadow-raised)]"
    >
      <div className="flex items-start gap-2">
        <h2 className="flex-1 text-sm font-bold">
          {t('tutor.title')}
          {hints.length > 1 && (
            <span className="font-normal text-ink-soft">
              {' '}
              · {t('tutor.count', { i: number(index + 1), n: number(hints.length) })}
            </span>
          )}
        </h2>
        <button
          type="button"
          data-testid="tutor-close"
          aria-label={t('tutor.close')}
          onClick={closeTutor}
          className="-mt-1 -mr-1 grid h-9 w-9 shrink-0 place-items-center rounded-lg text-xl text-ink-soft hover:bg-paper hover:text-ink"
        >
          ×
        </button>
      </div>
      {!hint ? (
        <p data-testid="tutor-none" className="mt-1 text-sm text-ink-soft">
          {t('tutor.none')}
        </p>
      ) : (
        <>
          <p data-testid="tutor-nudge" className="mt-1 text-sm leading-snug">
            {text('nudge')}
          </p>
          {shown >= 2 && (
            <p
              data-testid="tutor-fix"
              className="mt-2 rounded-lg border-l-4 border-amber bg-amber-soft px-3 py-2 text-sm leading-snug"
            >
              {text('fix')}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {shown < 1 && hint.places.length > 0 && (
              <button
                type="button"
                data-testid="tutor-where"
                onClick={() => useTutor.setState({ shown: 1 })}
                className="chip min-h-9 px-3 text-xs"
              >
                {t('tutor.where')}
              </button>
            )}
            {shown < 2 && (
              <button
                type="button"
                data-testid="tutor-fix-button"
                onClick={() => useTutor.setState({ shown: 2 })}
                className="chip min-h-9 px-3 text-xs"
              >
                {t('tutor.fix')}
              </button>
            )}
            {hints.length > 1 && (
              <span className="ml-auto flex gap-1">
                <button
                  type="button"
                  data-testid="tutor-prev"
                  aria-label={t('tutor.prev')}
                  disabled={index === 0}
                  onClick={() => go(index - 1)}
                  className="chip min-h-9 px-3 text-xs disabled:opacity-40"
                >
                  ‹
                </button>
                <button
                  type="button"
                  data-testid="tutor-next"
                  aria-label={t('tutor.next')}
                  disabled={index === hints.length - 1}
                  onClick={() => go(index + 1)}
                  className="chip min-h-9 px-3 text-xs disabled:opacity-40"
                >
                  ›
                </button>
              </span>
            )}
          </div>
        </>
      )}
    </section>
  );
}
