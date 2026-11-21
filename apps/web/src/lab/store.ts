import {
  addBattery,
  addUno,
  addWire,
  attachError,
  emptyCircuit,
  flipPart,
  isHole,
  placePart,
  removeItem,
  updateProps,
  type BoardPartType,
  type CircuitDocument,
  type EditError,
  type EditResult,
} from '@banglalab/shared';
import type { BoardStatus, Probe, SimulationFrame, SimulationResult } from '@banglalab/simulation';
import { create } from 'zustand';
import type { BoardProgram, ProjectContent } from '../storage/projects';
import { settleOffBoardPart } from './geometry';
import { signals } from './signals';
import { starterProgram } from './starters';

export type Tool = 'select' | 'wire' | BoardPartType;
export type SaveState = 'saved' | 'saving' | 'error';

/** Serial text is kept to this many characters per board. */
const SERIAL_LIMIT = 8_000;
/** How many steps back the student can undo. */
const HISTORY_LIMIT = 100;
/** Changes to one setting this close together, as from a slider, undo as one step. */
const MERGE_WINDOW_MS = 700;

/** The circuit before an edit, with the programs its boards had then. */
interface HistoryEntry {
  circuit: CircuitDocument;
  programs: Record<string, BoardProgram>;
}

interface LabState {
  projectId: string | null;
  name: string;
  circuit: CircuitDocument;
  /** Program and uploaded firmware for each board, by board id. */
  programs: Record<string, BoardProgram>;
  selectedId: string | null;
  tool: Tool;
  /** First end of the wire being drawn. */
  wireStart: string | null;
  running: boolean;
  /** Push buttons being held down right now. */
  pressed: string[];
  /** Latest readings; null while stopped. */
  result: SimulationResult | null;
  /** Latest status of each board with a running program. */
  boards: Record<string, BoardStatus>;
  /** Counts uploads per board, so a running circuit knows when to restart a program. */
  uploads: Record<string, number>;
  /** Serial output received from each board since the circuit was started. */
  serial: Record<string, string>;
  /** Signals the instruments are recording. */
  probes: Probe[];
  /** Why the last edit was refused, shown briefly to the student. */
  notice: EditError | null;
  saveState: SaveState;
  /** Circuits to go back to, oldest first, and those undone that can be redone. */
  past: HistoryEntry[];
  future: HistoryEntry[];

  open(project: ProjectContent & { id: string }): void;
  close(): void;
  setName(name: string): void;
  setTool(tool: Tool): void;
  select(id: string | null): void;
  /** A tap on a hole, battery terminal or board socket; what it does depends on the tool. */
  tapEndpoint(endpoint: string): void;
  /** Drops the wire being drawn; `toSelect` also puts the wire tool away. */
  endWire(toSelect: boolean): void;
  addBattery(): void;
  addUno(): void;
  removeSelected(): void;
  flipSelected(): void;
  setProps(id: string, props: Record<string, unknown>): void;
  /** Used while dragging, when the canvas has already validated the move. */
  replaceCircuit(circuit: CircuitDocument): void;
  /** Ends a drag: everything since `origin` becomes one step that can be undone. */
  commitDrag(origin: CircuitDocument): void;
  undo(): void;
  redo(): void;
  /** Changes the program text without touching what is on the board. */
  setSource(boardId: string, source: string): void;
  /** Puts firmware on the board; a running circuit restarts that board's program. */
  uploadProgram(boardId: string, program: BoardProgram): void;
  setPressed(id: string, down: boolean): void;
  setProbes(probes: Probe[]): void;
  setNotice(notice: EditError | null): void;
  setRunning(running: boolean): void;
  receiveFrame(frame: SimulationFrame): void;
  clearSerial(boardId: string): void;
  setSaveState(saveState: SaveState): void;
}

const STOPPED = { running: false, result: null, boards: {}, serial: {}, pressed: [] as string[] };

