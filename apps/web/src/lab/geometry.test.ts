import {
  addBattery,
  ledCircuitExample,
  unoCircuitExample,
  type CircuitDocument,
  type EditResult,
} from '@banglalab/shared';
import { describe, expect, it } from 'vitest';
import { describeEndpoint, joinedHoles } from './endpoints';
import {
  BREADBOARD_BOX,
  UNO_BOX,
  canvasHeight,
  endpointNear,
  endpointPoint,
  fitsAt,
  moveOffBoardTo,
  offBoardParts,
  partBox,
  settleOffBoardPart,
} from './geometry';

function ok(result: EditResult): CircuitDocument {
  if (!result.ok) throw new Error(`edit refused: ${result.error}`);
  return result.circuit;
}
const partOf = (circuit: CircuitDocument, id: string) =>
  offBoardParts(circuit).find((c) => c.id === id)!;

describe('moving batteries and the board', () => {
  it('draws them in their usual places until they are moved', () => {
    const circuit = unoCircuitExample();
    expect(partBox(circuit, partOf(circuit, 'UNO1'))).toEqual(UNO_BOX);
    expect(fitsAt(circuit, partOf(circuit, 'UNO1'), UNO_BOX)).toBe(true);
  });

  // Positions are stored in hole pitches to three decimals, so they land within a fraction of a pixel.
  it('moves the board, and its sockets and wires go with it', () => {
    const circuit = unoCircuitExample();
    const before = endpointPoint(circuit, 'UNO1.d13')!;
    const moved = ok(moveOffBoardTo(circuit, 'UNO1', { x: UNO_BOX.x - 60, y: UNO_BOX.y + 48 }));
    const after = endpointPoint(moved, 'UNO1.d13')!;
    expect(after.x - before.x).toBeCloseTo(-60, 1);
    expect(after.y - before.y).toBeCloseTo(48, 1);
    // The socket is found where it is now drawn, not where it used to be.
    expect(endpointNear(moved, after)).toBe('UNO1.d13');
    expect(endpointNear(moved, before)).not.toBe('UNO1.d13');
    expect(canvasHeight(moved)).toBeCloseTo(canvasHeight(circuit) + 48, 1);
  });

  it('refuses a place on the breadboard, on another part or off the work surface', () => {
    const circuit = ok(addBattery(unoCircuitExample()));
    const onBoard = { x: BREADBOARD_BOX.x + 40, y: BREADBOARD_BOX.y + 40 };
    expect(moveOffBoardTo(circuit, 'BAT1', onBoard)).toEqual({ ok: false, error: 'no-room' });
    expect(moveOffBoardTo(circuit, 'BAT1', { x: UNO_BOX.x + 20, y: UNO_BOX.y + 10 }).ok).toBe(
      false,
    );
    expect(moveOffBoardTo(circuit, 'BAT1', { x: -500, y: 60 }).ok).toBe(false);
    expect(moveOffBoardTo(circuit, 'BAT1', { x: 30, y: 300 }).ok).toBe(true);
    expect(moveOffBoardTo(circuit, 'R1', { x: 30, y: 300 })).toEqual({
      ok: false,
      error: 'unknown-item',
    });
  });

  it('finds room for a new battery when its usual place is taken', () => {
    const first = ok(addBattery(ledCircuitExample())); // BAT2, stacked under BAT1
    const usual = partBox(first, partOf(first, 'BAT2'));
    // Park BAT1 where a second battery would normally go, then add one.
    const parked = ok(moveOffBoardTo(ledCircuitExample(), 'BAT1', { x: usual.x, y: usual.y }));
    const added = ok(addBattery(parked));
    expect(fitsAt(added, partOf(added, 'BAT2'), partBox(added, partOf(added, 'BAT2')))).toBe(false);
    const settled = settleOffBoardPart(added, 'BAT2');
    expect(
      fitsAt(settled, partOf(settled, 'BAT2'), partBox(settled, partOf(settled, 'BAT2'))),
    ).toBe(true);
    expect(settleOffBoardPart(settled, 'BAT2')).toBe(settled);
  });
});

describe('what the pointer is over', () => {
  const circuit = ledCircuitExample();

  it('names holes, rails, legs and terminals', () => {
    expect(describeEndpoint(circuit, 'h20')).toEqual({ name: 'h20', used: false });
    expect(describeEndpoint(circuit, 'd9')).toEqual({ name: 'd9', lead: 'LED1 +', used: true });
    expect(describeEndpoint(circuit, 'd10')).toMatchObject({ lead: 'LED1 −' });
    expect(describeEndpoint(circuit, 'c5')).toMatchObject({ lead: 'R1' });
    expect(describeEndpoint(circuit, 'tp1')).toEqual({ name: '+', used: true });
    expect(describeEndpoint(circuit, 'bn3')).toEqual({ name: '−', used: false });
    expect(describeEndpoint(circuit, 'BAT1.pos')).toEqual({ name: '+', lead: 'BAT1', used: true });
    expect(describeEndpoint(circuit, 'NOPE.pos')).toBeNull();
  });

  it('names board sockets as they are used in programs', () => {
    const board = unoCircuitExample();
    expect(describeEndpoint(board, 'UNO1.d13')).toMatchObject({ name: 'D13', used: true });
    expect(describeEndpoint(board, 'UNO1.d9')).toMatchObject({ name: 'D9 PWM', used: false });
    expect(describeEndpoint(board, 'UNO1.a0')).toMatchObject({ name: 'A0' });
    expect(describeEndpoint(board, 'UNO1.gnd2')).toMatchObject({ name: 'GND' });
    expect(describeEndpoint(board, 'UNO1.5v')).toMatchObject({ name: '5V' });
  });

  it('knows which holes are joined inside the board', () => {
    expect(joinedHoles('h20')).toEqual(['f20', 'g20', 'h20', 'i20', 'j20']);
    expect(joinedHoles('tp1')).toHaveLength(25);
    expect(joinedHoles('BAT1.pos')).toEqual([]);
  });
});
