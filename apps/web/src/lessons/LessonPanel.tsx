import { LESSONS, lessonKind } from '@banglalab/lessons';
import { isProgrammable } from '@banglalab/shared';
import { useNavigate } from 'react-router';
import { useT } from '../i18n';
import { starterProgram } from '../lab/starters';
import { useLab } from '../lab/store';
import { describeCheck } from './describe';
import { useHandbook } from './handbook';
import { useLessonState } from './progress';
import { Rich } from './Rich';
import { startLesson } from './start';

/** The open project's lesson: the step to do, what is checked, and how far the student has got. */
export function LessonPanel() {
  const lesson = useLessonState((s) => s.lesson);
  const progress = useLessonState((s) => s.progress);
  const checks = useLessonState((s) => s.checks);
  const goTo = useLessonState((s) => s.goTo);
  const boardId = useLab((s) => s.circuit.components.find(isProgrammable)?.id);
  const { t, locale, number } = useT();
  const navigate = useNavigate();
  const handbook = useHandbook(lesson?.id ?? '');
  if (!lesson || !progress) return null;

  const step = lesson.steps[progress.step]!;
  const total = lesson.steps.length;
  const stepDone = progress.done.includes(progress.step);
  const finished = progress.done.length === total;
  const last = progress.step === total - 1;
  const next = LESSONS.find((l) => l.order === lesson.order + 1);
  // Lessons and projects are numbered apart, as on the lessons page.
  const sameKind = LESSONS.filter((l) => lessonKind(l) === lessonKind(lesson));
  const position = sameKind.indexOf(lesson) + 1;

  const putProgram = () => {
    if (boardId && lesson.program) {
      useLab.getState().uploadProgram(boardId, starterProgram(lesson.program, 'esp32'));
    }
  };
  const openNext = async () => {
    if (!next) return;
    const project = await startLesson(next, next.title[locale]);
    navigate(`/lab/${project.id}`);
  };

  return (
    <section className="space-y-4 p-4" data-testid="lesson-panel" data-lesson={lesson.id}>
      <header>
        <p className="text-sm text-ink-soft">
          {t(lessonKind(lesson) === 'project' ? 'lesson.projectNumber' : 'lesson.number', {
            n: number(position),
            total: number(sameKind.length),
          })}
        </p>
        <h2 className="text-xl leading-snug font-semibold">{lesson.title[locale]}</h2>
      </header>

      <ol className="flex flex-wrap gap-1.5" aria-label={t('lesson.steps')}>
        {lesson.steps.map((_, index) => {
          const done = progress.done.includes(index);
          const current = index === progress.step;
          return (
            <li key={index}>
              <button
                type="button"
                data-testid="lesson-step"
                data-done={done}
                aria-current={current ? 'step' : undefined}
                aria-label={t('lesson.stepOf', { n: number(index + 1), total: number(total) })}
                onClick={() => goTo(index)}
                className={`min-h-11 min-w-11 rounded-full border-2 text-sm font-semibold ${
                  current ? 'border-ink' : 'border-transparent'
                } ${done ? 'bg-mat text-paper' : 'bg-paper text-ink-soft'}`}
              >
                {done ? '✓' : number(index + 1)}
              </button>
            </li>
          );
        })}
      </ol>

      <div className="rounded-xl border border-line bg-surface p-4">
        <p className="mb-2 text-sm font-semibold text-ink-soft">
          {t('lesson.stepOf', { n: number(progress.step + 1), total: number(total) })}
        </p>
        <Rich text={step.text[locale]} className="leading-relaxed" />
        {step.program && (
          <button
            type="button"
            data-testid="lesson-program"
            disabled={!boardId}
            onClick={putProgram}
            className="mt-3 min-h-11 rounded-lg bg-amber px-4 font-semibold text-ink hover:brightness-105 disabled:opacity-50"
          >
            {t('lesson.program')}
          </button>
        )}
      </div>

      {step.checks.length > 0 && (
        <div>
          <p className="mb-1.5 text-sm font-semibold text-ink-soft">{t('lesson.checks')}</p>
          <ul className="space-y-1.5" data-testid="lesson-checks">
            {step.checks.map((check, index) => {
              const passed = stepDone || (checks[index] ?? false);
              return (
                <li
                  key={index}
                  data-testid="lesson-check"
                  data-passed={passed}
                  className="flex gap-2 text-sm leading-snug"
                >
                  <span
                    aria-hidden
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      passed ? 'bg-mat text-paper' : 'border-2 border-line'
                    }`}
                  >
                    {passed ? '✓' : ''}
                  </span>
                  <span>
                    <span className="sr-only">
                      {t(passed ? 'lesson.passed' : 'lesson.notYet')}:{' '}
                    </span>
                    {describeCheck(check, { t, locale, number })}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {stepDone && !finished && (
        <p role="status" className="rounded-lg bg-mat/10 px-3 py-2 font-semibold text-mat">
          {t('lesson.stepDone')}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          data-testid="lesson-back"
          disabled={progress.step === 0}
          onClick={() => goTo(progress.step - 1)}
          className="min-h-11 rounded-lg border-2 border-line px-4 font-medium hover:border-ink-soft disabled:opacity-40"
        >
          ‹ {t('lesson.back')}
        </button>
        {!last && (
          <button
            type="button"
            data-testid="lesson-next"
            onClick={() => goTo(progress.step + 1)}
            className={`min-h-11 flex-1 rounded-lg px-4 font-semibold ${
              stepDone || step.checks.length === 0
                ? 'bg-amber text-ink hover:brightness-105'
                : 'border-2 border-line text-ink-soft hover:border-ink-soft'
            }`}
          >
            {t('lesson.next')} ›
          </button>
        )}
      </div>

      {finished && (
        <div
          data-testid="lesson-finished"
          className="space-y-3 rounded-xl border-2 border-mat bg-mat/5 p-4"
        >
          <p className="text-lg font-semibold">{t('lesson.finished')}</p>
          <div>
            <p className="mb-1 text-sm font-semibold text-ink-soft">{t('lesson.learned')}</p>
            <ul className="list-disc space-y-1 pl-5">
              {lesson.learned[locale].map((point) => (
                <li key={point}>
                  <Rich text={point} />
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="mb-1 text-sm font-semibold text-ink-soft">{t('lesson.tryNext')}</p>
            <Rich text={lesson.tryNext[locale]} />
          </div>
          {next && (
            <button
              type="button"
              data-testid="lesson-open-next"
              onClick={() => void openNext()}
              className="min-h-11 w-full rounded-lg bg-amber px-4 font-semibold text-ink hover:brightness-105"
            >
              {t('lesson.nextLesson', { title: next.title[locale] })}
            </button>
          )}
        </div>
      )}

      {handbook && (
        <details data-testid="lesson-handbook" className="rounded-xl border-2 border-danger/50 p-3">
          <summary className="cursor-pointer font-semibold">{t('lesson.handbook')}</summary>
          <p className="mt-2 text-sm text-danger">{t('lesson.handbookNote')}</p>
          <p className="mt-2 font-semibold">{handbook.title}</p>
          <Rich text={handbook.text} className="mt-2 text-sm leading-relaxed" />
        </details>
      )}

      <p className="text-xs text-ink-soft">{t('lessons.licence')}</p>
    </section>
  );
}