export const useLab = create<LabState>((set, get) => {
  /** The setting changed by the last edit and when, for merging a slider's steps. */
  let lastEdit: { key: string; time: number } | null = null;

  /** Records the circuit as it is now, so the edit about to be made can be undone. */
  const remember = (mergeKey?: string) => {
    const now = Date.now();
    const merges =
      mergeKey !== undefined && lastEdit?.key === mergeKey && now - lastEdit.time < MERGE_WINDOW_MS;
    lastEdit = mergeKey === undefined ? null : { key: mergeKey, time: now };
    const { past, circuit, programs } = get();
    set({
      past: merges ? past : [...past, { circuit, programs }].slice(-HISTORY_LIMIT),
      future: [],
    });
  };

  /** Commits a successful edit or reports why it was refused. */
  const apply = (result: EditResult, mergeKey?: string): string | null => {
    if (!result.ok) {
      set({ notice: result.error });
      return null;
    }
    remember(mergeKey);
    set({ circuit: result.circuit, notice: null });
    return result.id;
  };

  /**
   * Goes to a circuit from the history. Programs follow their boards: a board
   * that comes back gets the program it had, and a board that goes takes its
   * program with it. Program text typed since is never rolled back.
   */
  const restore = (entry: HistoryEntry, stacks: Pick<LabState, 'past' | 'future'>) => {
    const { programs, uploads, selectedId } = get();
    const boardIds = entry.circuit.components.filter((c) => c.type === 'uno').map((c) => c.id);
    const nextPrograms: Record<string, BoardProgram> = {};
    const nextUploads = { ...uploads };
    for (const id of boardIds) {
      const program = programs[id] ?? entry.programs[id];
      if (!program) continue;
      nextPrograms[id] = program;
      // A running circuit loads the program onto a board that has just come back.
      if (!programs[id]) nextUploads[id] = (uploads[id] ?? 0) + 1;
    }
    const stillThere = [...entry.circuit.components, ...entry.circuit.wires].some(
      (item) => item.id === selectedId,
    );
    lastEdit = null;
    set({
      circuit: entry.circuit,
      programs: nextPrograms,
      uploads: nextUploads,
      selectedId: stillThere ? selectedId : null,
      wireStart: null,
      notice: null,
      ...stacks,
    });
  };

  return {
    projectId: null,
    name: '',
    circuit: emptyCircuit(),
    programs: {},
    uploads: {},
    probes: [],
    selectedId: null,
    tool: 'select',
    wireStart: null,
    notice: null,
    saveState: 'saved',
    past: [],
    future: [],
    ...STOPPED,

    open(project) {
      lastEdit = null;
      set({
        past: [],
        future: [],
        projectId: project.id,
        name: project.name,
        circuit: project.circuit,
        programs: project.programs,
        selectedId: null,
        tool: 'select',
        wireStart: null,
        notice: null,
        saveState: 'saved',
        ...STOPPED,
      });
    },
    close() {
      set({ projectId: null, selectedId: null, wireStart: null, past: [], future: [], ...STOPPED });
    },
    setName: (name) => set({ name }),
    setTool: (tool) => set({ tool, wireStart: null, selectedId: null, notice: null }),
    select: (selectedId) => set({ selectedId }),

    tapEndpoint(endpoint) {
      const { tool, circuit, wireStart } = get();
      if (tool === 'select') return;
      if (tool === 'wire') {
        if (wireStart === null) {
          const error = attachError(circuit, endpoint);
          set(error ? { notice: error } : { wireStart: endpoint, notice: null });
        } else if (wireStart === endpoint) {
          set({ wireStart: null });
        } else if (apply(addWire(circuit, wireStart, endpoint))) {
          set({ wireStart: null });
        }
      } else if (isHole(endpoint)) {
        const id = apply(placePart(circuit, tool, endpoint));
        if (id) set({ tool: 'select', selectedId: id });
      }
    },

    endWire: (toSelect) =>
      set(toSelect ? { wireStart: null, tool: 'select' } : { wireStart: null }),

    addBattery() {
      const id = apply(addBattery(get().circuit));
      if (!id) return;
      // Its usual place may be taken by something the student moved there.
      set({ circuit: settleOffBoardPart(get().circuit, id) });
      set({ tool: 'select', selectedId: id, wireStart: null });
    },
    addUno() {
      const id = apply(addUno(get().circuit));
      if (!id) return;
      set({ circuit: settleOffBoardPart(get().circuit, id) });
      // A new board arrives with Blink already on it, as a real UNO does.
      set({ tool: 'select', selectedId: id, wireStart: null });
      get().uploadProgram(id, starterProgram('blink'));
    },
    removeSelected() {
      const { selectedId, circuit, programs } = get();
      if (!selectedId || !apply(removeItem(circuit, selectedId))) return;
      const remaining = { ...programs };
      delete remaining[selectedId];
      set({ selectedId: null, programs: remaining });
    },
    flipSelected() {
      const { selectedId, circuit } = get();
      if (selectedId) apply(flipPart(circuit, selectedId));
    },
    setProps: (id, props) =>
      void apply(
        updateProps(get().circuit, id, props),
        `${id}:${Object.keys(props).sort().join(',')}`,
      ),
    replaceCircuit: (circuit) => set({ circuit, notice: null }),
    commitDrag(origin) {
      const { circuit, past, programs } = get();
      // A drag that ended where it began changed nothing worth a step.
      if (origin === circuit || JSON.stringify(origin) === JSON.stringify(circuit)) return;
      lastEdit = null;
      set({ past: [...past, { circuit: origin, programs }].slice(-HISTORY_LIMIT), future: [] });
    },
    undo() {
      const { past, future, circuit, programs } = get();
      const entry = past.at(-1);
      if (!entry) return;
      restore(entry, { past: past.slice(0, -1), future: [...future, { circuit, programs }] });
    },
    redo() {
      const { past, future, circuit, programs } = get();
      const entry = future.at(-1);
      if (!entry) return;
      restore(entry, { past: [...past, { circuit, programs }], future: future.slice(0, -1) });
    },
    setSource(boardId, source) {
      const program = get().programs[boardId] ?? { hex: null, hexSource: null };
      set({ programs: { ...get().programs, [boardId]: { ...program, source } } });
    },
    uploadProgram(boardId, program) {
      const { programs, uploads } = get();
      set({
        programs: { ...programs, [boardId]: program },
        uploads: { ...uploads, [boardId]: (uploads[boardId] ?? 0) + 1 },
      });
    },
    setPressed(id, down) {
      const pressed = get().pressed.filter((other) => other !== id);
      if (down) pressed.push(id);
      if (pressed.length !== get().pressed.length) set({ pressed });
    },
    setProbes: (probes) => set({ probes }),
    setNotice: (notice) => set({ notice }),
    setRunning(running) {
      if (running) signals.reset(get().probes);
      set(running ? { running } : STOPPED);
    },

    receiveFrame(frame) {
      if (!get().running) return; // a frame that was already on its way when the circuit stopped
      let serial = get().serial;
      for (const [boardId, board] of Object.entries(frame.boards)) {
        if (!board.serial) continue;
        serial = {
          ...serial,
          [boardId]: ((serial[boardId] ?? '') + board.serial).slice(-SERIAL_LIMIT),
        };
      }
      signals.append(frame.trace, frame.timeMs);
      set({ result: frame.result, boards: frame.boards, serial });
    },
    clearSerial: (boardId) => set({ serial: { ...get().serial, [boardId]: '' } }),
    setSaveState: (saveState) => set({ saveState }),
  };
});
