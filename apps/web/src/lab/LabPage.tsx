import type { MessageKey } from '@banglalab/i18n';
import { proxy } from 'comlink';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useT } from '../i18n';
import { simulation } from '../sim/client';
import { projectStore } from '../storage/projects';
import { Canvas } from './Canvas';
import { CodePanel } from './CodePanel';
import { Palette } from './Palette';
import { Inspector, Messages, Meter } from './panels';
import { SignalsPanel } from './SignalsPanel';
import { useLab } from './store';

const SAVE_DELAY_MS = 400;

/** Opens the project in the URL, and closes it when the page is left. */
function useProject(id: string | undefined) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing'>('loading');
  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    void projectStore
      .get(id ?? '')
      .catch(() => undefined)
      .then((project) => {
        if (cancelled) return;
        if (project) useLab.getState().open(project);
        setStatus(project ? 'ready' : 'missing');
      });
    return () => {
      cancelled = true;
      useLab.getState().close();
    };
  }, [id]);
  return status;
}

/** Saves to this device shortly after every change, and immediately when the page is hidden. */
function useAutosave(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const save = () => {
      clearTimeout(timer);
      timer = undefined;
      const { projectId, name, circuit, programs, setSaveState } = useLab.getState();
      if (!projectId) return;
      projectStore.save(projectId, { name, circuit, programs }).then(
        () => setSaveState('saved'),
        () => setSaveState('error'),
      );
    };
    const unsubscribe = useLab.subscribe((state, previous) => {
      if (
        state.circuit === previous.circuit &&
        state.name === previous.name &&
        state.programs === previous.programs
      ) {
        return;
      }
      if (state.projectId !== previous.projectId) return; // a project was just opened
      state.setSaveState('saving');
      clearTimeout(timer);
      timer = setTimeout(save, SAVE_DELAY_MS);
    });
    const flush = () => timer !== undefined && save();
    document.addEventListener('visibilitychange', flush);
    window.addEventListener('pagehide', flush);
    return () => {
      unsubscribe();
      document.removeEventListener('visibilitychange', flush);
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [enabled]);
}

/**
 * While the circuit is switched on, keeps the simulation worker in step with
 * the editor: edits, held buttons and uploaded programs are passed along, and
 * readings come back about thirty times a second.
 */
function useLiveSimulation() {
  const running = useLab((s) => s.running);
  useEffect(() => {
    if (!running) return;
    const { circuit, pressed, programs, receiveFrame } = useLab.getState();
    const firmware: Record<string, string> = {};
    for (const [boardId, program] of Object.entries(programs)) {
      if (program.hex) firmware[boardId] = program.hex;
    }
    void simulation().setProbes(useLab.getState().probes);
    void simulation().start(circuit, pressed, firmware, proxy(receiveFrame));

    const unsubscribe = useLab.subscribe((state, previous) => {
      if (state.circuit !== previous.circuit || state.pressed !== previous.pressed) {
        void simulation().update(state.circuit, state.pressed);
      }
      if (state.probes !== previous.probes) void simulation().setProbes(state.probes);
      for (const [boardId, count] of Object.entries(state.uploads)) {
        const hex = state.programs[boardId]?.hex;
        if (hex && count !== previous.uploads[boardId]) void simulation().upload(boardId, hex);
      }
    });
    return () => {
      unsubscribe();
      void simulation().stop();
    };
  }, [running]);
}

function useKeyboardShortcuts() {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement).closest('input, select, textarea')) return;
      const lab = useLab.getState();
      if (event.key === 'Delete' || event.key === 'Backspace') lab.removeSelected();
      if (event.key === 'Escape') lab.setTool('select');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

const EDIT_MESSAGES: Partial<Record<string, MessageKey>> = {
  'hole-occupied': 'edit.hole-occupied',
  'no-room': 'edit.no-room',
  'lead-too-long': 'edit.lead-too-long',
  'same-point': 'edit.same-point',
  'battery-limit': 'edit.battery-limit',
  'board-limit': 'edit.board-limit',
};

function Notice() {
  const notice = useLab((s) => s.notice);
  const { t } = useT();
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => useLab.getState().setNotice(null), 3500);
    return () => clearTimeout(timer);
  }, [notice]);
  if (!notice) return null;
  return (
    <p
      role="status"
      data-testid="notice"
      className="pointer-events-none absolute top-3 left-1/2 z-10 -translate-x-1/2 rounded-lg bg-ink px-4 py-2 text-sm font-medium text-paper shadow-lg"
    >
      {t(EDIT_MESSAGES[notice] ?? 'edit.other')}
    </p>
  );
}

