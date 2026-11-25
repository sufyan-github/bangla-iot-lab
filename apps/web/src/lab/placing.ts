import {
  addBattery,
  addBreadboard,
  addEsp32,
  addMotorDriver,
  addUno,
  type BreadboardSize,
  type CircuitDocument,
  type EditResult,
} from '@banglalab/shared';
import {
  freeBreadboardPlace,
  moveOffBoardTo,
  offBoardParts,
  partBox,
  placeBesideOtherBoard,
  settleOffBoardPart,
  type Box,
  type Point,
} from './geometry';

/**
 * A part that stands beside the breadboards, picked from the parts list and
 * not yet put down (D-108): a breadboard of a chosen size, a battery, a bench
 * supply, a function generator, a board or the motor driver. While one is in
 * hand, its picture follows the pointer, and a tap on the mat puts it there.
 */
export type Placing =
  | { type: 'breadboard'; size: BreadboardSize }
  | { type: 'battery' | 'supply' | 'generator' | 'uno' | 'esp32' | 'l298n' };

export const samePlacing = (a: Placing | null, b: Placing | null): boolean =>
  a !== null &&
  b !== null &&
  a.type === b.type &&
  (a.type !== 'breadboard' || b.type !== 'breadboard' || a.size === b.size);

/** The circuit with the part added in its usual place, where there is room for it. */
export function withPart(circuit: CircuitDocument, placing: Placing): EditResult {
  switch (placing.type) {
    case 'breadboard': {
      const place = freeBreadboardPlace(circuit, placing.size);
      return place ? addBreadboard(circuit, placing.size, place) : { ok: false, error: 'no-room' };
    }
    case 'battery':
    case 'supply':
    case 'generator': {
      const added = addBattery(circuit, 9, placing.type === 'battery' ? undefined : placing.type);
      // Its usual place may be taken by something the student moved there.
      return added.ok ? { ...added, circuit: settleOffBoardPart(added.circuit, added.id) } : added;
    }
    case 'l298n': {
      const added = addMotorDriver(circuit);
      return added.ok ? { ...added, circuit: settleOffBoardPart(added.circuit, added.id) } : added;
    }
    case 'uno':
    case 'esp32': {
      const added = placing.type === 'uno' ? addUno(circuit) : addEsp32(circuit);
      return added.ok
        ? { ...added, circuit: placeBesideOtherBoard(added.circuit, added.id) }
        : added;
    }
  }
}

/** Where a part added by `withPart` lies. */
export function boxOfAdded(added: Extract<EditResult, { ok: true }>): Box {
  const part = offBoardParts(added.circuit).find((c) => c.id === added.id)!;
  return partBox(added.circuit, part);
}

/**
 * The circuit with the part added with its middle at `point`. Refused, with
 * the circuit left as it was, when it has no room there.
 */
export function withPartAt(circuit: CircuitDocument, placing: Placing, point: Point): EditResult {
  const added = withPart(circuit, placing);
  if (!added.ok) return added;
  const box = boxOfAdded(added);
  const moved = moveOffBoardTo(added.circuit, added.id, {
    x: point.x - box.width / 2,
    y: point.y - box.height / 2,
  });
  return moved.ok ? { ...moved, id: added.id } : moved;
}
