import { emptyCircuit, ledCircuitExample } from '@banglalab/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { BOARD_X, BOARD_Y, offBoardParts, partBox } from './geometry';
import { boxOfAdded, samePlacing, withPart, withPartAt } from './placing';
import { useLab } from './store';

const lab = () => useLab.getState();
beforeEach(() => lab().open({ id: 'p1', name: 'test', circuit: emptyCircuit(), programs: {} }));

describe('a part in hand (D-108)', () => {
  it('goes to its usual place, or with its middle where it is put down', () => {
    const circuit = ledCircuitExample();
    const usual = withPart(circuit, { type: 'battery' });
    expect(usual.ok && usual.id).toBe('BAT2');

    // On the bare mat, well to the right of the breadboard and below it.
    const point = { x: 1300, y: 700 };
    const there = withPartAt(circuit, { type: 'battery' }, point);
    if (!there.ok) throw new Error(there.error);
    const box = boxOfAdded(there);
    expect(box.x + box.width / 2).toBeCloseTo(point.x, 0);
    expect(box.y + box.height / 2).toBeCloseTo(point.y, 0);
    // The circuit it was added to is not touched.
    expect(circuit.components.some((c) => c.id === 'BAT2')).toBe(false);
  });

  it('is refused where it has no room, and the circuit stays as it was', () => {
    const circuit = ledCircuitExample();
    const onBoard = withPartAt(
      circuit,
      { type: 'battery' },
      { x: BOARD_X + 200, y: BOARD_Y + 200 },
    );
    expect(onBoard).toEqual({ ok: false, error: 'no-room' });
  });

  it('a breadboard comes in the size that was asked for', () => {
    for (const size of ['mini', 'half', 'full'] as const) {
      const added = withPart(emptyCircuit(), { type: 'breadboard', size });
      if (!added.ok) throw new Error(added.error);
      const board = added.circuit.components.find((c) => c.id === added.id)!;
      expect(board).toMatchObject({ type: 'breadboard', props: { size } });
    }
    // Put down by hand, it lands on the grid of holes that all breadboards share.
    const there = withPartAt(
      emptyCircuit(),
      { type: 'breadboard', size: 'mini' },
      { x: 900, y: 900 },
    );
    if (!there.ok) throw new Error(there.error);
    const box = boxOfAdded(there);
    expect((box.x - BOARD_X) % 24).toBe(0);
    expect((box.y - BOARD_Y) % 24).toBe(0);
  });

  it('two picks are the same only for the same part, and for a breadboard the same size', () => {
    expect(samePlacing({ type: 'uno' }, { type: 'uno' })).toBe(true);
    expect(samePlacing({ type: 'uno' }, { type: 'esp32' })).toBe(false);
    expect(
      samePlacing({ type: 'breadboard', size: 'mini' }, { type: 'breadboard', size: 'full' }),
    ).toBe(false);
    expect(samePlacing(null, { type: 'uno' })).toBe(false);
  });
});

describe('picking a part up and putting it down, in the lab', () => {
  it('a first pick takes it in hand; a tap on the mat puts it there', () => {
    lab().pickUp({ type: 'battery' });
    expect(lab().placing).toEqual({ type: 'battery' });
    expect(offBoardParts(lab().circuit).some((c) => c.type === 'battery')).toBe(false);

    expect(lab().placeAt({ x: 1300, y: 700 })).toBe(true);
    expect(lab().placing).toBeNull();
    expect(lab().selectedId).toBe('BAT1');
    const battery = offBoardParts(lab().circuit).find((c) => c.id === 'BAT1')!;
    const box = partBox(lab().circuit, battery);
    expect(box.x + box.width / 2).toBeCloseTo(1300, 0);
    // One step back takes it away again.
    lab().undo();
    expect(lab().circuit.components.some((c) => c.id === 'BAT1')).toBe(false);
  });

  it('picked again while in hand, it goes to its usual place', () => {
    lab().pickUp({ type: 'esp32' });
    lab().pickUp({ type: 'esp32' });
    expect(lab().placing).toBeNull();
    expect(lab().circuit.components.some((c) => c.id === 'ESP1')).toBe(true);
  });

  it('with no room where it is put, it stays in hand and the lab says so', () => {
    lab().pickUp({ type: 'battery' });
    expect(lab().placeAt({ x: BOARD_X + 200, y: BOARD_Y + 200 })).toBe(false);
    expect(lab().placing).toEqual({ type: 'battery' });
    expect(lab().notice).toBe('no-room');
    expect(lab().circuit.components.some((c) => c.type === 'battery')).toBe(false);
  });

  it('choosing a tool, or Esc, puts it back', () => {
    lab().pickUp({ type: 'uno' });
    lab().setTool('wire');
    expect(lab().placing).toBeNull();
    lab().pickUp({ type: 'uno' });
    lab().cancelPlacing();
    expect(lab().placing).toBeNull();
    expect(lab().circuit.components.some((c) => c.type === 'uno')).toBe(false);
  });
});
