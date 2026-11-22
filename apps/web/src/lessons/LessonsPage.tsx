import { LESSONS, lessonKind, type Lesson } from '@banglalab/lessons';
import { PART_DEFINITIONS } from '@banglalab/parts';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { useT } from '../i18n';
import { projectStore, type ProjectRecord } from '../storage/projects';
import { lessonProjects, startLesson } from './start';

/**
 * The kit lessons and then the projects, in order, with how far the student
 * has got in each, on this device.
 */
export function LessonsPage() {
  const { t, locale } = useT();
  const navigate = useNavigate();
  const projects = useQuery({ queryKey: ['projects'], queryFn: projectStore.list });
  const latest = lessonProjects(projects.data ?? []);
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

  return (
    <main className="flex-1">
      <div className="bg-mat text-paper">
        <div className="mx-auto max-w-5xl px-4 py-8">
          <h1 className="text-3xl font-semibold sm:text-4xl">{t('lessons.title')}</h1>
          <p className="mt-2 max-w-2xl text-lg text-paper/85">{t('lessons.intro')}</p>
        </div>
      </div>
      <div className="mx-auto max-w-5xl px-4 py-6">
        {start.isError && (
          <p
            role="alert"
            className="mb-4 rounded-lg border-l-4 border-danger bg-danger-soft px-4 py-3"
          >
            {t('home.storageError')}
          </p>
        )}
        <h2 className="mb-3 text-2xl font-semibold">{t('lessons.partsTitle')}</h2>
        <ol className="grid gap-4 sm:grid-cols-2" data-testid="lesson-list">
          {parts.map(card)}
        </ol>
        <h2 className="mt-10 text-2xl font-semibold">{t('lessons.projectsTitle')}</h2>
        <p className="mt-1 mb-3 max-w-2xl text-ink-soft">{t('lessons.projectsIntro')}</p>
        <ol className="grid gap-4 sm:grid-cols-2" data-testid="project-lesson-list">
          {builds.map(card)}
        </ol>
        <p className="mt-6 text-sm text-ink-soft">{t('lessons.licence')}</p>
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
      data-testid="lesson-card"
      data-lesson={lesson.id}
      data-state={state}
      className="flex flex-col rounded-xl border border-line bg-surface p-4"
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg font-semibold ${
            state === 'done' ? 'bg-mat text-paper' : 'bg-paper text-ink'
          }`}
        >
          {state === 'done' ? '✓' : number(props.number)}
        </span>
        <div className="min-w-0">
          <h3 className="text-lg leading-snug font-semibold">{lesson.title[locale]}</h3>
          <p className="mt-1 text-ink-soft">{lesson.summary[locale]}</p>
          <p className="mt-2 text-sm text-ink-soft">{lesson.parts.map(partName).join(' · ')}</p>
          {lesson.after && lesson.after.length > 0 && (
            <p className="mt-1 text-sm text-ink-soft" data-testid="lesson-after">
              {t('lessons.after', { list: lesson.after.map(lessonTitle).join(', ') })}
            </p>
          )}
        </div>
      </div>
      <div className="mt-auto flex flex-wrap items-center gap-2 pt-3">
        <span className="mr-auto text-sm text-ink-soft">
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
            className="min-h-11 rounded-lg bg-amber px-4 font-semibold text-ink hover:brightness-105"
          >
            {t(state === 'done' ? 'lessons.open' : 'lessons.continue')}
          </button>
        )}
        <button
          type="button"
          data-testid="lesson-start"
          disabled={props.busy}
          onClick={props.onStart}
          className={`min-h-11 rounded-lg px-4 font-semibold ${
            project
              ? 'border-2 border-line text-ink hover:border-ink-soft'
              : 'bg-amber text-ink hover:brightness-105'
          }`}
        >
          {t(project ? 'lessons.again' : 'lessons.start')}
        </button>
      </div>
    </li>
  );
}
