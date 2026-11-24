import {
  addSheetElement,
  connectSheet,
  emptySheet,
  isLogicSheet,
  moveSheetElement,
  removeFromSheet,
  setSheetElement,
  type LogicSheet,
  type SheetEdit,
  type SheetKind,
} from '@banglalab/shared';
import { describe, expect, it } from 'vitest';
import { evaluateSheet, sheetTruthTable, simplestSum, type SheetState } from './sheet';

/** Applies edits that must succeed. */
const ok = (edit: SheetEdit): LogicSheet => {
  if (!edit.ok) throw new Error(edit.error);
  return edit.sheet;
};
/** A sheet with these elements in a row, and these wires. */
function build(kinds: SheetKind[], wires: [string, string][]): LogicSheet {
  let sheet = emptySheet();
  kinds.forEach((kind, i) => (sheet = ok(addSheetElement(sheet, kind, 4 * i, 0))));
  for (const [a, b] of wires) sheet = ok(connectSheet(sheet, a, b));
  return sheet;
}

describe('editing a logic sheet', () => {
  it('names elements by kind, and keeps them apart', () => {
    let sheet = ok(addSheetElement(emptySheet(), 'input', 0, 0));
    sheet = ok(addSheetElement(sheet, 'AND', 5, 0));
    sheet = ok(addSheetElement(sheet, 'output', 10, 0));
    expect(sheet.elements.map((e) => e.id)).toEqual(['IN1', 'G1', 'OUT1']);
    expect(addSheetElement(sheet, 'OR', 6, 1)).toEqual({ ok: false, error: 'taken' });
    expect(moveSheetElement(sheet, 'G1', 1, 1)).toEqual({ ok: false, error: 'taken' });
    expect(isLogicSheet(sheet)).toBe(true);
  });

  it('wires an output to an input, whichever is given first, and only once to an input', () => {
    let sheet = build(['input', 'input', 'AND'], []);
    sheet = ok(connectSheet(sheet, 'G1.a', 'IN1.q'));
    expect(sheet.wires).toEqual([{ id: 'N1', from: 'IN1.q', to: 'G1.a' }]);
    expect(connectSheet(sheet, 'IN2.q', 'G1.a')).toEqual({ ok: false, error: 'input-taken' });
    expect(connectSheet(sheet, 'IN1.q', 'IN2.q')).toEqual({ ok: false, error: 'not-input' });
    // Taking an element away takes its wires too.
    sheet = ok(removeFromSheet(sheet, 'IN1'));
    expect(sheet.wires).toEqual([]);
    expect(isLogicSheet({ ...sheet, wires: [{ id: 'N1', from: 'G1.a', to: 'G1.y' }] })).toBe(false);
  });
});

