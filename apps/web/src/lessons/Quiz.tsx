import type { Lesson } from '@banglalab/lessons';
import { useState } from 'react';
import { useT } from '../i18n';
import { Rich } from './Rich';

/**
 * The lesson's questions, one choice each. An answer is marked at once, with
 * why the right choice is right; nothing is scored or sent anywhere.
 */
export function Quiz({ quiz }: { quiz: NonNullable<Lesson['quiz']> }) {
  const { t, locale, number } = useT();
  const [chosen, setChosen] = useState<(number | null)[]>(() => quiz.map(() => null));
  const right = chosen.filter((choice, i) => choice === quiz[i]!.answer).length;
  const answered = chosen.filter((choice) => choice !== null).length;
  return (
    <section className="space-y-4" data-testid="lesson-quiz">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-ink-soft">{t('quiz.title')}</p>
        {answered === quiz.length && (
          <p className="text-sm font-semibold text-accent tabular-nums" data-testid="quiz-score">
            {t('quiz.score', { right: number(right), total: number(quiz.length) })}
          </p>
        )}
      </div>
      {quiz.map((question, q) => {
        const pick = chosen[q];
        return (
          <fieldset key={q} className="space-y-1.5" data-testid="quiz-question">
            <legend className="mb-1 font-medium">
              <Rich text={question.question[locale]} />
            </legend>
            {question.choices.map((choice, c) => {
              const isPicked = pick === c;
              const isRight = c === question.answer;
              const state = pick === null ? '' : isRight ? 'right' : isPicked ? 'wrong' : '';
              return (
                <button
                  key={c}
                  type="button"
                  data-testid="quiz-choice"
                  data-state={state || undefined}
                  disabled={pick !== null}
                  onClick={() => setChosen(chosen.map((old, i) => (i === q ? c : old)))}
                  className={`flex min-h-11 w-full items-center gap-2 rounded-[var(--radius-control)] border-2 px-3 py-2 text-left text-sm ${
                    state === 'right'
                      ? 'border-ok bg-ok-soft'
                      : state === 'wrong'
                        ? 'border-danger bg-danger-soft'
                        : 'border-line bg-surface enabled:hover:border-ink-soft'
                  }`}
                >
                  <span aria-hidden className="w-4 shrink-0 font-bold">
                    {state === 'right' ? '✓' : state === 'wrong' ? '✗' : ''}
                  </span>
                  <Rich text={choice[locale]} />
                </button>
              );
            })}
            {pick !== null && (
              <p className="text-sm text-ink-soft" role="status">
                <span className="font-semibold">
                  {t(pick === question.answer ? 'quiz.right' : 'quiz.notQuite')}
                </span>{' '}
                <Rich text={question.why[locale]} />
              </p>
            )}
          </fieldset>
        );
      })}
    </section>
  );
}
