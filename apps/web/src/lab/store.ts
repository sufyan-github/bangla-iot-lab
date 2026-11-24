import {
  addBattery,
  addBreadboard,
  addEsp32,
  addMotorDriver,
  addUno,
  isProgrammable,
  addWire,
  attachError,
  emptyCircuit,
  emptySheet,
  isLogicSheet,
  flipPart,
  isHole,
  placePart,
  removeItem,
  setWireBends,
  updateProps,
  type BoardPartType,
  type CircuitDocument,
  type LogicSheet,
  type SheetEdit,
  type EditError,
  type EditResult,
} from '@banglalab/shared';
import type {
  BoardStatus,
  HttpResponse,
  MqttMessage,
  Probe,
  SimulationFrame,
  SimulationResult,
} from '@banglalab/simulation';
import { create } from 'zustand';
import type { BoardProgram, ProjectContent, SketchTab } from '../storage/projects';
import { freeBreadboardPlace, placeBesideOtherBoard, settleOffBoardPart } from './geometry';
import { signals } from './signals';
import { starterProgram } from './starters';

export type Tool = 'select' | 'wire' | 'probe' | BoardPartType;

/** Where the multimeter's two probes are touching; `last` is the one placed most recently. */
export interface MeterProbes {
  red: string | null;
  black: string | null;
  last: 'red' | 'black';
}
const NO_PROBES: MeterProbes = { red: null, black: null, last: 'black' };
export type SaveState = 'saved' | 'saving' | 'error';

/** Serial text is kept to this many characters per board. */
const SERIAL_LIMIT = 8_000;
/** How many recent numbers each MQTT topic keeps for its little chart. */
const TOPIC_HISTORY = 60;

export interface MqttTopic extends MqttMessage {
  /** Its recent numeric payloads, oldest first. */
  history: number[];
  count: number;
}
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
  /** Each board's saved settings (Preferences), by board id; kept with the project. */
  settings: Record<string, string>;
  /** The project's logic sheet: a circuit of logic symbols, apart from the breadboard. */
  sheet: LogicSheet;
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
  /** The latest answer each board's web server gave, by board id. */
  pages: Record<string, HttpResponse>;
  /** Each MQTT topic seen while running: its latest message and its recent numbers. */
  topics: Record<string, MqttTopic>;
  /** How fast the simulation is running against real time; 1 when it keeps up. */
  speed: number;
  /** Counts uploads per board, so a running circuit knows when to restart a program. */
  uploads: Record<string, number>;
  /** Serial output received from each board since the circuit was started. */
  serial: Record<string, string>;
  /** Signals the instruments are recording. */
  probes: Probe[];
  /** The multimeter's probes. Not part of the saved circuit. */
  meter: MeterProbes;
  /** Why the last edit was refused, shown briefly to the student. */
  notice: EditError | null;
  saveState: SaveState;
  /** Circuits to go back to, oldest first, and those undone that can be redone. */
  past: HistoryEntry[];
  future: HistoryEntry[];

  open(project: ProjectContent & { id: string }): void;
  close(): void;
  setName(name: string): void;
  /** Applies an edit to the logic sheet; returns it, so a refusal can be shown. */
  editSheet(edit: (sheet: LogicSheet) => SheetEdit): SheetEdit;
  /** Earlier and undone states of the logic sheet, for undo and redo. */
  sheetPast: LogicSheet[];
  sheetFuture: LogicSheet[];
  undoSheet(): void;
  redoSheet(): void;
  setTool(tool: Tool): void;
  select(id: string | null): void;
  /** A tap on a hole, battery terminal or board socket; what it does depends on the tool. */
  tapEndpoint(endpoint: string): void;
  /** Drops the wire being drawn; `toSelect` also puts the wire tool away. */
  endWire(toSelect: boolean): void;
  /** Takes both multimeter probes off the circuit. */
  clearMeter(): void;
  /** Adds a battery, or (given) a bench power supply or a function generator. */
  addBattery(source?: 'supply' | 'generator'): void;
  /** Adds a half breadboard in a free place, below what is already there. */
  addBreadboard(): void;
  addUno(): void;
  addEsp32(): void;
  addMotorDriver(): void;
  removeSelected(): void;
  flipSelected(): void;
  /** Takes the bends out of the selected wire. */
  straightenSelected(): void;
  setProps(id: string, props: Record<string, unknown>): void;
  /** Used while dragging, when the canvas has already validated the move. */
  replaceCircuit(circuit: CircuitDocument): void;
  /** Ends a drag: everything since `origin` becomes one step that can be undone. */
  commitDrag(origin: CircuitDocument): void;
  undo(): void;
  redo(): void;
  /** Changes the program text without touching what is on the board. */
  setSource(boardId: string, source: string): void;
  /** Replaces a program's other files (its tabs), without touching what is on the board. */
  setFiles(boardId: string, files: SketchTab[]): void;
  /** Puts firmware on the board; a running circuit restarts that board's program. */
  uploadProgram(boardId: string, program: BoardProgram): void;
  /** ESP32 only: chooses how the board's program is run. The program must then be uploaded again. */
  setEngine(boardId: string, engine: 'library' | 'emulator'): void;
  setPressed(id: string, down: boolean): void;
  setProbes(probes: Probe[]): void;
  setNotice(notice: EditError | null): void;
  setRunning(running: boolean): void;
  receiveFrame(frame: SimulationFrame): void;
  clearSerial(boardId: string): void;
  /** Erases a board's saved settings, as erasing its flash would. Only while stopped. */
  eraseSettings(boardId: string): void;
  setSaveState(saveState: SaveState): void;
}

