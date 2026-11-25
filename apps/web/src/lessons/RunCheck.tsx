import { placesOf, unmetWiring, type WiringCheck } from '@banglalab/lessons';
import { useEffect } from 'react';
import { create } from 'zustand';
import { useT } from '../i18n';
import { useLab } from '../lab/store';
import { describeCheck } from './describe';
import { useLessonState } from './progress';

/**
 * The check made when Run is pressed in a lesson (D-110): what the lesson has
 * asked to be built so far and is not there. The circuit runs all the same;
 * a lesson may want a fault to be seen. What is shown on the board is the
 * places of the item chosen, ringed.
 */
interface RunCheckState {
  unmet: WiringCheck[];
  /** The item whose places are ringed on the board, by its place in `unmet`. */
  shown: number | null;
}

export const useRunCheck = create<RunCheckState>(() => ({ unmet: [], shown: null }));

/** The places on the board to ring now: those of the item chosen, while it is still unmet. */
export function useRunCheckPlaces(): string[] {
  const shown = useRunCheck((s) => (s.shown === null ? null : s.unmet[s.shown]));
  const circuit = useLab((s) => s.circuit);
  return shown ? placesOf(shown.check, circuit) : [];
}

const unmetNow = () => {
  const { lesson, progress } = useLessonState.getState();
  if (!lesson || !progress) return [];
  return unmetWiring(lesson, progress.step, useLab.getState().circuit);
};

/**
 * Watches for Run in a lesson, and keeps the list up to date as the student
 * fixes the circuit: an item goes once it is met, and the card with the last.
 */
export function useRunCheckWatch(): void {
  useEffect(() => {
    const stop = useLab.subscribe((lab, before) => {
      if (lab.running && !before.running) {
        const unmet = unmetNow();
        // Point at the first item there is something on the board to point at for.
        const first = unmet.findIndex((item) => placesOf(item.check, lab.circuit).length > 0);
        useRunCheck.setState({ unmet, shown: first >= 0 ? first : null });
      } else if (lab.circuit !== before.circuit && useRunCheck.getState().unmet.length > 0) {
        const unmet = unmetNow();
        const { shown, unmet: was } = useRunCheck.getState();
        // Keep pointing at the same item while it is still unmet; else at the first left.
        const same = shown === null ? -1 : unmet.findIndex((item) => sameItem(item, was[shown]));
        useRunCheck.setState({
          unmet,
          shown: unmet.length === 0 ? null : shown === null ? null : same >= 0 ? same : 0,
        });
      }
    });
    // A new lesson or step starts afresh.
    const stopLesson = useLessonState.subscribe((state, before) => {
      if (state.lesson !== before.lesson || state.progress?.step !== before.progress?.step) {
        useRunCheck.setState({ unmet: [], shown: null });
      }
    });
    return () => {
      stop();
      stopLesson();
      useRunCheck.setState({ unmet: [], shown: null });
    };
  }, []);
}

const sameItem = (a: WiringCheck, b: WiringCheck | undefined) =>
  b !== undefined && a.step === b.step && a.check === b.check;

/** The card over the board: what is still to be built, each with a way to see where. */
export function RunCheckCard() {
  const unmet = useRunCheck((s) => s.unmet);
  const shown = useRunCheck((s) => s.shown);
  const { t, locale, number } = useT();
  const circuit = useLab((s) => s.circuit);
  if (unmet.length === 0) return null;
  return (
    <section
      role="status"
      data-testid="run-check"
      className="pointer-events-auto w-[min(26rem,calc(100vw-2rem))] rounded-[var(--radius-card)] border-2 border-amber bg-surface p-3 shadow-[var(--shadow-raised)]"
    >
      <div className="flex items-start gap-2">
        <h2 className="flex-1 text-sm font-bold">{t('runCheck.title')}</h2>
        <button
          type="button"
          data-testid="run-check-close"
          aria-label={t('runCheck.close')}
          onClick={() => useRunCheck.setState({ unmet: [], shown: null })}
          className="-mt-1 -mr-1 grid h-9 w-9 shrink-0 place-items-center rounded-lg text-xl text-ink-soft hover:bg-paper hover:text-ink"
        >
          ×
        </button>
      </div>
      <p className="mt-0.5 text-sm text-ink-soft">{t('runCheck.intro')}</p>
      <ul className="mt-2 space-y-1.5">
        {unmet.map((item, index) => {
          const places = placesOf(item.check, circuit);
          return (
            <li
              key={`${item.step}-${index}`}
              data-testid="run-check-item"
              className="flex items-center gap-2 text-sm leading-snug"
            >
              <span
                aria-hidden
                className="h-5 w-5 shrink-0 rounded-full border-2 border-dashed border-amber"
              />
              <span className="min-w-0 flex-1">
                {describeCheck(item.check, { t, locale, number })}
                <span className="text-ink-faint">
                  {' '}
                  · {t('runCheck.step', { n: number(item.step + 1) })}
                </span>
              </span>
              {places.length > 0 && (
                <button
                  type="button"
                  data-testid="run-check-show"
                  aria-pressed={shown === index}
                  onClick={() => useRunCheck.setState({ shown: shown === index ? null : index })}
                  className="chip min-h-9 shrink-0 px-3 text-xs"
                >
                  {t('runCheck.show')}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
