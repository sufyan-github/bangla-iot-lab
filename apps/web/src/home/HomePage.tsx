import {
  emptyCircuit,
  esp32CircuitExample,
  ledCircuitExample,
  partsOf,
  type CircuitDocument,
  unoCircuitExample,
} from '@banglalab/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router';
import { useT } from '../i18n';
import { listCloud, openFromCloud, saveToCloud } from '../account/cloud';
import { useAccount } from '../account/client';
import { canvasHeight, canvasWidth } from '../lab/geometry';
import { starterProgram } from '../lab/starters';
import { Scene } from '../lab/Scene';
import { projectStore, type ProjectContent, type ProjectRecord } from '../storage/projects';

function Thumbnail({ circuit }: { circuit: CircuitDocument }) {
  const { quantity } = useT();
  return (
    <svg
      viewBox={`0 0 ${canvasWidth(circuit)} ${canvasHeight(circuit)}`}
      preserveAspectRatio="xMidYMid meet"
      className="block aspect-[16/10] w-full rounded-[var(--radius-control)] bg-mat"
      aria-hidden
    >
      <Scene
        circuit={circuit}
        result={null}
        detailed={false}
        batteryLabel={(v) => quantity(v, 'V')}
      />
    </svg>
  );
}

/** The student's saved circuits, with ways to start a new one. */
export function HomePage() {
  const { t, relativeTime, number } = useT();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const projects = useQuery({ queryKey: ['projects'], queryFn: projectStore.list });

  const create = useMutation({
    // Content may be waiting for a ready-made program to load.
    mutationFn: async (content: ProjectContent | Promise<ProjectContent>) =>
      projectStore.create(await content),
    onSuccess: (project) => navigate(`/lab/${project.id}`),
  });
  const remove = useMutation({
    mutationFn: projectStore.remove,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
  });

  const me = useAccount((s) => s.me);
  const cloud = useQuery({
    queryKey: ['cloud', me?.user.id],
    queryFn: async () => {
      const answer = await listCloud();
      return answer.ok ? answer.value.projects : [];
    },
    enabled: !!me,
  });
  const save = useMutation({
    mutationFn: async (project: ProjectRecord) => {
      const answer = await saveToCloud(project);
      if (!answer.ok) throw new Error(answer.error);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['projects'] });
      void queryClient.invalidateQueries({ queryKey: ['cloud'] });
    },
  });
  const bring = useMutation({
    mutationFn: async (id: string) => {
      const answer = await openFromCloud(id);
      if (!answer.ok) throw new Error(answer.error);
      return answer.value;
    },
    onSuccess: (project) => navigate(`/lab/${project.id}`),
  });
  /** Cloud projects with no copy on this device. */
  const onlyInCloud = (cloud.data ?? []).filter(
    (item) => !projects.data?.some((project) => project.cloudId === item.id),
  );

  const confirmRemove = (project: ProjectRecord) => {
    if (window.confirm(t('home.deleteConfirm', { name: project.name }))) remove.mutate(project.id);
  };
  const storageFailed = projects.isError || create.isError;

  const examples = [
    {
      id: 'open-example',
      title: t('home.exampleName'),
      kind: t('home.exampleKind.battery'),
      circuit: ledCircuitExample(),
      open: () =>
        create.mutate({ name: t('home.exampleName'), circuit: ledCircuitExample(), programs: {} }),
    },
    {
      id: 'open-example-uno',
      title: t('home.exampleUnoName'),
      kind: t('home.exampleKind.uno'),
      circuit: unoCircuitExample(),
      open: () =>
        create.mutate(
          starterProgram('blink').then((program) => ({
            name: t('home.exampleUnoName'),
            circuit: unoCircuitExample(),
            programs: { UNO1: program },
          })),
        ),
    },
    {
      id: 'open-example-esp32',
      title: t('home.exampleEsp32Name'),
      kind: t('home.exampleKind.esp32'),
      circuit: esp32CircuitExample(),
      open: () =>
        create.mutate(
          starterProgram('blink', 'esp32').then((program) => ({
            name: t('home.exampleEsp32Name'),
            circuit: esp32CircuitExample(),
            programs: { ESP1: program },
          })),
        ),
    },
  ];

  return (
    <main className="flex-1">
      <div className="bg-mat text-chalk">
        <div className="mx-auto max-w-5xl px-4 pt-8 pb-20 sm:pt-12">
          <h1 className="text-3xl font-bold sm:text-[2.5rem] sm:leading-tight">
            {t('home.title')}
          </h1>
          <p className="mt-2 max-w-xl text-lg text-chalk/80">{t('home.intro')}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              data-testid="new-project"
              onClick={() =>
                create.mutate({ name: t('home.untitled'), circuit: emptyCircuit(), programs: {} })
              }
              className="btn btn-primary min-h-12 px-6 text-lg"
            >
              <span aria-hidden>＋</span>
              {t('home.new')}
            </button>
            <Link
              to="/lessons"
              data-testid="home-lessons"
              className="btn min-h-12 border-2 border-chalk/50 px-6 text-lg text-chalk hover:bg-chalk/10"
            >
              {t('home.lessons')}
            </Link>
          </div>
        </div>
      </div>

      <div className="mx-auto -mt-14 max-w-5xl px-4 pb-10">
        {/* Three circuits to start from, drawn as they are. */}
        <section
          aria-labelledby="examples"
          className="rounded-[var(--radius-sheet)] bg-surface p-4 shadow-[var(--shadow-raised)] sm:p-5"
        >
          <h2 id="examples" className="mb-3 text-lg font-semibold">
            {t('home.examplesTitle')}
          </h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {examples.map((example) => (
              <button
                key={example.id}
                type="button"
                data-testid={example.id}
                onClick={example.open}
                className="group rounded-[var(--radius-card)] border-2 border-line p-2 text-left transition hover:border-accent"
              >
                <Thumbnail circuit={example.circuit} />
                <span className="mt-2 block px-1 font-semibold leading-snug group-hover:text-accent">
                  {example.title}
                </span>
                <span className="block px-1 pb-1 text-sm text-ink-soft">{example.kind}</span>
              </button>
            ))}
          </div>
        </section>

        {storageFailed && (
          <p
            role="alert"
            className="mt-6 rounded-lg border-l-4 border-danger bg-danger-soft px-4 py-3"
          >
            {t('home.storageError')}
          </p>
        )}
        {save.isError && (
          <p role="alert" className="mt-6 font-medium text-danger" data-testid="cloud-problem">
            {t('cloud.failed')}
          </p>
        )}
        {me && onlyInCloud.length > 0 && (
          <section className="mt-8" data-testid="cloud-list">
            <h2 className="mb-2 text-lg font-semibold">{t('cloud.title')}</h2>
            <ul className="flex flex-wrap gap-2">
              {onlyInCloud.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    data-testid="open-cloud"
                    disabled={bring.isPending}
                    onClick={() => bring.mutate(item.id)}
                    className="btn btn-secondary"
                  >
                    <span aria-hidden>☁</span>
                    {item.title} · {t('cloud.openHere')}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="mt-8 mb-3 flex items-baseline gap-2">
          <h2 className="text-xl font-semibold">{t('home.yours')}</h2>
          {projects.data && projects.data.length > 0 && (
            <span className="text-sm text-ink-faint tabular-nums">{projects.data.length}</span>
          )}
        </div>
        {projects.data?.length === 0 && (
          <div className="rounded-[var(--radius-card)] border-2 border-dashed border-line-strong px-6 py-10 text-center">
            <p className="text-lg font-semibold">{t('home.empty.title')}</p>
            <p className="mt-1 text-ink-soft">{t('home.empty.body')}</p>
          </div>
        )}
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="project-list">
          {projects.data?.map((project) => (
            <li
              key={project.id}
              className="flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface transition hover:shadow-[var(--shadow-raised)]"
            >
              <Link to={`/lab/${project.id}`} data-testid="project-link" className="block p-2 pb-0">
                <Thumbnail circuit={project.circuit} />
                <span className="mt-2.5 line-clamp-2 block px-1 text-lg leading-snug font-semibold">
                  {project.name}
                </span>
              </Link>
              <p className="px-3 pt-0.5 text-sm text-ink-soft">
                {t('home.parts', { count: partsOf(project.circuit).length })} ·{' '}
                {t('home.updated', { time: relativeTime(project.updatedAt) })}
              </p>
              <div className="mt-auto flex items-center gap-1 px-1.5 pt-1 pb-1.5">
                {project.cloudVersion && (
                  <span
                    className="ml-1.5 rounded-full bg-mat-soft px-2 py-0.5 text-xs font-semibold text-accent tabular-nums"
                    data-testid="cloud-badge"
                    title={t('cloud.savedVersion', { version: project.cloudVersion })}
                  >
                    ☁ {number(project.cloudVersion)}
                  </span>
                )}
                <span className="flex-1" />
                {me && (
                  <button
                    type="button"
                    data-testid="save-cloud"
                    disabled={save.isPending}
                    onClick={() => save.mutate(project)}
                    className="btn btn-quiet min-h-10 text-sm"
                  >
                    {t(project.cloudId ? 'cloud.update' : 'cloud.save')}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => confirmRemove(project)}
                  className="btn btn-danger min-h-10 text-sm"
                >
                  {t('home.delete')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
