import { LESSONS, lessonKind, type Lesson } from '@banglalab/lessons';
import { PART_DEFINITIONS } from '@banglalab/parts';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { useT } from '../i18n';
import { useHashScroll } from '../shell/useHashScroll';
import { projectStore, type ProjectRecord } from '../storage/projects';
import { lessonProjects, startLesson } from './start';

/**
 * The kit lessons and then the projects, in order, with how far the student
 * has got in each, on this device.
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
  const card = (lesson: Lesson, index: number) => (
    <LessonCard
      key={lesson.id}
      lesson={lesson}
      number={index + 1}
      project={latest.get(lesson.id)}
      busy={start.isPending}
      onStart={() => start.mutate(lesson)}
      onOpen={(id) => navigate(`/lab/${id}`)}
    />
  );

  const stateOf = (lesson: Lesson) => {
    const project = latest.get(lesson.id);
    const done = project?.lesson?.done.length ?? 0;
    return !project ? 'new' : done === lesson.steps.length ? 'done' : 'started';
  };
  // The lesson last worked on and not finished: the one to go back to.
  const resume = LESSONS.filter((lesson) => stateOf(lesson) === 'started').sort(
    (a, b) => (latest.get(b.id)?.updatedAt ?? 0) - (latest.get(a.id)?.updatedAt ?? 0),
  )[0];
  const logic = (lesson: Lesson) =>
    lesson.sheet === true ||
    lesson.parts.some((id) => /^(74hc|cd4511|seven-segment|clock-555)/.test(id));
  const tracks = [
    { id: 'kit', title: t('lessons.track.kit'), lessons: parts.filter((l) => !logic(l)) },
    { id: 'logic', title: t('lessons.track.logic'), lessons: parts.filter(logic) },
  ];
  let counter = 0;
  const track = (title: string, lessons: Lesson[], first: number) => {
    const finished = lessons.filter((lesson) => stateOf(lesson) === 'done').length;
    return (
      <section key={title} className="mb-8">
        <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h3 className="text-lg font-semibold">{title}</h3>
          <span className="text-sm text-ink-faint tabular-nums">
            {t('lessons.trackProgress', { done: number(finished), total: number(lessons.length) })}
          </span>
          <span className="h-1.5 min-w-24 flex-1 overflow-hidden rounded-full bg-line" aria-hidden>
            <span
              className="block h-full rounded-full bg-mat"
              style={{ width: `${(100 * finished) / Math.max(1, lessons.length)}%` }}
            />
          </span>
        </div>
        <ol className="divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
          {lessons.map((lesson, index) => card(lesson, first - 1 + index))}
        </ol>
      </section>
    );
  };

  return (
    <main className="flex-1">
      <div className="bg-mat text-chalk">
        <div className="mx-auto max-w-4xl px-4 pt-8 pb-10 sm:pt-12">
          <h1 className="text-3xl font-bold sm:text-[2.5rem] sm:leading-tight">
            {t('lessons.title')}
          </h1>
          <p className="mt-2 max-w-xl text-lg text-chalk/80">{t('lessons.intro')}</p>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-4 py-6">
        {start.isError && (
          <p
            role="alert"
            className="mb-4 rounded-lg border-l-4 border-danger bg-danger-soft px-4 py-3"
          >
            {t('home.storageError')}
          </p>
        )}
        {resume && (
          <section
            className="mb-8 flex flex-wrap items-center gap-4 rounded-[var(--radius-sheet)] bg-surface p-4 shadow-[var(--shadow-raised)] sm:p-5"
            data-testid="lesson-resume"
          >
            <div className="min-w-0 flex-1">
              <p className="section-title">{t('lessons.resume')}</p>
              <p className="mt-1 text-xl font-semibold">{resume.title[locale]}</p>
              <p className="text-sm text-ink-soft tabular-nums">
                {t('lessons.state.started', {
                  done: number(latest.get(resume.id)?.lesson?.done.length ?? 0),
                  total: number(resume.steps.length),
                })}
              </p>
            </div>
            <button
              type="button"
              className="btn btn-primary min-h-12 px-6"
              onClick={() => navigate(`/lab/${latest.get(resume.id)!.id}`)}
            >
              {t('lessons.continue')}
            </button>
          </section>
        )}

        <h2 className="mb-4 text-2xl font-bold">{t('lessons.partsTitle')}</h2>
        <div data-testid="lesson-list">
          {tracks.map((item) => {
            const section = track(item.title, item.lessons, counter + 1);
            counter += item.lessons.length;
            return section;
          })}
        </div>

        <h2 className="mt-4 text-2xl font-bold">{t('lessons.projectsTitle')}</h2>
        <p className="mt-1 mb-4 max-w-2xl text-ink-soft">{t('lessons.projectsIntro')}</p>
        <div data-testid="project-lesson-list">{track(t('lessons.track.projects'), builds, 1)}</div>
        <p className="mt-2 text-sm text-ink-soft">{t('lessons.licence')}</p>
      </div>
    </main>
  );
}

function LessonCard(props: {
  lesson: Lesson;
  number: number;
  project: ProjectRecord | undefined;
  busy: boolean;
  onStart(): void;
  onOpen(projectId: string): void;
}) {
  const { lesson, project } = props;
  const { t, locale, number } = useT();
  const total = lesson.steps.length;
  const done = project?.lesson?.done.length ?? 0;
  const state = !project ? 'new' : done === total ? 'done' : 'started';
  const partName = (id: string) =>
    PART_DEFINITIONS.find((definition) => definition.id === id)?.name[locale] ?? id;
  const lessonTitle = (id: string) => LESSONS.find((l) => l.id === id)?.title[locale] ?? id;
  return (
    <li
      id={lesson.id}
      data-testid="lesson-card"
      data-lesson={lesson.id}
      data-state={state}
      className="flex flex-wrap items-start gap-x-3 gap-y-2 p-3 sm:flex-nowrap sm:p-4"
    >
      <span
        aria-hidden
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-bold tabular-nums ${
          state === 'done'
            ? 'bg-mat text-chalk'
            : state === 'started'
              ? 'bg-amber-soft text-amber-deep ring-2 ring-amber'
              : 'bg-paper text-ink-soft'
        }`}
      >
        {state === 'done' ? '✓' : number(props.number)}
      </span>
      <div className="min-w-0 flex-1 basis-56">
        <h4 className="leading-snug font-semibold">{lesson.title[locale]}</h4>
        <p className="mt-0.5 text-sm text-ink-soft">{lesson.summary[locale]}</p>
        <p className="mt-1 text-xs text-ink-faint">
          {lesson.parts.map(partName).join(' · ')} · {t('lessons.steps', { count: number(total) })}
        </p>
        {lesson.after && lesson.after.length > 0 && (
          <p className="mt-0.5 text-xs text-ink-faint" data-testid="lesson-after">
            {t('lessons.after', { list: lesson.after.map(lessonTitle).join(', ') })}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1.5 max-sm:ml-12">
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums ${
            state === 'done'
              ? 'bg-ok-soft text-ok'
              : state === 'started'
                ? 'bg-amber-soft text-amber-deep'
                : 'bg-paper text-ink-faint'
          }`}
        >
          {state === 'new'
            ? t('lessons.state.new')
            : state === 'done'
              ? t('lessons.state.done')
              : t('lessons.state.started', { done: number(done), total: number(total) })}
        </span>
        {project && (
          <button
            type="button"
            data-testid="lesson-continue"
            onClick={() => props.onOpen(project.id)}
            className="btn btn-secondary min-h-10 px-3 text-sm"
          >
            {t(state === 'done' ? 'lessons.open' : 'lessons.continue')}
          </button>
        )}
        <button
          type="button"
          data-testid="lesson-start"
          disabled={props.busy}
          onClick={props.onStart}
          className={`btn min-h-10 px-3 text-sm ${project ? 'btn-quiet' : 'btn-secondary'}`}
        >
          {t(project ? 'lessons.again' : 'lessons.start')}
        </button>
      </div>
    </li>
  );
}
