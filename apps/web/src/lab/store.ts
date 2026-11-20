import {
  addBattery,
  addWire,
  attachError,
  emptyCircuit,
  flipPart,
  isHole,
  placePart,
  removeItem,
  updateProps,
  type CircuitDocument,
  type EditError,
  type EditResult,
} from '@banglalab/shared';
import type { SimulationResult } from '@banglalab/simulation';
import { create } from 'zustand';

export type Tool = 'select' | 'wire' | 'resistor' | 'led';
export type SaveState = 'saved' | 'saving' | 'error';

interface LabState {
  projectId: string | null;
  name: string;
  circuit: CircuitDocument;
  selectedId: string | null;
  tool: Tool;
  /** First end of the wire being drawn. */
  wireStart: string | null;
  running: boolean;
  /** Latest simulation result; null while stopped. */
  result: SimulationResult | null;
  /** Why the last edit was refused, shown briefly to the student. */
  notice: EditError | null;
  saveState: SaveState;

  open(project: { id: string; name: string; circuit: CircuitDocument }): void;
  close(): void;
  setName(name: string): void;
  setTool(tool: Tool): void;
  select(id: string | null): void;
  /** A tap on a hole or battery terminal; what it does depends on the tool. */
  tapEndpoint(endpoint: string): void;
  addBattery(): void;
  removeSelected(): void;
  flipSelected(): void;
  setProps(id: string, props: Record<string, unknown>): void;
  /** Used while dragging, when the canvas has already validated the move. */
  replaceCircuit(circuit: CircuitDocument): void;
  setNotice(notice: EditError | null): void;
  setRunning(running: boolean): void;
  setResult(result: SimulationResult | null): void;
  setSaveState(saveState: SaveState): void;
}

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
    selectedId: null,
    tool: 'select',
    wireStart: null,
    running: false,
    result: null,
    notice: null,
    saveState: 'saved',

    open(project) {
      set({
        projectId: project.id,
        name: project.name,
        circuit: project.circuit,
        selectedId: null,
        tool: 'select',
        wireStart: null,
        running: false,
        result: null,
        notice: null,
        saveState: 'saved',
      });
    },
    close() {
      set({ projectId: null, running: false, result: null, selectedId: null, wireStart: null });
    },
    setName: (name) => set({ name }),
    setTool: (tool) => set({ tool, wireStart: null, selectedId: null, notice: null }),
    select: (selectedId) => set({ selectedId }),

    tapEndpoint(endpoint) {
      const { tool, circuit, wireStart } = get();
      if (tool === 'resistor' || tool === 'led') {
        if (!isHole(endpoint)) return;
        const id = apply(placePart(circuit, tool, endpoint));
        if (id) set({ tool: 'select', selectedId: id });
      } else if (tool === 'wire') {
        if (wireStart === null) {
          const error = attachError(circuit, endpoint);
          set(error ? { notice: error } : { wireStart: endpoint, notice: null });
        } else if (wireStart === endpoint) {
          set({ wireStart: null });
        } else if (apply(addWire(circuit, wireStart, endpoint))) {
          set({ wireStart: null });
        }
      }
    },

    addBattery() {
      const id = apply(addBattery(get().circuit));
      if (id) set({ tool: 'select', selectedId: id, wireStart: null });
    },
    removeSelected() {
      const { selectedId, circuit } = get();
      if (selectedId && apply(removeItem(circuit, selectedId))) set({ selectedId: null });
    },
    flipSelected() {
      const { selectedId, circuit } = get();
      if (selectedId) apply(flipPart(circuit, selectedId));
    },
    setProps: (id, props) => void apply(updateProps(get().circuit, id, props)),
    replaceCircuit: (circuit) => set({ circuit, notice: null }),
    setNotice: (notice) => set({ notice }),
    setRunning: (running) => set(running ? { running } : { running, result: null }),
    setResult: (result) => set({ result }),
    setSaveState: (saveState) => set({ saveState }),
  };
});
