import { updateProps, type CircuitDocument } from '@banglalab/shared';
import { SimulationSession } from '@banglalab/simulation';

/**
 * The truth table of what the student built: every combination of its
 * switches (the inputs, at most four), and whether each LED (the outputs) is
 * lit. Worked out by the same simulation the lab runs, one combination at a time.
 */
export interface TruthTable {
  inputs: string[];
  outputs: string[];
  rows: { inputs: boolean[]; outputs: boolean[] }[];
  /**
   * True when the circuit remembers (a latch): going through the combinations
   * in the opposite order gives different outputs, so the table depends on
   * what came before.
   */
  remembers: boolean;
}

export const MAX_TABLE_INPUTS = 4;

/** The switches and LEDs a table would be made of, or null when there is nothing to tabulate. */
export function tableParts(
  circuit: CircuitDocument,
): { inputs: string[]; outputs: string[] } | null {
  const inputs = circuit.components.filter((c) => c.type === 'switch').map((c) => c.id);
  const outputs = circuit.components.filter((c) => c.type === 'led').map((c) => c.id);
  if (inputs.length === 0 || outputs.length === 0 || inputs.length > MAX_TABLE_INPUTS) return null;
  return { inputs, outputs };
}

export function truthTable(circuit: CircuitDocument): TruthTable | null {
  const parts = tableParts(circuit);
  if (!parts) return null;
  const { inputs, outputs } = parts;
  const combinations = Array.from({ length: 1 << inputs.length }, (_, row) =>
    // The first switch is the leftmost column and changes slowest, as tables are written.
    inputs.map((_, i) => ((row >> (inputs.length - 1 - i)) & 1) === 1),
  );
  const run = (order: number[]) => {
    const session = new SimulationSession(circuit);
    const seen = new Map<number, boolean[]>();
    for (const index of order) {
      let next = circuit;
      combinations[index]!.forEach((closed, i) => {
        const changed = updateProps(next, inputs[i]!, { closed });
        if (changed.ok) next = changed.circuit;
      });
      session.update(next);
      session.advance(1);
      const { readings } = session.frame().result;
      seen.set(
        index,
        outputs.map((id) => {
          const state = readings[id]?.led?.state;
          return state === 'on' || state === 'overcurrent';
        }),
      );
    }
    return seen;
  };
  const forward = run(combinations.map((_, i) => i));
  const backward = run(combinations.map((_, i) => combinations.length - 1 - i));
  return {
    inputs,
    outputs,
    rows: combinations.map((levels, i) => ({ inputs: levels, outputs: forward.get(i)! })),
    remembers: combinations.some((_, i) =>
      forward.get(i)!.some((lit, j) => lit !== backward.get(i)![j]),
    ),
  };
}