describe('working out a logic sheet', () => {
  it('every gate follows its truth table', () => {
    const expected: Record<string, boolean[]> = {
      AND: [false, false, false, true],
      OR: [false, true, true, true],
      NAND: [true, true, true, false],
      NOR: [true, false, false, false],
      XOR: [false, true, true, false],
    };
    for (const [gate, outputs] of Object.entries(expected)) {
      const sheet = build(
        ['input', 'input', gate as SheetKind, 'output'],
        [
          ['IN1.q', 'G1.a'],
          ['IN2.q', 'G1.b'],
          ['G1.y', 'OUT1.a'],
        ],
      );
      expect(
        sheetTruthTable(sheet)!.rows.map((row) => row.outputs[0]),
        gate,
      ).toEqual(outputs);
    }
    const not = build(
      ['input', 'NOT', 'output'],
      [
        ['IN1.q', 'G1.a'],
        ['G1.y', 'OUT1.a'],
      ],
    );
    expect(sheetTruthTable(not)!.rows.map((row) => row.outputs[0])).toEqual([true, false]);
  });

  it('reads an input joined to nothing as LOW, and says so', () => {
    const sheet = build(
      ['input', 'OR', 'output'],
      [
        ['IN1.q', 'G1.a'],
        ['G1.y', 'OUT1.a'],
      ],
    );
    const state = evaluateSheet(sheet, 0);
    expect(state.floating).toEqual(['G1.b']);
    expect(state.levels['OUT1.a']).toBe(false);
  });

  it('a NOT gate on its own output never settles', () => {
    expect(evaluateSheet(build(['NOT'], [['G1.y', 'G1.a']]), 0).unsettled).toBe(true);
  });

  it('two NOR gates make a latch that remembers', () => {
    // Set (IN1) and reset (IN2) into a ring of two NOR gates; Q is G2's output.
    let sheet = build(
      ['input', 'input', 'NOR', 'NOR', 'output'],
      [
        ['IN2.q', 'G1.a'],
        ['G2.y', 'G1.b'],
        ['IN1.q', 'G2.a'],
        ['G1.y', 'G2.b'],
        ['G1.y', 'OUT1.a'],
      ],
    );
    const q = (state: SheetState) => state.levels['G1.y'];
    let state = evaluateSheet(ok(setSheetElement(sheet, 'IN1', { on: true })), 0);
    expect(q(state)).toBe(true);
    // Set let go: Q stays.
    state = evaluateSheet(sheet, 0, state);
    expect(q(state)).toBe(true);
    sheet = ok(setSheetElement(sheet, 'IN2', { on: true }));
    state = evaluateSheet(sheet, 0, state);
    expect(q(state)).toBe(false);
  });

  it('a clock and two flip-flops make a ripple counter, 0 to 3', () => {
    // Each flip-flop's Q̄ to its own D; the clock to FF1, FF1's Q̄ to FF2's clock.
    const sheet = build(
      ['clock', 'DFF', 'DFF'],
      [
        ['CLK1.q', 'FF1.clk'],
        ['FF1.nq', 'FF1.d'],
        ['FF1.nq', 'FF2.clk'],
        ['FF2.nq', 'FF2.d'],
      ],
    );
    let state: SheetState | undefined;
    const counts: number[] = [];
    // 1 Hz: LOW for the first half second, HIGH for the second; look every half second.
    for (let t = 0; t <= 4000; t += 250) {
      state = evaluateSheet(sheet, t, state);
      if (t % 1000 === 750) {
        counts.push((state.memory.FF1 ? 1 : 0) + (state.memory.FF2 ? 2 : 0));
      }
    }
    expect(counts).toEqual([1, 2, 3, 0]);
  });

  it('has no truth table while it has flip-flops or a clock', () => {
    expect(sheetTruthTable(build(['input', 'DFF', 'output'], [['IN1.q', 'FF1.d']]))).toBeNull();
  });
});

