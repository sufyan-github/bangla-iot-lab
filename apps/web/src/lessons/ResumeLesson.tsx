import { LESSONS, type Lesson } from '@banglalab/lessons';
import { PART_DEFINITIONS } from '@banglalab/parts';
import { useNavigate } from 'react-router';
import { useT } from '../i18n';
import { PartIcon } from '../lab/Palette';
import { LedRow, ledsFor } from '../shell/LedRow';
import type { ProjectRecord } from '../storage/projects';
import { lessonProjects } from './start';

/** The drawing for a lesson: its first part's, or a chip for a lesson on the logic sheet. */
export function lessonIcon(lesson: Lesson): string {
  const first = PART_DEFINITIONS.find((definition) => definition.id === lesson.parts[0]);
  return first?.simulates ?? 'logic';
}

/** The lesson last worked on and not finished, with its project: the one to go back to. */
export function lessonInHand(
  projects: readonly ProjectRecord[],
): { lesson: Lesson; project: ProjectRecord; done: number } | undefined {
  const latest = lessonProjects(projects);
  return LESSONS.flatMap((lesson) => {
    const project = latest.get(lesson.id);
    const done = project?.lesson?.done.length ?? 0;
    return project && done < lesson.steps.length ? [{ lesson, project, done }] : [];
  }).sort((a, b) => b.project.updatedAt - a.project.updatedAt)[0];
}

/** "Where you left off": the lesson in hand, its steps as LEDs, and the way back to it. */
export function ResumeLesson({ projects }: { projects: readonly ProjectRecord[] }) {
  const { t, locale, number } = useT();
  const navigate = useNavigate();
  const inHand = lessonInHand(projects);
  if (!inHand) return null;
  const { lesson, project, done } = inHand;
  const steps = t('lessons.state.started', {
    done: number(done),
    total: number(lesson.steps.length),
  });
  return (
    <section
      className="flex flex-wrap items-center gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-[var(--shadow-raised)] sm:p-5"
      data-testid="lesson-resume"
    >
      <span className="grid h-14 w-14 shrink-0 place-items-center rounded-[var(--radius-control)] bg-amber-soft text-amber-deep">
        <PartIcon type={lessonIcon(lesson)} size={30} />
      </span>
      <div className="min-w-0 flex-1 basis-56">
        <h2 className="text-sm font-normal text-ink-soft">{t('lessons.resume')}</h2>
        <p className="text-xl leading-snug font-bold">{lesson.title[locale]}</p>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-soft tabular-nums">
          <LedRow leds={ledsFor(done, lesson.steps.length)} label={steps} />
          {steps}
        </p>
      </div>
      <button
        type="button"
        className="btn btn-primary min-h-12 px-6"
        data-testid="lesson-resume-open"
        onClick={() => navigate(`/lab/${project.id}`)}
      >
        {t('lessons.continue')}
      </button>
    </section>
  );
}
