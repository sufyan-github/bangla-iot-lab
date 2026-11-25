import {
  isProgrammable,
  addWire,
  attachError,
  emptyCircuit,
  blockAsSheet,
  emptySheet,
  isLogicSheet,
  updateBlock,
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
  type BreadboardSize,
} from '@banglalab/shared';
import type {
  BleNote,
  BoardStatus,
  HttpResponse,
  MqttMessage,
  Probe,
  SimulationFrame,
  SimulationResult,
  WebCall,
} from '@banglalab/simulation';
import { create } from 'zustand';
import type { BoardProgram, ProjectContent, SketchTab } from '../storage/projects';
import type { Point } from './geometry';
import { samePlacing, withPart, withPartAt, type Placing } from './placing';
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
/** How many BLE notifications the phone panel keeps for each board. */
const BLE_NOTES_KEPT = 30;
/** How many MQTT messages the data log keeps. */
const MQTT_LOG_KEPT = 5000;
/** How many of the boards' web requests the panel keeps. */
const WEB_CALLS_KEPT = 30;

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
  /** A part that stands beside the breadboards, picked from the list and not yet put down (D-108). */
  placing: Placing | null;
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
  /** The latest requests the boards' programs made to the lab's web services, oldest first. */
  webCalls: WebCall[];
  /** Every MQTT message seen while running, oldest first (the last few thousand), for the data log. */
  mqttLog: MqttMessage[];
  /** The latest BLE notifications each board sent the phone, oldest first. */
  bleNotes: Record<string, BleNote[]>;
  /** How fast the simulation is running against real time; 1 when it keeps up. */
  speed: number;
  /** Simulated time since the circuit was switched on, milliseconds. */
  labTimeMs: number;
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
  /**
   * Applies an edit to the logic sheet; returns it, so a refusal can be shown.
   * While a block is open, the edit is to the block's inside.
   */
  editSheet(edit: (sheet: LogicSheet) => SheetEdit): SheetEdit;
  /** The block whose inside is being changed, or null for the sheet itself. */
  openBlockId: string | null;
  openBlock(id: string | null): void;
  /** Earlier and undone states of the logic sheet, for undo and redo. */
  sheetPast: LogicSheet[];
  sheetFuture: LogicSheet[];
  /** What the sheet's hex digits, counters, registers and lamps show now, for a lesson's checks. */
  sheetValues: { type: string; value: number }[];
  setSheetValues(values: { type: string; value: number }[]): void;
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
  /**
   * Picks up a part that stands beside the breadboards, to be put down with a
   * tap on the mat. Picked again while in hand, it goes to its usual place.
   */
  pickUp(placing: Placing): void;
  /** Puts the part in hand down with its middle at this point; false when it has no room there. */
  placeAt(point: Point): boolean;
  /** Puts the part in hand back. */
  cancelPlacing(): void;
  /** Adds a battery, or (given) a bench power supply or a function generator, in its usual place. */
  addBattery(source?: 'supply' | 'generator'): void;
  /** Adds a breadboard in a free place, below what is already there. */
  addBreadboard(size?: BreadboardSize): void;
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
  webCalls: [] as WebCall[],
  mqttLog: [] as MqttMessage[],
  bleNotes: {} as Record<string, BleNote[]>,
  serial: {},
  pressed: [] as string[],
  speed: 1,
  labTimeMs: 0,
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
   * Adds a part that stands beside the breadboards: at `point`, or in its usual
   * place when there is none. A part with no room stays in hand, and the lab says so.
   */
  const putDown = (placing: Placing, point: Point | null): boolean => {
    const { circuit } = get();
    const id = apply(point ? withPartAt(circuit, placing, point) : withPart(circuit, placing));
    if (!id) return false;
    set({ tool: 'select', placing: null, selectedId: id, wireStart: null });
    if (placing.type === 'uno' || placing.type === 'esp32') {
      // A new board arrives with Blink already on it, as a real one does.
      const starter =
        placing.type === 'uno' ? starterProgram('blink') : starterProgram('blink', 'esp32');
      void starter.then((program) => {
        // Only if the board is still there and nothing was written for it meanwhile.
        const now = get();
        if (now.circuit.components.some((c) => c.id === id) && !now.programs[id]) {
          now.uploadProgram(id, program);
        }
      });
    }
    return true;
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
    placing: null,
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
        openBlockId: null,
        sheetPast: [],
        sheetFuture: [],
        selectedId: null,
        tool: 'select',
        placing: null,
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
    openBlockId: null,
    openBlock: (id) => set({ openBlockId: id }),
    editSheet(edit) {
      const before = get().sheet;
      const open = get().openBlockId;
      const inside = open ? blockAsSheet(before, open) : null;
      let result = edit(inside ?? before);
      // An edit inside a block goes back into the block, and from there to every copy.
      if (inside && result.ok && result.sheet !== inside) {
        const id = result.id;
        const ids = result.ids;
        result = updateBlock(before, open!, result.sheet);
        if (result.ok) result = { ...result, id, ids };
      }
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
    sheetValues: [],
    setSheetValues(values) {
      const before = get().sheetValues;
      if (JSON.stringify(before) !== JSON.stringify(values)) set({ sheetValues: values });
    },
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
    setTool: (tool) =>
      set({ tool, placing: null, wireStart: null, selectedId: null, notice: null }),
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

    pickUp(placing) {
      if (samePlacing(get().placing, placing)) {
        putDown(placing, null);
        return;
      }
      set({ placing, tool: 'select', wireStart: null, selectedId: null, notice: null });
    },
    placeAt(point) {
      const { placing } = get();
      return placing !== null && putDown(placing, point);
    },
    cancelPlacing: () => set({ placing: null }),
    addBreadboard: (size = 'half') => void putDown({ type: 'breadboard', size }, null),
    addBattery: (source) => void putDown({ type: source ?? 'battery' }, null),
    addUno: () => void putDown({ type: 'uno' }, null),
    addMotorDriver: () => void putDown({ type: 'l298n' }, null),
    addEsp32: () => void putDown({ type: 'esp32' }, null),
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
      let bleNotes = get().bleNotes;
      for (const [boardId, board] of Object.entries(frame.boards)) {
        if (!board.bleNotes?.length) continue;
        bleNotes = {
          ...bleNotes,
          [boardId]: [...(bleNotes[boardId] ?? []), ...board.bleNotes].slice(-BLE_NOTES_KEPT),
        };
      }
      const mqttLog = frame.mqtt?.length
        ? [...get().mqttLog, ...frame.mqtt].slice(-MQTT_LOG_KEPT)
        : get().mqttLog;
      const webCalls = frame.web
        ? [...get().webCalls, ...frame.web].slice(-WEB_CALLS_KEPT)
        : get().webCalls;
      signals.append(frame.trace, frame.timeMs);
      set({
        result: frame.result,
        boards: frame.boards,
        pages,
        topics,
        webCalls,
        mqttLog,
        bleNotes,
        serial,
        settings,
        speed: frame.speed ?? 1,
        labTimeMs: frame.timeMs,
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
