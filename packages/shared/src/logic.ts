import type { GATE_CHIPS } from './circuit';
import { LOGIC_CHIP_GATES, gateOutput, type LogicChip } from './circuit';

/**
 * What each logic chip does, as one rule for all of them: the levels on its
 * inputs now and a moment ago, and what it remembers, give the levels on its
 * outputs and what it remembers next. A gate chip remembers nothing; a
 * flip-flop remembers its Q and changes it on a clock's rising edge, which it
 * sees as an input LOW a moment ago and HIGH now.
 *
 * From the standard 74xx datasheets (pinouts and function tables).
 */

/** Inputs and outputs that belong together: one gate, or one flip-flop. */
export interface ChipUnit {
  inputs: readonly number[];
  outputs: readonly number[];
}

export interface ChipStep {
  /** Each output's level, or null for an output let go (high impedance). */
  outputs: Record<number, boolean | null>;
  memory: number[];
}

export interface ChipModel {
  /** Pins in the package: 14 or 16. */
  pins: number;
  supply: number;
  ground: number;
  units: readonly ChipUnit[];
  /** The datasheet's name for each pin, for the diagram. */
  labels: Readonly<Record<number, string>>;
  /** True when the chip remembers anything, so its memory must be kept and compared. */
  remembers: boolean;
  /**
   * The outputs for the inputs `now`, which were `before` a moment ago (absent
   * at power-on), given what the chip remembered (empty at power-on).
   */
  step(
    now: Readonly<Record<number, boolean>>,
    before: Readonly<Record<number, boolean>>,
    memory: readonly number[],
  ): ChipStep;
}

/** True when `pin` went from LOW to HIGH between the two moments. */
export function rose(
  pin: number,
  now: Readonly<Record<number, boolean>>,
  before: Readonly<Record<number, boolean>>,
): boolean {
  return before[pin] === false && now[pin] === true;
}

/** True when `pin` went from HIGH to LOW between the two moments. */
export function fell(
  pin: number,
  now: Readonly<Record<number, boolean>>,
  before: Readonly<Record<number, boolean>>,
): boolean {
  return before[pin] === true && now[pin] === false;
}

function gateChip(chip: (typeof GATE_CHIPS)[number]): ChipModel {
  const { kind, gates } = LOGIC_CHIP_GATES[chip];
  const labels: Record<number, string> = { 7: 'GND', 14: 'VCC' };
  return {
    pins: 14,
    supply: 14,
    ground: 7,
    units: gates.map((gate) => ({ inputs: gate.inputs, outputs: [gate.output] })),
    labels,
    remembers: false,
    step(now) {
      const outputs: Record<number, boolean> = {};
      for (const gate of gates)
        outputs[gate.output] = gateOutput(
          kind,
          gate.inputs.map((i) => now[i] ?? false),
        );
      return { outputs, memory: [] };
    },
  };
}

/**
 * 74HC74: two D flip-flops with preset and clear, both active LOW. On the
 * clock's rising edge Q takes D. Clear LOW forces Q LOW, preset LOW forces it
 * HIGH; both LOW at once make Q and Q̄ both HIGH, as the function table says.
 */
const FLIP_FLOPS = [
  { clear: 1, d: 2, clock: 3, preset: 4, q: 5, notQ: 6 },
  { clear: 13, d: 12, clock: 11, preset: 10, q: 9, notQ: 8 },
] as const;

const HC74: ChipModel = {
  pins: 14,
  supply: 14,
  ground: 7,
  units: FLIP_FLOPS.map((f) => ({
    inputs: [f.clear, f.d, f.clock, f.preset],
    outputs: [f.q, f.notQ],
  })),
  labels: {
    1: '1CLR',
    2: '1D',
    3: '1CLK',
    4: '1PRE',
    5: '1Q',
    6: '1Q̅',
    7: 'GND',
    8: '2Q̅',
    9: '2Q',
    10: '2PRE',
    11: '2CLK',
    12: '2D',
    13: '2CLR',
    14: 'VCC',
  },
  remembers: true,
  step(now, before, memory) {
    const outputs: Record<number, boolean> = {};
    const next: number[] = [];
    FLIP_FLOPS.forEach((f, i) => {
      let q = memory[i] === 1;
      const clear = now[f.clear] === false;
      const preset = now[f.preset] === false;
      if (clear && preset) {
        outputs[f.q] = true;
        outputs[f.notQ] = true;
        next.push(0);
        return;
      }
      if (clear) q = false;
      else if (preset) q = true;
      else if (rose(f.clock, now, before)) q = now[f.d] === true;
      outputs[f.q] = q;
      outputs[f.notQ] = !q;
      next.push(q ? 1 : 0);
    });
    return { outputs, memory: next };
  },
};

export const CHIP_MODELS: Readonly<Record<LogicChip, ChipModel>> = {
  '74HC00': gateChip('74HC00'),
  '74HC02': gateChip('74HC02'),
  '74HC04': gateChip('74HC04'),
  '74HC08': gateChip('74HC08'),
  '74HC32': gateChip('74HC32'),
  '74HC86': gateChip('74HC86'),
  '74HC74': HC74,
};

/** Every input pin of a chip, once each. */
export function chipInputs(model: ChipModel): number[] {
  return [...new Set(model.units.flatMap((unit) => unit.inputs))];
}

/** Every output pin of a chip, once each. */
export function chipOutputs(model: ChipModel): number[] {
  return [...new Set(model.units.flatMap((unit) => unit.outputs))];
}
