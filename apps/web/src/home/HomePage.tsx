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
      className="block w-full rounded-lg"
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
  const { t, relativeTime } = useT();
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

  return (
    <main className="flex-1">
      <div className="bg-mat text-paper">
        <div className="mx-auto max-w-5xl px-4 py-8 sm:py-10">
          <h1 className="text-3xl font-semibold sm:text-4xl">{t('home.title')}</h1>
          <p className="mt-2 max-w-2xl text-lg text-paper/85">{t('home.intro')}</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              data-testid="new-project"
              onClick={() =>
                create.mutate({ name: t('home.untitled'), circuit: emptyCircuit(), programs: {} })
              }
              className="min-h-12 rounded-xl bg-amber px-5 text-lg font-semibold text-ink hover:brightness-105"
            >
              + {t('home.new')}
            </button>
            <Link
              to="/lessons"
              data-testid="home-lessons"
              className="flex min-h-12 items-center rounded-xl border-2 border-amber px-5 text-lg font-semibold text-paper hover:bg-paper/10"
            >
              {t('home.lessons')}
            </Link>
            <button
              type="button"
              data-testid="open-example"
              onClick={() =>
                create.mutate({
                  name: t('home.exampleName'),
                  circuit: ledCircuitExample(),
                  programs: {},
                })
              }
              className="min-h-12 rounded-xl border-2 border-paper/70 px-5 text-lg font-medium hover:bg-paper/10"
            >
              {t('home.example')}
            </button>
            <button
              type="button"
              data-testid="open-example-uno"
              onClick={() =>
                create.mutate(
                  starterProgram('blink').then((program) => ({
                    name: t('home.exampleUnoName'),
                    circuit: unoCircuitExample(),
                    programs: { UNO1: program },
                  })),
                )
              }
              className="min-h-12 rounded-xl border-2 border-paper/70 px-5 text-lg font-medium hover:bg-paper/10"
            >
              {t('home.exampleUno')}
            </button>
            <button
              type="button"
              data-testid="open-example-esp32"
              onClick={() =>
                create.mutate(
                  starterProgram('blink', 'esp32').then((program) => ({
                    name: t('home.exampleEsp32Name'),
                    circuit: esp32CircuitExample(),
                    programs: { ESP1: program },
                  })),
                )
              }
              className="min-h-12 rounded-xl border-2 border-paper/70 px-5 text-lg font-medium hover:bg-paper/10"
            >
              {t('home.exampleEsp32')}
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 py-6">
        {storageFailed && (
          <p
            role="alert"
            className="mb-4 rounded-lg border-l-4 border-danger bg-danger-soft px-4 py-3"
          >
            {t('home.storageError')}
          </p>
        )}
        {projects.data?.length === 0 && (
          <div className="rounded-xl border-2 border-dashed border-line px-6 py-10 text-center">
            <p className="text-xl font-semibold">{t('home.empty.title')}</p>
            <p className="mt-1 text-ink-soft">{t('home.empty.body')}</p>
          </div>
        )}
        {save.isError && (
          <p role="alert" className="mb-3 font-medium text-danger" data-testid="cloud-problem">
            {t('cloud.failed')}
          </p>
        )}
        {me && onlyInCloud.length > 0 && (
          <section className="mb-6" data-testid="cloud-list">
            <h2 className="mb-2 text-lg font-semibold">{t('cloud.title')}</h2>
            <ul className="flex flex-wrap gap-2">
              {onlyInCloud.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    data-testid="open-cloud"
                    disabled={bring.isPending}
                    onClick={() => bring.mutate(item.id)}
                    className="min-h-11 rounded-lg border-2 border-line bg-surface px-3 font-medium hover:border-ink-soft"
                  >
                    {item.title} · {t('cloud.openHere')}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="project-list">
          {projects.data?.map((project) => (
            <li
              key={project.id}
              className="overflow-hidden rounded-xl border border-line bg-surface"
            >
              <Link to={`/lab/${project.id}`} data-testid="project-link" className="block p-2 pb-0">
                <Thumbnail circuit={project.circuit} />
                <span className="mt-2 block px-1 text-lg leading-snug font-semibold">
                  {project.name}
                </span>
              </Link>
              <div className="flex items-end justify-between gap-2 px-3 pt-1 pb-3">
                <p className="text-sm text-ink-soft">
                  {t('home.parts', { count: partsOf(project.circuit).length })}
                  <br />
                  {t('home.updated', { time: relativeTime(project.updatedAt) })}
                </p>
                {me && (
                  <button
                    type="button"
                    data-testid="save-cloud"
                    disabled={save.isPending}
                    onClick={() => save.mutate(project)}
                    className="min-h-11 rounded-lg px-3 text-sm font-medium text-mat hover:bg-paper"
                    title={
                      project.cloudVersion
                        ? t('cloud.savedVersion', { version: project.cloudVersion })
                        : undefined
                    }
                  >
                    {t(project.cloudId ? 'cloud.update' : 'cloud.save')}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => confirmRemove(project)}
                  className="min-h-11 rounded-lg px-3 text-sm font-medium text-danger hover:bg-danger-soft"
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