describe('logic sheet, part 2', () => {
  const outputsOf = (sheet: LogicSheet) => sheetTruthTable(sheet)!.rows.map((row) => row.outputs);

  it('a gate takes three or four inputs, and its spare wires go when it takes fewer', () => {
    let sheet = build(['input', 'input', 'input', 'AND', 'output'], []);
    sheet = ok(setSheetElement(sheet, 'G1', { inputs: 3 }));
    for (const [a, b] of [
      ['IN1.q', 'G1.a'],
      ['IN2.q', 'G1.b'],
      ['IN3.q', 'G1.c'],
      ['G1.y', 'OUT1.a'],
    ] as const)
      sheet = ok(connectSheet(sheet, a, b));
    expect(outputsOf(sheet).map(([y]) => y)).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      true,
    ]);
    sheet = ok(setSheetElement(sheet, 'G1', { inputs: 2 }));
    expect(sheet.wires.some((w) => w.to === 'G1.c')).toBe(false);
  });

  it('a multiplexer passes A, or B when SEL is HIGH; a full adder adds three bits', () => {
    const mux = build(
      ['input', 'input', 'input', 'MUX', 'output'],
      [
        ['IN1.q', 'MX1.a'],
        ['IN2.q', 'MX1.b'],
        ['IN3.q', 'MX1.sel'],
        ['MX1.y', 'OUT1.a'],
      ],
    );
    // Rows are A, B, SEL from the most significant.
    expect(outputsOf(mux).map(([y]) => y)).toEqual([
      false,
      false,
      false,
      true,
      true,
      false,
      true,
      true,
    ]);
    const adder = build(
      ['input', 'input', 'input', 'FA', 'output', 'output'],
      [
        ['IN1.q', 'FA1.a'],
        ['IN2.q', 'FA1.b'],
        ['IN3.q', 'FA1.cin'],
        ['FA1.s', 'OUT1.a'],
        ['FA1.cout', 'OUT2.a'],
      ],
    );
    outputsOf(adder).forEach(([sum, carry], row) => {
      const total = (row & 1) + ((row >> 1) & 1) + ((row >> 2) & 1);
      expect([sum, carry]).toEqual([total % 2 === 1, total >= 2]);
    });
  });

  it('JK and T flip-flops follow their function tables', () => {
    // J and K from switches; the clock from a third switch, turned on and off by hand.
    let sheet = build(
      ['input', 'input', 'input', 'JKFF'],
      [
        ['IN1.q', 'FF1.j'],
        ['IN2.q', 'FF1.clk'],
        ['IN3.q', 'FF1.k'],
      ],
    );
    let state = evaluateSheet(sheet, 0);
    const pulse = (j: boolean, k: boolean) => {
      sheet = ok(setSheetElement(sheet, 'IN1', { on: j }));
      sheet = ok(setSheetElement(sheet, 'IN3', { on: k }));
      state = evaluateSheet(ok(setSheetElement(sheet, 'IN2', { on: true })), 0, state);
      state = evaluateSheet(ok(setSheetElement(sheet, 'IN2', { on: false })), 0, state);
      return state.memory.FF1;
    };
    expect(pulse(true, false)).toBe(true); // set
    expect(pulse(false, false)).toBe(true); // keep
    expect(pulse(true, true)).toBe(false); // turn over
    expect(pulse(true, true)).toBe(true);
    expect(pulse(false, true)).toBe(false); // clear

    let t = build(
      ['input', 'input', 'TFF'],
      [
        ['IN1.q', 'FF1.t'],
        ['IN2.q', 'FF1.clk'],
      ],
    );
    let tState = evaluateSheet(t, 0);
    const tick = () => {
      tState = evaluateSheet(ok(setSheetElement(t, 'IN2', { on: true })), 0, tState);
      tState = evaluateSheet(ok(setSheetElement(t, 'IN2', { on: false })), 0, tState);
      return tState.memory.FF1;
    };
    expect(tick()).toBe(false); // T LOW: keeps
    t = ok(setSheetElement(t, 'IN1', { on: true }));
    expect(tick()).toBe(true);
    expect(tick()).toBe(false);
  });

  it('a sheet whose hex digit is wired can be kept and opened again', () => {
    // Its ports are d0 to d3: a port name may end in a number.
    const sheet = build(['input', 'HEX'], [['IN1.q', 'HEX1.d0']]);
    expect(isLogicSheet(sheet)).toBe(true);
    expect(isLogicSheet(JSON.parse(JSON.stringify(sheet)))).toBe(true);
  });

  it('finds the simplest sum of products', () => {
    const table = (f: (a: boolean, b: boolean, c: boolean) => boolean) =>
      Array.from({ length: 8 }, (_, row) => f((row & 4) > 0, (row & 2) > 0, (row & 1) > 0));
    expect(simplestSum(2, [false, false, false, true])).toBe('A·B');
    expect(simplestSum(2, [false, true, true, true])).toMatch(/^(A \+ B|B \+ A)$/);
    expect(simplestSum(2, [false, true, true, false])).toMatch(/A̅·B|A·B̅/);
    expect(simplestSum(2, [false, false, false, false])).toBe('0');
    expect(simplestSum(2, [true, true, true, true])).toBe('1');
    // The full adder's carry: the majority of three.
    const carry = simplestSum(
      3,
      table((a, b, c) => (a && b) || (a && c) || (b && c)),
    );
    expect(carry.split(' + ').sort()).toEqual(['A·B', 'A·C', 'B·C']);
    // A·B + A·B̄ is just A.
    expect(
      simplestSum(
        3,
        table((a) => a),
      ),
    ).toBe('A');
  });
});
