import type { MessageKey } from '@banglalab/i18n';
import { isProgrammable } from '@banglalab/shared';
import { proxy } from 'comlink';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useT } from '../i18n';
import { simulation } from '../sim/client';
import { projectStore } from '../storage/projects';
import { Canvas } from './Canvas';
import { Diagram } from './diagram/Diagram';
import { CodePanel } from './CodePanel';
import { CanvasHint, PartsDrawer, ToolPicker } from './Palette';
import { SheetView } from './SheetView';
import { Inspector, Messages, Meter, TruthTablePanel } from './panels';
import { SignalsPanel } from './SignalsPanel';
import { IotPanel } from './IotPanel';
import { WebPanel } from './WebPanel';
import { checkStep } from '@banglalab/lessons';
import { LessonPanel } from '../lessons/LessonPanel';
import { useLessonState } from '../lessons/progress';
import { setBuzzing } from './sound';
import { matchingStarter } from './starters';
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
        if (project) {
          useLab.getState().open(project);
          useLessonState.getState().open(project.id, project.lesson);
        }
        setStatus(project ? 'ready' : 'missing');
      });
    return () => {
      cancelled = true;
      useLab.getState().close();
      useLessonState.getState().close();
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
      const { projectId, name, circuit, programs, settings, sheet, setSaveState } =
        useLab.getState();
      if (!projectId) return;
      projectStore.save(projectId, { name, circuit, programs, settings, sheet }).then(
        () => setSaveState('saved'),
        () => setSaveState('error'),
      );
    };
    const unsubscribe = useLab.subscribe((state, previous) => {
      if (
        state.circuit === previous.circuit &&
        state.name === previous.name &&
        state.programs === previous.programs &&
        state.settings === previous.settings &&
        state.sheet === previous.sheet
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
    const { circuit, pressed, programs, settings, receiveFrame } = useLab.getState();
    const firmware: Record<string, string> = {};
    for (const [boardId, program] of Object.entries(programs)) {
      if (program.hex) firmware[boardId] = program.hex;
    }
    void simulation().setProbes(useLab.getState().probes);
    void simulation().start(circuit, pressed, firmware, proxy(receiveFrame), settings);

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

/**
 * Keeps the lesson's current step up to date with the student's work: every
 * change to the circuit, the program or what the simulation shows is checked.
 */
function useLessonChecks() {
  useEffect(() => {
    const check = () => {
      const { lesson, progress, report } = useLessonState.getState();
      if (!lesson || !progress) return;
      const lab = useLab.getState();
      // Each board, in order: what it printed, and the ready-made program put on it, if any.
      const boards = lab.circuit.components.filter(isProgrammable).map((board) => {
        const program = lab.programs[board.id];
        const uploaded = program?.hex && program.hexSource ? program.hexSource : null;
        return {
          serial: lab.serial[board.id] ?? '',
          uploadedStarter: uploaded ? (matchingStarter(uploaded, 'esp32') ?? null) : null,
        };
      });
      report(
        checkStep(
          lesson.steps[progress.step]!,
          {
            circuit: lab.circuit,
            result: lab.result,
            running: lab.running,
            serial: boards[0]?.serial ?? '',
            uploadedStarter: boards[0]?.uploadedStarter ?? null,
            boards,
          },
          progress.seen,
        ),
      );
    };
    check();
    const stopLab = useLab.subscribe(check);
    const stopLesson = useLessonState.subscribe((state, previous) => {
      if (state.progress?.step !== previous.progress?.step || state.lesson !== previous.lesson) {
        check();
      }
    });
    return () => {
      stopLab();
      stopLesson();
    };
  }, []);
}

const MUTE_KEY = 'banglalab.mute';

/** Sounds the buzzer tone while any buzzer in the circuit is active, unless muted. */
function useBuzzerSound(muted: boolean) {
  const sounding = useLab((s) =>
    Object.entries(s.result?.readings ?? {}).some(
      ([id, reading]) =>
        reading.activity === 1 &&
        s.circuit.components.some(
          (c) => c.id === id && (c.type === 'buzzer' || c.type === 'siren'),
        ),
    ),
  );
  useEffect(() => {
    setBuzzing(sounding && !muted);
    return () => setBuzzing(false);
  }, [sounding, muted]);
}

function useKeyboardShortcuts() {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // Typing, including in the program editor, keeps its own keys.
      if ((event.target as HTMLElement).closest('input, select, textarea, [contenteditable]')) {
        return;
      }
      const lab = useLab.getState();
      if ((event.ctrlKey || event.metaKey) && !event.altKey) {
        const key = event.key.toLowerCase();
        if (key === 'z' || key === 'y') {
          event.preventDefault();
          if (key === 'y' || event.shiftKey) lab.redo();
          else lab.undo();
        }
        return;
      }
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
  'driver-limit': 'edit.driver-limit',
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

/** True on a wide screen (the lab's laptop layout), false on a phone or small tablet. */
function useWide(): boolean {
  const query = '(min-width: 1024px)';
  const [wide, setWide] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const changed = () => setWide(media.matches);
    media.addEventListener('change', changed);
    return () => media.removeEventListener('change', changed);
  }, []);
  return wide;
}

const TAB_LABELS = {
  lesson: 'lesson.tab',
  circuit: 'code.tabCircuit',
  code: 'code.tabCode',
  signals: 'code.tabSignals',
  network: 'network.tab',
} as const;

export function LabPage() {
  const { projectId } = useParams();
  const status = useProject(projectId);
  useAutosave(status === 'ready');
  useLiveSimulation();
  useKeyboardShortcuts();
  useLessonChecks();
  const hasLesson = useLessonState((s) => s.lesson !== null);

  const name = useLab((s) => s.name);
  const running = useLab((s) => s.running);
  const saveState = useLab((s) => s.saveState);
  // Joined into text, so the list only counts as changed when the boards do.
  const boardList = useLab((s) =>
    s.circuit.components
      .filter(isProgrammable)
      .map((c) => c.id)
      .join(','),
  );
  const boardIds = boardList ? boardList.split(',') : [];
  /** The ESP32 whose web page the browser panel opens: the one picked for the code tab, or the first. */
  const esp32List = useLab((s) =>
    s.circuit.components
      .filter((c) => c.type === 'esp32')
      .map((c) => c.id)
      .join(','),
  );
  const selectedId = useLab((s) => s.selectedId);
  /** The board whose program the code tab shows: the last one picked, here or on the canvas. */
  const [chosenBoard, setChosenBoard] = useState<string | null>(null);
  useEffect(() => {
    if (selectedId && boardList.split(',').includes(selectedId)) setChosenBoard(selectedId);
  }, [selectedId, boardList]);
  const boardId =
    chosenBoard !== null && boardIds.includes(chosenBoard) ? chosenBoard : boardIds[0];
  const esp32Ids = esp32List ? esp32List.split(',') : [];
  const esp32Id = boardId && esp32Ids.includes(boardId) ? boardId : esp32Ids[0];
  const hasBuzzer = useLab((s) =>
    s.circuit.components.some((c) => c.type === 'buzzer' || c.type === 'siren'),
  );
  const [muted, setMuted] = useState(() => {
    try {
      return localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      return false;
    }
  });
  useBuzzerSound(muted);
  const toggleMute = () => {
    setMuted(!muted);
    try {
      localStorage.setItem(MUTE_KEY, muted ? '0' : '1');
    } catch {
      // Private mode: the choice lasts for this visit.
    }
  };
  const [tab, setTab] = useState<'lesson' | 'circuit' | 'code' | 'signals' | 'network'>('circuit');
  const [networkView, setNetworkView] = useState<'web' | 'iot'>('web');
  const [partsOpen, setPartsOpen] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const wide = useWide();
  // A project made from a lesson opens at its lesson.
  useEffect(() => setTab(hasLesson ? 'lesson' : 'circuit'), [hasLesson]);
  /** The breadboard is where the circuit is built; the diagram is the same circuit as a schematic. */
  const [view, setView] = useState<'board' | 'diagram' | 'sheet'>('board');
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
  const tabs = (['lesson', 'circuit', 'code', 'signals', 'network'] as const)
    .filter((id) => id !== 'code' || boardId !== undefined)
    .filter((id) => id !== 'network' || esp32Id !== undefined)
    .filter((id) => id !== 'lesson' || hasLesson);
  const chooseTab = (id: (typeof tabs)[number]) => {
    setTab(id);
    // On a phone the panel is below the board: bring it into view.
    if (!wide)
      requestAnimationFrame(() => panelRef.current?.scrollIntoView({ behavior: 'smooth' }));
  };
  const viewSwitch = (
    <div
      role="group"
      aria-label={t('lab.viewLabel')}
      className="flex shrink-0 gap-0.5 rounded-xl bg-paper p-1 shadow-[var(--shadow-raised)] lg:shadow-none"
    >
      {(['board', 'diagram', 'sheet'] as const).map((id) => (
        <button
          key={id}
          type="button"
          data-testid={`view-${id}`}
          aria-pressed={view === id}
          onClick={() => setView(id)}
          className={`min-h-9 rounded-lg px-3 text-sm font-semibold ${
            view === id ? 'bg-surface text-ink shadow-sm' : 'text-ink-soft hover:text-ink'
          }`}
        >
          {t(
            id === 'board'
              ? 'lab.viewBoard'
              : id === 'diagram'
                ? 'lab.viewDiagram'
                : 'lab.viewSheet',
          )}
        </button>
      ))}
    </div>
  );

  return (
    <main className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <div className="flex min-w-0 flex-col lg:min-h-0 lg:flex-1">
        {/* One bar: the way back, the name, the view (on a wide screen), the save state and Run. */}
        <div className="flex h-14 shrink-0 items-center gap-2 border-b border-line bg-surface px-2 lg:gap-3 lg:px-3">
          <Link
            to="/"
            aria-label={t('lab.back')}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-ink-soft hover:bg-paper hover:text-ink lg:w-auto lg:px-2"
          >
            <span aria-hidden className="text-xl leading-none lg:hidden">
              ‹
            </span>
            <span className="hidden text-sm font-medium lg:inline">‹ {t('lab.back')}</span>
          </Link>
          <input
            aria-label={t('lab.nameLabel')}
            data-testid="project-name"
            value={name}
            maxLength={80}
            onChange={(event) => setName(event.target.value)}
            className="min-h-11 min-w-0 flex-1 truncate rounded-lg border-2 border-transparent bg-transparent px-2 text-base font-semibold hover:border-line focus:border-line lg:text-lg"
          />
          {wide && viewSwitch}
          <span
            data-testid="save-state"
            data-state={saveState}
            title={t(saveText[saveState])}
            className={`flex shrink-0 items-center gap-1.5 text-sm ${saveState === 'error' ? 'font-semibold text-danger' : 'text-ink-faint'}`}
          >
            <span
              aria-hidden
              className={`h-2 w-2 rounded-full ${saveState === 'error' ? 'bg-danger' : saveState === 'saving' ? 'bg-amber' : 'bg-ok'}`}
            />
            <span className="max-sm:sr-only">{t(saveText[saveState])}</span>
          </span>
          {hasBuzzer && (
            <button
              type="button"
              data-testid="mute"
              aria-pressed={!muted}
              aria-label={t('lab.sound')}
              onClick={toggleMute}
              className="btn btn-secondary shrink-0 px-3"
            >
              <span aria-hidden>{muted ? '🔇' : '🔊'}</span>
              <span className="max-md:sr-only">{t('lab.sound')}</span>
            </button>
          )}
          <button
            type="button"
            data-testid="run"
            aria-pressed={running}
            onClick={() => setRunning(!running)}
            className={`btn shrink-0 px-4 text-base lg:min-w-32 ${running ? 'btn-secondary border-ink' : 'btn-primary'}`}
          >
            <span aria-hidden>{running ? '■' : '▶'}</span>
            {t(running ? 'lab.stop' : 'lab.run')}
          </button>
        </div>

        {/* On a phone: the tools, the parts and the view in a slim row, so nothing covers the board. */}
        {!wide && (
          <div className="flex h-[3.25rem] shrink-0 items-center gap-2 border-b border-line bg-surface px-2">
            {view === 'board' && (
              <>
                <ToolPicker compact />
                <button
                  type="button"
                  data-testid="parts-open"
                  onClick={() => setPartsOpen(true)}
                  className="btn min-h-10 bg-mat px-3 text-sm text-paper"
                >
                  <span aria-hidden className="text-base leading-none">
                    ＋
                  </span>
                  {t('drawer.title')}
                </button>
              </>
            )}
            <div className="ml-auto">{viewSwitch}</div>
          </div>
        )}
        <div className="flex min-h-0 flex-1">
          {/* The parts drawer, beside the board on a wide screen. */}
          {wide && view === 'board' && (
            <aside
              className="flex w-80 shrink-0 flex-col border-r border-line bg-surface"
              aria-label={t('drawer.title')}
            >
              <div className="px-3 pt-3">
                <ToolPicker />
              </div>
              <PartsDrawer />
            </aside>
          )}
          <div
            className={`relative flex min-w-0 flex-1 flex-col ${
              wide ? 'min-h-0' : 'h-[calc(100dvh-3.5rem-6.5rem)] min-h-[20rem]'
            }`}
          >
            {view === 'sheet' ? (
              <>
                <SheetView />
              </>
            ) : (
              <>
                <Notice />
                {view === 'board' ? <Canvas /> : <Diagram />}
              </>
            )}

            {/* What to do next: low on the board, clear of the breadboard's top rows. */}
            {wide && (
              <div className="pointer-events-none absolute bottom-3 left-3 z-10 max-w-[calc(100%-12rem)]">
                {view === 'board' && <CanvasHint />}
                {view === 'diagram' && (
                  <p className="rounded-[var(--radius-control)] bg-surface/95 px-3 py-1.5 text-sm text-ink-soft shadow-[var(--shadow-raised)]">
                    {t('diagram.hint')}
                  </p>
                )}
              </div>
            )}
            {!wide && view === 'board' && (
              <div className="pointer-events-none absolute bottom-3 left-2 z-10 max-w-[calc(100%-9.5rem)]">
                <CanvasHint />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* On a phone the parts come up in a sheet over the board, and go once one is picked. */}
      {!wide && partsOpen && (
        <div
          className="fixed inset-0 z-40 flex flex-col justify-end"
          role="dialog"
          aria-modal="true"
          aria-label={t('drawer.title')}
        >
          <button
            type="button"
            aria-label={t('drawer.close')}
            className="absolute inset-0 bg-ink/40"
            onClick={() => setPartsOpen(false)}
          />
          <div className="relative flex max-h-[78dvh] flex-col rounded-t-[var(--radius-sheet)] bg-surface shadow-[var(--shadow-raised)]">
            <div className="flex items-center justify-between px-4 pt-3">
              <span
                aria-hidden
                className="absolute top-1.5 left-1/2 h-1 w-10 -translate-x-1/2 rounded-full bg-line-strong"
              />
              <h2 className="text-lg font-semibold">{t('drawer.title')}</h2>
              <button
                type="button"
                data-testid="parts-close"
                onClick={() => setPartsOpen(false)}
                className="btn btn-quiet"
              >
                {t('drawer.close')}
              </button>
            </div>
            <PartsDrawer onChosen={() => setPartsOpen(false)} />
          </div>
        </div>
      )}

      <aside
        ref={panelRef}
        className={`flex w-full shrink-0 flex-col border-line bg-surface lg:min-h-0 lg:border-l ${showCode ? 'lg:w-[34rem]' : 'lg:w-[22rem]'}`}
      >
        <div
          role="tablist"
          className="flex shrink-0 gap-0.5 border-b border-line bg-surface px-1.5 pt-1.5"
        >
          {tabs.map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              data-testid={`tab-${id}`}
              aria-selected={tab === id}
              onClick={() => chooseTab(id)}
              className={`min-h-11 flex-1 rounded-t-lg border-b-[3px] px-1 text-sm font-semibold ${
                tab === id
                  ? 'border-mat text-ink'
                  : 'border-transparent text-ink-soft hover:bg-paper hover:text-ink'
              }`}
            >
              {t(TAB_LABELS[id])}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {tab === 'lesson' && hasLesson ? (
            <LessonPanel />
          ) : showCode ? (
            <>
              {boardIds.length > 1 && (
                <div
                  role="tablist"
                  aria-label={t('code.boards')}
                  className="flex gap-1.5 border-b border-line px-4 pt-3 pb-2"
                >
                  {boardIds.map((id) => (
                    <button
                      key={id}
                      type="button"
                      role="tab"
                      data-testid={`code-board-${id}`}
                      aria-selected={id === boardId}
                      aria-pressed={id === boardId}
                      onClick={() => setChosenBoard(id)}
                      className="chip px-4 font-semibold"
                    >
                      {id}
                    </button>
                  ))}
                </div>
              )}
              <CodePanel key={boardId} boardId={boardId!} />
            </>
          ) : tab === 'signals' ? (
            <SignalsPanel />
          ) : tab === 'network' && esp32Id !== undefined ? (
            <>
              <div
                role="tablist"
                aria-label={t('network.label')}
                className="flex gap-1.5 border-b border-line px-4 pt-3 pb-2"
              >
                {(['web', 'iot'] as const).map((id) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    data-testid={`tab-${id}`}
                    aria-selected={networkView === id}
                    aria-pressed={networkView === id}
                    onClick={() => setNetworkView(id)}
                    className="chip px-4 font-semibold"
                  >
                    {t(id === 'web' ? 'web.tab' : 'iot.tab')}
                  </button>
                ))}
              </div>
              {networkView === 'web' ? <WebPanel boardId={esp32Id} /> : <IotPanel />}
            </>
          ) : (
            <>
              <Messages />
              <Meter />
              <Inspector />
              <TruthTablePanel />
            </>
          )}
        </div>
      </aside>
    </main>
  );
}
