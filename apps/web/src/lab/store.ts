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
import type { BoardStatus, SimulationFrame, SimulationResult } from '@banglalab/simulation';
import { create } from 'zustand';
import type { BoardProgram, ProjectContent } from '../storage/projects';
import { starterProgram } from './starters';

export type Tool = 'select' | 'wire' | BoardPartType;
export type SaveState = 'saved' | 'saving' | 'error';

/** Serial text is kept to this many characters per board. */
const SERIAL_LIMIT = 8_000;

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
  /** Why the last edit was refused, shown briefly to the student. */
  notice: EditError | null;
  saveState: SaveState;

  open(project: ProjectContent & { id: string }): void;
  close(): void;
  setName(name: string): void;
  setTool(tool: Tool): void;
  select(id: string | null): void;
  /** A tap on a hole, battery terminal or board socket; what it does depends on the tool. */
  tapEndpoint(endpoint: string): void;
  addBattery(): void;
  addUno(): void;
  removeSelected(): void;
  flipSelected(): void;
  setProps(id: string, props: Record<string, unknown>): void;
  /** Used while dragging, when the canvas has already validated the move. */
  replaceCircuit(circuit: CircuitDocument): void;
  /** Changes the program text without touching what is on the board. */
  setSource(boardId: string, source: string): void;
  /** Puts firmware on the board; a running circuit restarts that board's program. */
  uploadProgram(boardId: string, program: BoardProgram): void;
  setPressed(id: string, down: boolean): void;
  setNotice(notice: EditError | null): void;
  setRunning(running: boolean): void;
  receiveFrame(frame: SimulationFrame): void;
  clearSerial(boardId: string): void;
  setSaveState(saveState: SaveState): void;
}

const STOPPED = { running: false, result: null, boards: {}, serial: {}, pressed: [] as string[] };

export const useLab = create<LabState>((set, get) => {
  /** Commits a successful edit or reports why it was refused. */
  const apply = (result: EditResult): string | null => {
    if (!result.ok) {
      set({ notice: result.error });
      return null;
    }
    set({ circuit: result.circuit, notice: null });
    return result.id;
  };

  return {
    projectId: null,
    name: '',
    circuit: emptyCircuit(),
    programs: {},
    uploads: {},
    selectedId: null,
    tool: 'select',
    wireStart: null,
    notice: null,
    saveState: 'saved',
    ...STOPPED,

    open(project) {
      set({
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
      set({ projectId: null, selectedId: null, wireStart: null, ...STOPPED });
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

    addBattery() {
      const id = apply(addBattery(get().circuit));
      if (id) set({ tool: 'select', selectedId: id, wireStart: null });
    },
    addUno() {
      const id = apply(addUno(get().circuit));
      if (!id) return;
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
    setProps: (id, props) => void apply(updateProps(get().circuit, id, props)),
    replaceCircuit: (circuit) => set({ circuit, notice: null }),
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
    setNotice: (notice) => set({ notice }),
    setRunning: (running) => set(running ? { running } : STOPPED),

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
      set({ result: frame.result, boards: frame.boards, serial });
    },
    clearSerial: (boardId) => set({ serial: { ...get().serial, [boardId]: '' } }),
    setSaveState: (saveState) => set({ saveState }),
  };
});