const TAB_LABELS = {
  circuit: 'code.tabCircuit',
  code: 'code.tabCode',
  signals: 'code.tabSignals',
} as const;

export function LabPage() {
  const { projectId } = useParams();
  const status = useProject(projectId);
  useAutosave(status === 'ready');
  useLiveSimulation();
  useKeyboardShortcuts();

  const name = useLab((s) => s.name);
  const running = useLab((s) => s.running);
  const saveState = useLab((s) => s.saveState);
  const boardId = useLab((s) => s.circuit.components.find((c) => c.type === 'uno')?.id);
  const [tab, setTab] = useState<'circuit' | 'code' | 'signals'>('circuit');
  const showCode = tab === 'code' && boardId !== undefined;
  const { setName, setRunning } = useLab.getState();
  const { t } = useT();

  if (status !== 'ready') {
    return (
      <main className="mx-auto max-w-xl px-4 py-16 text-center">
        <p className="text-lg">{t(status === 'loading' ? 'lab.loading' : 'lab.notFound')}</p>
        {status === 'missing' && (
          <Link to="/" className="mt-4 inline-block font-semibold text-mat underline">
            {t('lab.back')}
          </Link>
        )}
      </main>
    );
  }

  const saveText = { saved: 'lab.saved', saving: 'lab.saving', error: 'lab.saveError' } as const;

  return (
    <main className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <div className="flex min-h-[70dvh] min-w-0 flex-1 flex-col lg:min-h-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-surface px-3 py-2">
          <Link
            to="/"
            className="rounded-lg px-2 py-2 text-sm font-medium text-ink-soft hover:bg-paper hover:text-ink"
          >
            ‹ {t('lab.back')}
          </Link>
          <input
            aria-label={t('lab.nameLabel')}
            data-testid="project-name"
            value={name}
            maxLength={80}
            onChange={(event) => setName(event.target.value)}
            className="order-last min-h-11 min-w-0 basis-full rounded-lg border-2 border-line bg-transparent px-2 text-lg font-semibold sm:order-none sm:flex-1 sm:basis-0 sm:border-transparent sm:hover:border-line sm:focus:border-line"
          />
          <span
            data-testid="save-state"
            data-state={saveState}
            className={`ml-auto text-sm sm:ml-0 ${saveState === 'error' ? 'font-semibold text-danger' : 'text-ink-soft'}`}
          >
            {t(saveText[saveState])}
          </span>
          <button
            type="button"
            data-testid="run"
            aria-pressed={running}
            onClick={() => setRunning(!running)}
            className={`min-h-12 min-w-36 rounded-xl px-5 text-lg font-semibold ${
              running
                ? 'border-2 border-ink bg-surface text-ink hover:bg-paper'
                : 'bg-amber text-ink shadow-sm hover:brightness-105'
            }`}
          >
            <span aria-hidden className="mr-2">
              {running ? '■' : '▶'}
            </span>
            {t(running ? 'lab.stop' : 'lab.run')}
          </button>
        </div>
        <Palette />
        <div className="relative flex min-h-0 flex-1 flex-col">
          <Notice />
          <Canvas />
        </div>
      </div>

      <aside
        className={`w-full shrink-0 overflow-y-auto border-line bg-surface lg:border-l ${showCode ? 'lg:w-[34rem]' : 'lg:w-[21rem]'}`}
      >
        <div role="tablist" className="flex border-b border-line">
          {(['circuit', 'code', 'signals'] as const)
            .filter((id) => id !== 'code' || boardId !== undefined)
            .map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                data-testid={`tab-${id}`}
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={`min-h-12 flex-1 border-b-4 text-base font-semibold ${
                  tab === id
                    ? 'border-amber text-ink'
                    : 'border-transparent text-ink-soft hover:text-ink'
                }`}
              >
                {t(TAB_LABELS[id])}
              </button>
            ))}
        </div>
        {showCode ? (
          <CodePanel boardId={boardId} />
        ) : tab === 'signals' ? (
          <SignalsPanel />
        ) : (
          <>
            <Messages />
            <Meter />
            <Inspector />
          </>
        )}
      </aside>
    </main>
  );
}
