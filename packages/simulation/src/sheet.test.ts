import {
  addSheetElement,
  connectSheet,
  copyFromSheet,
  emptySheet,
  isLogicSheet,
  moveSheetElement,
  moveSheetElements,
  pasteIntoSheet,
  removeFromSheet,
  removeManyFromSheet,
  setSheetElement,
  sheetName,
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

  it('an element can be given a name, which can be taken away again', () => {
    let sheet = build(['input'], []);
    sheet = ok(setSheetElement(sheet, 'IN1', { label: '  Carry   in ' }));
    expect(sheet.elements[0]!.label).toBe('Carry in');
    expect(sheetName(sheet.elements[0]!)).toBe('Carry in');
    expect(isLogicSheet(sheet)).toBe(true);
    // Long names are cut to twelve characters.
    sheet = ok(setSheetElement(sheet, 'IN1', { label: 'a very long name indeed' }));
    expect(sheet.elements[0]!.label).toBe('a very long');
    sheet = ok(setSheetElement(sheet, 'IN1', { label: ' ' }));
    expect(sheet.elements[0]!.label).toBeUndefined();
    expect(sheetName(sheet.elements[0]!)).toBe('IN1');
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

describe('logic sheet, part 3: several at once', () => {
  // A half adder: A and B into an XOR (sum) and an AND (carry).
  const halfAdder = () =>
    build(
      ['input', 'input', 'XOR', 'AND', 'output', 'output'],
      [
        ['IN1.q', 'G1.a'],
        ['IN2.q', 'G1.b'],
        ['IN1.q', 'G2.a'],
        ['IN2.q', 'G2.b'],
        ['G1.y', 'OUT1.a'],
        ['G2.y', 'OUT2.a'],
      ],
    );

  it('copies elements with the wires between them, and pastes them with new ids', () => {
    const sheet = halfAdder();
    const clip = copyFromSheet(sheet, ['G1', 'G2', 'OUT1']);
    // Wires from the switches are left behind; the one from G1 to OUT1 comes.
    expect(clip.wires.map((w) => `${w.from}>${w.to}`)).toEqual(['G1.y>OUT1.a']);
    const pasted = pasteIntoSheet(sheet, clip, 0, 4);
    if (!pasted.ok) throw new Error(pasted.error);
    expect(pasted.ids).toEqual(['G3', 'G4', 'OUT3']);
    expect(pasted.sheet.wires.at(-1)).toMatchObject({ from: 'G3.y', to: 'OUT3.a' });
    expect(pasted.sheet.elements.find((e) => e.id === 'G3')).toMatchObject({ kind: 'XOR', y: 4 });
    expect(isLogicSheet(pasted.sheet)).toBe(true);
  });

  it('pastes further along when the place is taken, and refuses when nothing fits', () => {
    const sheet = halfAdder();
    // Straight on top of the originals is taken, so it goes one step further each time.
    const pasted = ok(pasteIntoSheet(sheet, copyFromSheet(sheet, ['IN1']), 0, 0));
    const copy = pasted.elements.at(-1)!;
    expect(copy.id).toBe('IN3');
    expect(copy.x).toBeGreaterThan(0);
    const all = copyFromSheet(
      sheet,
      sheet.elements.map((e) => e.id),
    );
    expect(pasteIntoSheet(sheet, all, 40, 0)).toEqual({ ok: false, error: 'taken' });
  });

  it('takes several away with their wires, and moves several together', () => {
    const sheet = halfAdder();
    const fewer = ok(removeManyFromSheet(sheet, ['G1', 'OUT1']));
    expect(fewer.elements.map((e) => e.id)).toEqual(['IN1', 'IN2', 'G2', 'OUT2']);
    expect(fewer.wires).toHaveLength(3);
    const moved = ok(moveSheetElements(sheet, ['IN1', 'IN2'], 0, 5));
    expect(moved.elements.filter((e) => e.kind === 'input').map((e) => e.y)).toEqual([5, 5]);
    // Not onto another element, and not off the sheet.
    expect(moveSheetElements(sheet, ['IN1'], 4, 0)).toEqual({ ok: false, error: 'taken' });
    expect(moveSheetElements(sheet, ['IN1'], -1, 0)).toEqual({ ok: false, error: 'taken' });
  });
});

describe('logic sheet, part 3: blocks that decode, count and store', () => {
  /** Turns switches on or off by id, then works the sheet out from the state before. */
  const step = (sheet: LogicSheet, before: SheetState | undefined, on: Record<string, boolean>) => {
    let next = sheet;
    for (const [id, value] of Object.entries(on))
      next = ok(setSheetElement(next, id, { on: value }));
    return { sheet: next, state: evaluateSheet(next, 0, before) };
  };
  /** A rising clock edge from switch `clk`: LOW, then HIGH. */
  const pulse = (
    sheet: LogicSheet,
    state: SheetState,
    clk: string,
    on: Record<string, boolean> = {},
  ) => {
    const low = step(sheet, state, { ...on, [clk]: false });
    return step(low.sheet, low.state, { [clk]: true });
  };
  const word = (state: SheetState, id: string) =>
    [0, 1, 2, 3].reduce((sum, bit) => sum + (state.levels[`${id}.q${bit}`] ? 1 << bit : 0), 0);

  it('a decoder lights the one output its address names, and has a truth table', () => {
    const sheet = build(
      ['input', 'input', 'DEC', 'output', 'output', 'output', 'output'],
      [
        ['IN1.q', 'DEC1.a0'],
        ['IN2.q', 'DEC1.a1'],
        ['DEC1.y0', 'OUT1.a'],
        ['DEC1.y1', 'OUT2.a'],
        ['DEC1.y2', 'OUT3.a'],
        ['DEC1.y3', 'OUT4.a'],
      ],
    );
    expect(isLogicSheet(sheet)).toBe(true);
    const table = sheetTruthTable(sheet)!;
    // Rows in the order IN1 IN2 = 00, 01, 10, 11; IN1 is A0, IN2 is A1.
    expect(table.rows.map((row) => row.outputs.map(Number).join(''))).toEqual([
      '1000',
      '0010',
      '0100',
      '0001',
    ]);
  });

  it('a counter counts rising edges, wraps after 15 with CO high at 15, and clears', () => {
    const sheet = build(
      ['input', 'input', 'CNT'],
      [
        ['IN1.q', 'CNT1.clk'],
        ['IN2.q', 'CNT1.clr'],
      ],
    );
    let { sheet: s, state } = step(sheet, undefined, {});
    for (let n = 1; n <= 15; n++) ({ sheet: s, state } = pulse(s, state, 'IN1'));
    expect(word(state, 'CNT1')).toBe(15);
    expect(state.levels['CNT1.co']).toBe(true);
    ({ sheet: s, state } = pulse(s, state, 'IN1'));
    expect(word(state, 'CNT1')).toBe(0);
    expect(state.levels['CNT1.co']).toBe(false);
    ({ sheet: s, state } = pulse(s, state, 'IN1'));
    ({ sheet: s, state } = pulse(s, state, 'IN1'));
    expect(word(state, 'CNT1')).toBe(2);
    // CLR is taken at the edge, not before.
    ({ sheet: s, state } = step(s, state, { IN2: true }));
    expect(word(state, 'CNT1')).toBe(2);
    ({ sheet: s, state } = pulse(s, state, 'IN1'));
    expect(word(state, 'CNT1')).toBe(0);
    // A sheet with a counter has no truth table: what it shows depends on before.
    expect(sheetTruthTable(s)).toBeNull();
  });

  it('a register takes its inputs on the edge and holds them after', () => {
    const sheet = build(
      ['input', 'input', 'input', 'REG'],
      [
        ['IN1.q', 'REG1.d0'],
        ['IN2.q', 'REG1.d2'],
        ['IN3.q', 'REG1.clk'],
      ],
    );
    let { sheet: s, state } = step(sheet, undefined, { IN1: true, IN2: true });
    expect(word(state, 'REG1')).toBe(0);
    ({ sheet: s, state } = pulse(s, state, 'IN3'));
    expect(word(state, 'REG1')).toBe(5);
    ({ sheet: s, state } = step(s, state, { IN1: false, IN2: false }));
    expect(word(state, 'REG1')).toBe(5);
  });

  it('a RAM shows the word at its address, and writes only with WE high on an edge', () => {
    // A0 from IN1, D1 from IN2, WE from IN3, the clock from IN4; the rest LOW.
    const sheet = build(
      ['input', 'input', 'input', 'input', 'RAM'],
      [
        ['IN1.q', 'RAM1.a0'],
        ['IN2.q', 'RAM1.d1'],
        ['IN3.q', 'RAM1.we'],
        ['IN4.q', 'RAM1.clk'],
      ],
    );
    let { sheet: s, state } = step(sheet, undefined, { IN2: true });
    // WE LOW: the edge writes nothing.
    ({ sheet: s, state } = pulse(s, state, 'IN4'));
    expect(state.store.RAM1).toEqual(new Array(16).fill(0));
    // WE HIGH at address 1: 2 is written there.
    ({ sheet: s, state } = pulse(s, state, 'IN4', { IN1: true, IN3: true }));
    expect(state.store.RAM1![1]).toBe(2);
    expect(word(state, 'RAM1')).toBe(2);
    // Address 0 still holds 0; back at 1 the word is still there.
    ({ sheet: s, state } = step(s, state, { IN1: false, IN3: false }));
    expect(word(state, 'RAM1')).toBe(0);
    ({ sheet: s, state } = step(s, state, { IN1: true }));
    expect(word(state, 'RAM1')).toBe(2);
  });

  it('blocks take more room than gates, and nothing may sit on them', () => {
    let sheet = ok(addSheetElement(emptySheet(), 'RAM', 0, 0));
    expect(sheet.elements[0]).toMatchObject({ id: 'RAM1', x: 0, y: 0 });
    // The RAM is 4 wide and 9 high: a gate at (2, 6) would sit on it, one at (4, 6) does not.
    expect(addSheetElement(sheet, 'AND', 2, 6)).toEqual({ ok: false, error: 'taken' });
    sheet = ok(addSheetElement(sheet, 'AND', 4, 6));
    // Near the bottom edge it is moved up to fit.
    const low = ok(addSheetElement(emptySheet(), 'RAM', 10, 23));
    expect(low.elements[0]!.y).toBe(15);
  });
});