const STOPPED = {
  running: false,
  result: null,
  boards: {},
  pages: {} as Record<string, HttpResponse>,
  topics: {} as Record<string, MqttTopic>,
  serial: {},
  pressed: [] as string[],
  speed: 1,
};

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
    const boardIds = entry.circuit.components.filter(isProgrammable).map((c) => c.id);
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
    settings: {},
    sheet: emptySheet(),
    uploads: {},
    probes: [],
    selectedId: null,
    tool: 'select',
    wireStart: null,
    notice: null,
    meter: NO_PROBES,
    saveState: 'saved',
    past: [],
    future: [],
    ...STOPPED,

    open(project) {
      lastEdit = null;
      set({
        meter: NO_PROBES,
        past: [],
        future: [],
        projectId: project.id,
        name: project.name,
        circuit: project.circuit,
        programs: project.programs,
        settings: project.settings ?? {},
        sheet: isLogicSheet(project.sheet) ? project.sheet : emptySheet(),
        sheetPast: [],
        sheetFuture: [],
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
    editSheet(edit) {
      const before = get().sheet;
      const result = edit(before);
      if (result.ok && result.sheet !== before) {
        set({
          sheet: result.sheet,
          sheetPast: [...get().sheetPast, before].slice(-HISTORY_LIMIT),
          sheetFuture: [],
        });
      }
      return result;
    },
    sheetPast: [],
    sheetFuture: [],
    undoSheet() {
      const past = get().sheetPast;
      if (past.length === 0) return;
      set({
        sheet: past.at(-1)!,
        sheetPast: past.slice(0, -1),
        sheetFuture: [get().sheet, ...get().sheetFuture],
      });
    },
    redoSheet() {
      const [next, ...rest] = get().sheetFuture;
      if (!next) return;
      set({ sheet: next, sheetPast: [...get().sheetPast, get().sheet], sheetFuture: rest });
    },
    setTool: (tool) => set({ tool, wireStart: null, selectedId: null, notice: null }),
    select: (selectedId) => set({ selectedId }),

    tapEndpoint(endpoint) {
      const { tool, circuit, wireStart, meter } = get();
      if (tool === 'select') return;
      if (tool === 'probe') {
        // A tap on a probe lifts it. Otherwise the probes take turns: red first, then black.
        if (meter.red === endpoint) set({ meter: { ...meter, red: null, last: 'black' } });
        else if (meter.black === endpoint) set({ meter: { ...meter, black: null, last: 'red' } });
        else {
          const next =
            meter.red === null
              ? 'red'
              : meter.black === null
                ? 'black'
                : meter.last === 'red'
                  ? 'black'
                  : 'red';
          set({ meter: { ...meter, [next]: endpoint, last: next } });
        }
      } else if (tool === 'wire') {
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

    clearMeter: () => set({ meter: NO_PROBES }),
    endWire: (toSelect) =>
      set(toSelect ? { wireStart: null, tool: 'select' } : { wireStart: null }),

    addBreadboard() {
      const place = freeBreadboardPlace(get().circuit, 'half');
      if (!place) {
        set({ notice: 'no-room' });
        return;
      }
      const id = apply(addBreadboard(get().circuit, 'half', place));
      if (id) set({ tool: 'select', selectedId: id, wireStart: null });
    },
    addBattery(source) {
      const id = apply(addBattery(get().circuit, 9, source));
      if (!id) return;
      // Its usual place may be taken by something the student moved there.
      set({ circuit: settleOffBoardPart(get().circuit, id) });
      set({ tool: 'select', selectedId: id, wireStart: null });
    },
    addUno() {
      const id = apply(addUno(get().circuit));
      if (!id) return;
      set({ circuit: placeBesideOtherBoard(get().circuit, id) });
      // A new board arrives with Blink already on it, as a real UNO does.
      set({ tool: 'select', selectedId: id, wireStart: null });
      void starterProgram('blink').then((program) => {
        // Only if the board is still there and nothing was written for it meanwhile.
        const { circuit, programs } = get();
        if (circuit.components.some((c) => c.id === id) && !programs[id]) {
          get().uploadProgram(id, program);
        }
      });
    },
    addMotorDriver() {
      const id = apply(addMotorDriver(get().circuit));
      if (!id) return;
      set({ circuit: settleOffBoardPart(get().circuit, id) });
      set({ tool: 'select', selectedId: id, wireStart: null });
    },
    addEsp32() {
      const id = apply(addEsp32(get().circuit));
      if (!id) return;
      set({ circuit: placeBesideOtherBoard(get().circuit, id) });
      set({ tool: 'select', selectedId: id, wireStart: null });
      // Like the UNO-compatible board, it arrives with Blink on it.
      void starterProgram('blink', 'esp32').then((program) => {
        const { circuit, programs } = get();
        if (circuit.components.some((c) => c.id === id) && !programs[id]) {
          get().uploadProgram(id, program);
        }
      });
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
    straightenSelected() {
      const { selectedId, circuit } = get();
      if (selectedId) apply(setWireBends(circuit, selectedId, []));
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
    setFiles(boardId, files) {
      const program = get().programs[boardId] ?? { source: '', hex: null, hexSource: null };
      const next = { ...program };
      if (files.length) next.files = files;
      else delete next.files;
      set({ programs: { ...get().programs, [boardId]: next } });
    },
    uploadProgram(boardId, program) {
      const { programs, uploads } = get();
      set({
        programs: { ...programs, [boardId]: program },
        uploads: { ...uploads, [boardId]: (uploads[boardId] ?? 0) + 1 },
      });
    },
    setEngine(boardId, engine) {
      const program = get().programs[boardId];
      if (!program || (program.engine ?? 'library') === engine) return;
      set({ programs: { ...get().programs, [boardId]: { ...program, engine } } });
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
      let settings = get().settings;
      for (const [boardId, board] of Object.entries(frame.boards)) {
        if (board.settings !== undefined) settings = { ...settings, [boardId]: board.settings };
      }
      let pages = get().pages;
      for (const [boardId, board] of Object.entries(frame.boards)) {
        const last = board.http?.at(-1);
        if (last) pages = { ...pages, [boardId]: last };
      }
      let topics = get().topics;
      for (const message of frame.mqtt ?? []) {
        const before = topics[message.topic];
        const number = Number(message.payload);
        const history =
          Number.isFinite(number) && message.payload.trim() !== ''
            ? [...(before?.history ?? []), number].slice(-TOPIC_HISTORY)
            : (before?.history ?? []);
        topics = {
          ...topics,
          [message.topic]: { ...message, history, count: (before?.count ?? 0) + 1 },
        };
      }
      signals.append(frame.trace, frame.timeMs);
      set({
        result: frame.result,
        boards: frame.boards,
        pages,
        topics,
        serial,
        settings,
        speed: frame.speed ?? 1,
      });
    },
    clearSerial: (boardId) => set({ serial: { ...get().serial, [boardId]: '' } }),
    eraseSettings(boardId) {
      if (get().running) return;
      const settings = { ...get().settings };
      delete settings[boardId];
      set({ settings });
    },
    setSaveState: (saveState) => set({ saveState }),
  };
});
