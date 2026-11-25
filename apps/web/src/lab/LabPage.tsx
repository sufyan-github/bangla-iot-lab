import type { MessageKey } from '@banglalab/i18n';
import { isProgrammable } from '@banglalab/shared';
import { proxy } from 'comlink';
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
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
import { BlePanel } from './BlePanel';
import { IotPanel } from './IotPanel';
import { WebPanel } from './WebPanel';
import { checkStep } from '@banglalab/lessons';
import { LessonPanel } from '../lessons/LessonPanel';
import { RunCheckCard, useRunCheckWatch } from '../lessons/RunCheck';
import { TimeControls } from './TimeControls';
import { useLessonState } from '../lessons/progress';
import { setBuzzing } from './sound';
import { matchingStarter } from './starters';
import { useLab } from './store';
import { useRail, useWorkspace } from './workspace';

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
/**
 * The lab's own time, for tests that wait for something the simulation does:
 * on a busy computer it runs slower than the clock on the wall. Not shown.
 */
function LabClock() {
  const ms = useLab((s) => s.labTimeMs);
  return <span hidden data-testid="lab-clock" data-ms={Math.round(ms)} />;
}

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
            sheet: lab.sheet,
            sheetValues: lab.sheetValues,
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

/** "Keep open": a rail kept open stands beside the board, and no longer folds away. */
function KeepButton(props: { kept: boolean; testid: string; onClick(): void }) {
  const { t } = useT();
  return (
    <button
      type="button"
      data-testid={props.testid}
      aria-pressed={props.kept}
      aria-label={t('panel.keepOpen')}
      title={t('panel.keepOpen')}
      onClick={props.onClick}
      className={`grid h-11 w-11 shrink-0 place-items-center rounded-lg ${
        props.kept
          ? 'bg-amber-soft text-ink ring-2 ring-amber'
          : 'text-ink-soft hover:bg-paper hover:text-ink'
      }`}
    >
      {/* A pin. */}
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" aria-hidden>
        <path
          d="M9 4h6l-1 6 3 3H7l3-3zM12 13v7"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

/**
 * The parts, as a rail beside the board (D-106): one column of drawings that
 * widens to show their names while the pointer is on it, and folds away the
 * moment a part is picked, so the board is clear to place it. On a phone it
 * opens on a tap.
 */
function PartsRail({ wide }: { wide: boolean }) {
  const kept = useWorkspace((s) => s.parts) && wide;
  const rail = useRail(kept, 'keyboard');
  const { t } = useT();
  // On a touch screen a first tap opens the list, so a part is picked by name, not by guess.
  const swallow = useRef(false);
  const folded = wide ? '4rem' : '3rem';
  const width = '12.5rem';
  return (
    <aside
      ref={rail.ref}
      {...rail.handlers}
      aria-label={t('drawer.title')}
      data-testid="parts-rail"
      data-open={rail.open}
      data-kept={kept}
      className="relative z-20 shrink-0"
      style={{ width: kept ? width : folded }}
      onPointerDownCapture={(event) => {
        if (event.pointerType !== 'mouse' && !rail.open) {
          rail.setTapped(true);
          swallow.current = true;
        }
      }}
      onClickCapture={(event) => {
        if (!swallow.current) return;
        swallow.current = false;
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <div
        className={`absolute inset-y-0 left-0 flex flex-col overflow-hidden border-r border-line bg-surface transition-[width] duration-150 motion-reduce:transition-none ${
          rail.open && !kept ? 'shadow-[var(--shadow-raised)]' : ''
        }`}
        style={{ width: rail.open ? width : folded }}
      >
        {!wide && (
          <button
            type="button"
            data-testid="parts-open"
            aria-expanded={rail.open}
            aria-label={t('drawer.title')}
            onClick={() => rail.setTapped(!rail.tapped)}
            className="grid h-11 w-12 shrink-0 place-items-center text-ink-soft"
          >
            <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="none"
              stroke="currentColor"
              aria-hidden
            >
              <path
                d={rail.open ? 'M14.5 6L8.5 12l6 6' : 'M9.5 6l6 6-6 6'}
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
        <PartsDrawer
          open={rail.open}
          withTools={wide}
          icon={wide ? 'w-16' : 'w-12'}
          onChosen={rail.dismiss}
          header={
            wide ? (
              <KeepButton
                kept={kept}
                testid="parts-keep"
                onClick={() => useWorkspace.getState().keep('parts', !kept)}
              />
            ) : null
          }
        />
      </div>
    </aside>
  );
}

/**
 * The work panel: the lesson, the circuit's readings, the code and the
 * instruments. On a wide screen it is a rail of tabs at the board's edge
 * (D-106), and what a tab holds opens over the board while the pointer or the
 * focus is in it; kept open, it stands beside the board. On a phone it is
 * below the board, as it was.
 */
function WorkPanel(props: {
  wide: boolean;
  /** How wide the open panel is, without its rail of tabs. */
  width: string;
  panelRef: RefObject<HTMLElement | null>;
  tabs(upright: boolean): ReactNode;
  children: ReactNode;
}) {
  const kept = useWorkspace((s) => s.panel) && props.wide;
  const rail = useRail(kept, 'any');
  if (!props.wide) {
    return (
      <aside ref={props.panelRef} className="flex w-full shrink-0 flex-col bg-surface">
        <div
          role="tablist"
          className="flex shrink-0 gap-0.5 border-b border-line bg-surface px-1.5 pt-1.5"
        >
          {props.tabs(false)}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{props.children}</div>
      </aside>
    );
  }
  return (
    <aside
      ref={(element) => {
        rail.ref.current = element;
        props.panelRef.current = element;
      }}
      {...rail.handlers}
      data-testid="work-panel"
      data-open={rail.open}
      data-kept={kept}
      className="relative z-20 shrink-0"
      style={{ width: kept ? `calc(${props.width} + 4.75rem)` : '4.75rem' }}
    >
      <div
        className={`absolute inset-y-0 right-0 flex border-l border-line bg-surface ${
          rail.open && !kept ? 'shadow-[var(--shadow-raised)]' : ''
        }`}
      >
        {/* Folded, the panel keeps what it holds (a program being written), out of sight. */}
        <div
          className={rail.open ? 'flex min-h-0 flex-col' : 'hidden'}
          style={{ width: props.width }}
          data-testid="work-panel-body"
        >
          <div className="min-h-0 flex-1 overflow-y-auto">{props.children}</div>
        </div>
        <div className="flex w-[4.75rem] shrink-0 flex-col border-l border-line">
          <div role="tablist" aria-orientation="vertical" className="flex flex-col">
            {props.tabs(true)}
          </div>
          <span className="flex-1" />
          <span className="grid place-items-center pb-2">
            <KeepButton
              kept={kept}
              testid="panel-keep"
              onClick={() => useWorkspace.getState().keep('panel', !kept)}
            />
          </span>
        </div>
      </div>
    </aside>
  );
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
  useRunCheckWatch();
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
  const [networkView, setNetworkView] = useState<'web' | 'iot' | 'ble'>('web');
  const canvasOnly = useWorkspace((s) => s.canvasOnly);
  const messages = useLab((s) => s.result?.diagnostics.length ?? 0);
  const panelRef = useRef<HTMLElement>(null);
  const wide = useWide();
  // A project made from a lesson opens at its lesson.
  useEffect(() => setTab(hasLesson ? 'lesson' : 'circuit'), [hasLesson]);
  /** The breadboard is where the circuit is built; the diagram is the same circuit as a schematic. */
  const [view, setView] = useState<'board' | 'diagram' | 'sheet'>('board');
  // A lesson on the logic sheet opens there.
  const sheetLesson = useLessonState((s) => s.lesson?.sheet === true);
  useEffect(() => {
    if (sheetLesson) setView('sheet');
  }, [sheetLesson]);
  const showCode = tab === 'code' && boardId !== undefined;
  const { setName, setRunning } = useLab.getState();
  const { t } = useT();

  if (status !== 'ready') {
    return (
      <main className="mx-auto max-w-xl px-4 py-16 text-center">
        <p className="text-lg">{t(status === 'loading' ? 'lab.loading' : 'lab.notFound')}</p>
        {status === 'missing' && (
          <Link to="/" className="mt-4 inline-block font-semibold text-accent underline">
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

  /** The lesson, readings, code and instruments: beside the board on a wide screen, below it on a phone. */
  const workPanel = !(wide && canvasOnly) && (
    <WorkPanel
      wide={wide}
      width={showCode ? '34rem' : '22rem'}
      panelRef={panelRef}
      tabs={(upright) =>
        tabs.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            data-testid={`tab-${id}`}
            aria-selected={tab === id}
            onClick={() => chooseTab(id)}
            className={
              upright
                ? `relative min-h-12 w-full border-r-[3px] px-1 text-xs font-semibold ${
                    tab === id
                      ? 'border-amber bg-paper text-ink'
                      : 'border-transparent text-ink-soft hover:bg-paper hover:text-ink'
                  }`
                : `min-h-11 flex-1 rounded-t-lg border-b-[3px] px-1 text-sm font-semibold ${
                    tab === id
                      ? 'border-amber text-ink'
                      : 'border-transparent text-ink-soft hover:bg-paper hover:text-ink'
                  }`
            }
          >
            {t(TAB_LABELS[id])}
            {/* Folded, the panel cannot show what the lab has to say: the tab counts it. */}
            {upright && id === 'circuit' && messages > 0 && (
              <span
                data-testid="tab-messages"
                aria-label={t('panel.messages', { count: messages })}
                className="absolute top-1 right-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-amber px-1 text-xs font-bold text-graphite tabular-nums"
              >
                {messages}
              </span>
            )}
          </button>
        ))
      }
    >
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
            {(['web', 'iot', 'ble'] as const).map((id) => (
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
                {t(`${id}.tab`)}
              </button>
            ))}
          </div>
          {networkView === 'web' ? (
            <WebPanel boardId={esp32Id} />
          ) : networkView === 'iot' ? (
            <IotPanel />
          ) : (
            <BlePanel boardId={esp32Id} />
          )}
        </>
      ) : (
        <>
          <Messages />
          <Meter />
          <Inspector />
          <TruthTablePanel />
        </>
      )}
    </WorkPanel>
  );

  return (
    <main className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <div className="flex min-w-0 flex-col lg:min-h-0 lg:flex-1">
        {/* One bar: the way back, the name, the view (on a wide screen), the save state and Run. */}
        <div className="flex h-14 shrink-0 items-center gap-2 bg-surface px-2 lg:gap-3 lg:px-3">
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
          {wide && (
            <button
              type="button"
              data-testid="canvas-only"
              aria-pressed={canvasOnly}
              aria-label={t('lab.canvasOnly')}
              title={t('lab.canvasOnly')}
              onClick={() => useWorkspace.getState().setCanvasOnly(!canvasOnly)}
              className={`grid h-11 w-11 shrink-0 place-items-center rounded-lg ${
                canvasOnly
                  ? 'bg-amber-soft text-ink ring-2 ring-amber'
                  : 'text-ink-soft hover:bg-paper hover:text-ink'
              }`}
            >
              <svg
                viewBox="0 0 24 24"
                width="20"
                height="20"
                fill="none"
                stroke="currentColor"
                aria-hidden
              >
                <path
                  d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          )}
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
          <LabClock />
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

        {/* The breadboard's two rails, as under every page's title. */}
        <span aria-hidden className="rails shrink-0" />

        {/* On a phone: the tools, the parts and the view in a slim row, so nothing covers the board. */}
        {!wide && (
          <div className="flex h-[3.25rem] shrink-0 items-center gap-2 border-b border-line bg-surface px-2">
            {view === 'board' && <ToolPicker compact />}
            <div className="ml-auto">{viewSwitch}</div>
          </div>
        )}
        <div className="flex min-h-0 flex-1">
          {/* The parts, as a narrow rail beside the board that opens while it is in use. */}
          {view === 'board' && !(wide && canvasOnly) && <PartsRail wide={wide} />}
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
                {/* Pause, step and start again, for a circuit that changes over time (D-112). */}
                <div className="pointer-events-none absolute top-3 left-3 z-20">
                  <TimeControls />
                </div>
                {/* Run pressed in a lesson with something it asked for missing (D-110). */}
                <div className="pointer-events-none absolute top-3 right-3 z-20 flex justify-end max-sm:left-2">
                  <RunCheckCard />
                </div>
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
          {wide && workPanel}
        </div>
      </div>

      {!wide && workPanel}
    </main>
  );
}
