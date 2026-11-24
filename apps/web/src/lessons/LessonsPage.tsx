import { LESSONS, lessonKind, type Lesson } from '@banglalab/lessons';
import { PART_DEFINITIONS } from '@banglalab/parts';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { useT } from '../i18n';
import { PartIcon } from '../lab/Palette';
import { LedRow, ledsFor, type Led } from '../shell/LedRow';
import { useHashScroll } from '../shell/useHashScroll';
import { projectStore, type ProjectRecord } from '../storage/projects';
import { lessonIcon, lessonInHand, ResumeLesson } from './ResumeLesson';
import { lessonProjects, startLesson } from './start';

type State = 'new' | 'started' | 'done';
const LED_OF: Record<State, Led> = { new: 'off', started: 'now', done: 'on' };

/**
 * The kit lessons and then the projects, as a numbered path (D-103): each
 * lesson is a stop on a wire, with how far the student has got in it, on this
 * device. Progress is drawn as LEDs: one for every lesson, lit when it is done.
 */
export function LessonsPage() {
  const { t, locale, number } = useT();
  const navigate = useNavigate();
  const projects = useQuery({ queryKey: ['projects'], queryFn: projectStore.list });
  const latest = lessonProjects(projects.data ?? []);
  // A link from the glossary names a lesson: go to it once the list is drawn.
  useHashScroll(!projects.isPending);
  const start = useMutation({
    mutationFn: (lesson: Lesson) => startLesson(lesson, lesson.title[locale]),
    onSuccess: (project) => navigate(`/lab/${project.id}`),
  });
  const parts = LESSONS.filter((lesson) => lessonKind(lesson) === 'part');
  const builds = LESSONS.filter((lesson) => lessonKind(lesson) === 'project');

  const stateOf = (lesson: Lesson): State => {
    const project = latest.get(lesson.id);
    const done = project?.lesson?.done.length ?? 0;
    return !project ? 'new' : done === lesson.steps.length ? 'done' : 'started';
  };
  const finishedOf = (lessons: readonly Lesson[]) =>
    lessons.filter((lesson) => stateOf(lesson) === 'done').length;
  const progress = (lessons: readonly Lesson[]) =>
    t('lessons.trackProgress', {
      done: number(finishedOf(lessons)),
      total: number(lessons.length),
    });
  // The lesson last worked on and not finished: the one that stands out in the path.
  const resume = lessonInHand(projects.data ?? [])?.lesson;
  const logic = (lesson: Lesson) =>
    lesson.sheet === true ||
    lesson.parts.some((id) => /^(74hc|cd4511|seven-segment|clock-555)/.test(id));
  const tracks = [
    { id: 'kit', title: t('lessons.track.kit'), lessons: parts.filter((l) => !logic(l)) },
    { id: 'logic', title: t('lessons.track.logic'), lessons: parts.filter(logic) },
  ];
  let counter = 0;
  const track = (title: string, lessons: Lesson[], first: number) => (
    <section key={title} className="mb-10">
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <h3 className="text-xl font-bold">{title}</h3>
        <span className="text-sm text-ink-soft tabular-nums">{progress(lessons)}</span>
        <LedRow
          leds={lessons.map((lesson) => LED_OF[stateOf(lesson)])}
          label={progress(lessons)}
          className="basis-full sm:basis-auto"
        />
      </div>
      <ol>
        {lessons.map((lesson, index) => (
          <LessonCard
            key={lesson.id}
            lesson={lesson}
            number={first + index}
            last={index === lessons.length - 1}
            current={lesson.id === resume?.id}
            project={latest.get(lesson.id)}
            busy={start.isPending}
            onStart={() => start.mutate(lesson)}
            onOpen={(id) => navigate(`/lab/${id}`)}
          />
        ))}
      </ol>
    </section>
  );

  return (
    <main className="flex-1">
      <div className="band">
        <div className="mx-auto max-w-4xl px-4 pt-8 pb-8 sm:pt-12">
          <h1 className="text-3xl font-extrabold sm:text-[2.75rem] sm:leading-tight">
            {t('lessons.title')}
          </h1>
          <p className="mt-2 max-w-xl text-lg text-chalk/80">{t('lessons.intro')}</p>
          <LedRow
            leds={LESSONS.map((lesson) => LED_OF[stateOf(lesson)])}
            label={progress(LESSONS)}
            className="mt-5"
          />
          <p className="mt-2 text-sm font-semibold tabular-nums">{progress(LESSONS)}</p>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-4 py-6">
        {start.isError && (
          <p
            role="alert"
            className="mb-4 rounded-lg border-2 border-danger bg-danger-soft px-4 py-3"
          >
            {t('home.storageError')}
          </p>
        )}
        <div className="mb-10 empty:hidden">
          <ResumeLesson projects={projects.data ?? []} />
        </div>

        <h2 className="mb-5 text-2xl font-bold">{t('lessons.partsTitle')}</h2>
        <div data-testid="lesson-list">
          {tracks.map((item) => {
            const section = track(item.title, item.lessons, counter + 1);
            counter += item.lessons.length;
            return section;
          })}
        </div>

        <h2 className="text-2xl font-bold">{t('lessons.projectsTitle')}</h2>
        <p className="mt-1 mb-5 max-w-2xl text-ink-soft">{t('lessons.projectsIntro')}</p>
        <div data-testid="project-lesson-list">{track(t('lessons.track.projects'), builds, 1)}</div>
        <p className="text-sm text-ink-soft">{t('lessons.licence')}</p>
      </div>
    </main>
  );
}

