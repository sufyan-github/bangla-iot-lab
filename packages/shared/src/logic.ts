import type { GATE_CHIPS } from './circuit';
import { LOGIC_CHIP_GATES, gateOutput, type AnyLogicChip } from './circuit';

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
  /**
   * The lowest supply it works from and the highest it takes without harm, in
   * volts: 2 and 6 for the 74HC family, 3 and 18 for the CMOS 4000 family.
   */
  supplyRange: readonly [number, number];
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

/** REPORTED, from the 74HC family's datasheets. */
const HC_SUPPLY = [2, 6] as const;

function gateChip(chip: (typeof GATE_CHIPS)[number]): ChipModel {
  const { kind, gates } = LOGIC_CHIP_GATES[chip];
  const labels: Record<number, string> = { 7: 'GND', 14: 'VCC' };
  return {
    pins: 14,
    supply: 14,
    ground: 7,
    supplyRange: HC_SUPPLY,
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
  supplyRange: HC_SUPPLY,
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

/** The four bits of a count, least significant first. */
const bits = (count: number) => [0, 1, 2, 3].map((bit) => ((count >> bit) & 1) === 1);
const countOf = (levels: readonly boolean[]) =>
  levels.reduce((sum, high, bit) => sum + (high ? 1 << bit : 0), 0);

/**
 * 74HC393: two 4-bit binary counters. Each counts up on its clock's falling
 * edge (HIGH to LOW), and its master reset, active HIGH, holds it at 0.
 */
const COUNTERS_393 = [
  { clock: 1, reset: 2, q: [3, 4, 5, 6] },
  { clock: 13, reset: 12, q: [11, 10, 9, 8] },
] as const;

const HC393: ChipModel = {
  pins: 14,
  supply: 14,
  ground: 7,
  supplyRange: HC_SUPPLY,
  units: COUNTERS_393.map((c) => ({ inputs: [c.clock, c.reset], outputs: c.q })),
  labels: {
    1: '1CP',
    2: '1MR',
    3: '1Q0',
    4: '1Q1',
    5: '1Q2',
    6: '1Q3',
    7: 'GND',
    8: '2Q3',
    9: '2Q2',
    10: '2Q1',
    11: '2Q0',
    12: '2MR',
    13: '2CP',
    14: 'VCC',
  },
  remembers: true,
  step(now, before, memory) {
    const outputs: Record<number, boolean> = {};
    const next = COUNTERS_393.map((c, i) => {
      let count = memory[i] ?? 0;
      if (now[c.reset] === true) count = 0;
      else if (fell(c.clock, now, before)) count = (count + 1) % 16;
      bits(count).forEach((high, bit) => (outputs[c.q[bit]!] = high));
      return count;
    });
    return { outputs, memory: next };
  },
};

/**
 * 74HC161: a 4-bit synchronous binary counter in 16 pins. MR̄ LOW clears it at
 * once. On the clock's rising edge, PĒ LOW loads D0 to D3; otherwise it counts
 * up when CEP and CET are both HIGH. TC is HIGH when CET is HIGH and the count
 * is 15, to carry into a second counter.
 */
const P161 = {
  reset: 1,
  clock: 2,
  d: [3, 4, 5, 6],
  cep: 7,
  load: 9,
  cet: 10,
  q: [14, 13, 12, 11],
  tc: 15,
} as const;

const HC161: ChipModel = {
  pins: 16,
  supply: 16,
  ground: 8,
  supplyRange: HC_SUPPLY,
  units: [
    {
      inputs: [P161.reset, P161.clock, ...P161.d, P161.cep, P161.load, P161.cet],
      outputs: [...P161.q, P161.tc],
    },
  ],
  labels: {
    1: 'MR̅',
    2: 'CP',
    3: 'D0',
    4: 'D1',
    5: 'D2',
    6: 'D3',
    7: 'CEP',
    8: 'GND',
    9: 'PE̅',
    10: 'CET',
    11: 'Q3',
    12: 'Q2',
    13: 'Q1',
    14: 'Q0',
    15: 'TC',
    16: 'VCC',
  },
  remembers: true,
  step(now, before, memory) {
    let count = memory[0] ?? 0;
    if (now[P161.reset] === false) count = 0;
    else if (rose(P161.clock, now, before)) {
      if (now[P161.load] === false) count = countOf(P161.d.map((pin) => now[pin] === true));
      else if (now[P161.cep] === true && now[P161.cet] === true) count = (count + 1) % 16;
    }
    const outputs: Record<number, boolean> = {};
    bits(count).forEach((high, bit) => (outputs[P161.q[bit]!] = high));
    outputs[P161.tc] = now[P161.cet] === true && count === 15;
    return { outputs, memory: [count] };
  },
};

/**
 * The segments the CD4511 lights for each digit, a to g. As its datasheet
 * draws them, 6 has no top bar (a) and 9 no bottom bar (d). Codes 10 to 15
 * light nothing.
 */
export const CD4511_DIGITS: readonly string[] = [
  'abcdef',
  'bc',
  'abdeg',
  'abcdg',
  'bcfg',
  'acdfg',
  'cdefg',
  'abc',
  'abcdefg',
  'abcfg',
];
const P4511 = {
  inputs: [7, 1, 2, 6], // A, B, C, D: A is the least significant bit
  test: 3,
  blank: 4,
  latch: 5,
  segments: { a: 13, b: 12, c: 11, d: 10, e: 9, f: 15, g: 14 },
} as const;

/**
 * CD4511: BCD to seven-segment latch, decoder and driver. LT̄ LOW lights every
 * segment; otherwise BL̄ LOW lights none. While LE is LOW the outputs follow
 * the inputs; while LE is HIGH they keep the code held when it went HIGH.
 */
const CD4511: ChipModel = {
  pins: 16,
  supply: 16,
  ground: 8,
  supplyRange: [3, 18],
  units: [
    {
      inputs: [...P4511.inputs, P4511.test, P4511.blank, P4511.latch],
      outputs: Object.values(P4511.segments),
    },
  ],
  labels: {
    1: 'B',
    2: 'C',
    3: 'LT̅',
    4: 'BL̅',
    5: 'LE',
    6: 'D',
    7: 'A',
    8: 'VSS',
    9: 'e',
    10: 'd',
    11: 'c',
    12: 'b',
    13: 'a',
    14: 'g',
    15: 'f',
    16: 'VDD',
  },
  remembers: true,
  step(now, _before, memory) {
    // The code held is remembered one higher, so that 0 stays "nothing held yet".
    const held = now[P4511.latch] === true && memory[0] ? memory[0] - 1 : null;
    const code = held ?? countOf(P4511.inputs.map((pin) => now[pin] === true));
    const lit =
      now[P4511.test] === false
        ? 'abcdefg'
        : now[P4511.blank] === false
          ? ''
          : (CD4511_DIGITS[code] ?? '');
    const outputs: Record<number, boolean> = {};
    for (const [segment, pin] of Object.entries(P4511.segments))
      outputs[pin] = lit.includes(segment);
    return { outputs, memory: [code + 1] };
  },
};

export const CHIP_MODELS: Readonly<Record<AnyLogicChip, ChipModel>> = {
  '74HC00': gateChip('74HC00'),
  '74HC02': gateChip('74HC02'),
  '74HC04': gateChip('74HC04'),
  '74HC08': gateChip('74HC08'),
  '74HC32': gateChip('74HC32'),
  '74HC86': gateChip('74HC86'),
  '74HC74': HC74,
  '74HC393': HC393,
  '74HC161': HC161,
  CD4511,
};

/** Every input pin of a chip, once each. */
export function chipInputs(model: ChipModel): number[] {
  return [...new Set(model.units.flatMap((unit) => unit.inputs))];
}

/** Every output pin of a chip, once each. */
export function chipOutputs(model: ChipModel): number[] {
  return [...new Set(model.units.flatMap((unit) => unit.outputs))];
}