/** One stop on the path: its number on the wire, then the lesson. */
function LessonCard(props: {
  lesson: Lesson;
  number: number;
  last: boolean;
  /** The lesson last worked on and not finished: the one that stands out. */
  current: boolean;
  project: ProjectRecord | undefined;
  busy: boolean;
  onStart(): void;
  onOpen(projectId: string): void;
}) {
  const { lesson, project } = props;
  const { t, locale, number } = useT();
  const total = lesson.steps.length;
  const done = project?.lesson?.done.length ?? 0;
  const state: State = !project ? 'new' : done === total ? 'done' : 'started';
  const partName = (id: string) =>
    PART_DEFINITIONS.find((definition) => definition.id === id)?.name[locale] ?? id;
  const lessonTitle = (id: string) => LESSONS.find((l) => l.id === id)?.title[locale] ?? id;
  const stepsDone = t('lessons.state.started', { done: number(done), total: number(total) });
  return (
    <li
      id={lesson.id}
      data-testid="lesson-card"
      data-lesson={lesson.id}
      data-state={state}
      className={`relative grid scroll-mt-4 grid-cols-[2.75rem_minmax(0,1fr)] ${props.last ? '' : 'pb-3'}`}
    >
      {/* The wire down to the next lesson: green once this one is done. */}
      {!props.last && (
        <span
          aria-hidden
          className={`absolute top-9 bottom-0 left-[1.03rem] w-[3px] ${state === 'done' ? 'bg-ok' : 'bg-line-strong'}`}
        />
      )}
      <span
        aria-hidden
        className={`relative grid h-9 w-9 place-items-center rounded-full text-sm font-bold tabular-nums ${
          state === 'done'
            ? 'bg-ok text-surface'
            : state === 'started'
              ? 'border-[3px] border-amber bg-surface'
              : 'border-2 border-line-strong bg-surface text-ink-soft'
        }`}
      >
        {state === 'done' ? (
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor">
            <path
              d="M5 12.5l4.5 4.5L19 7.5"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          number(props.number)
        )}
      </span>
      <div
        className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[var(--radius-card)] bg-surface p-3 sm:flex-nowrap sm:p-4 ${
          props.current
            ? 'border-2 border-amber shadow-[var(--shadow-raised)]'
            : 'border border-line'
        }`}
      >
        <span
          className={`grid h-12 w-12 shrink-0 place-items-center rounded-[var(--radius-control)] ${
            props.current ? 'bg-amber-soft text-amber-deep' : 'bg-sunk text-ink-soft'
          }`}
        >
          <PartIcon type={lessonIcon(lesson)} />
        </span>
        <div className="min-w-0 flex-1 basis-56">
          <p className="text-xs text-ink-faint tabular-nums">
            {t(lessonKind(lesson) === 'project' ? 'lessons.label.project' : 'lessons.label.part', {
              n: number(props.number),
            })}
          </p>
          <h4 className="text-[1.0625rem] leading-snug font-semibold">{lesson.title[locale]}</h4>
          <p className="mt-0.5 text-sm text-ink-soft">{lesson.summary[locale]}</p>
          <p className="mt-1 text-xs text-ink-faint">
            {[...lesson.parts.map(partName), t('lessons.steps', { count: number(total) })].join(
              ', ',
            )}
          </p>
          {lesson.after && lesson.after.length > 0 && (
            <p className="mt-0.5 text-xs text-ink-faint" data-testid="lesson-after">
              {t('lessons.after', { list: lesson.after.map(lessonTitle).join(', ') })}
            </p>
          )}
          {state === 'started' && (
            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-soft tabular-nums">
              <LedRow leds={ledsFor(done, total)} label={stepsDone} />
              {stepsDone}
            </p>
          )}
          {state === 'done' && (
            <p className="mt-1 text-sm font-semibold text-ok">{t('lessons.state.done')}</p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {project && (
            <button
              type="button"
              data-testid="lesson-continue"
              onClick={() => props.onOpen(project.id)}
              className={`btn min-h-11 px-4 text-sm ${props.current ? 'btn-primary' : 'btn-secondary'}`}
            >
              {t(state === 'done' ? 'lessons.open' : 'lessons.continue')}
            </button>
          )}
          <button
            type="button"
            data-testid="lesson-start"
            disabled={props.busy}
            onClick={props.onStart}
            className={`btn min-h-11 px-4 text-sm ${project ? 'btn-quiet' : 'btn-secondary'}`}
          >
            {t(project ? 'lessons.again' : 'lessons.start')}
          </button>
        </div>
      </div>
    </li>
  );
}
