import { isProgrammable, withoutBreadboards, type CircuitDocument } from '@banglalab/shared';
import { analyse, type DiagramLayout } from './nets';
import { layoutRails } from './rails';
import { layoutTree } from './tree';

export * from './nets';

/**
 * Turns a breadboard circuit into a schematic diagram: where each symbol goes
 * and the right-angle wires between them.
 *
 * A circuit built round a board is drawn the way such circuits are drawn by
 * hand: the board on the left and each of its pins leading off to the right
 * through the parts wired to it. A circuit without a board is a loop between
 * a battery's two rails.
 */
export function layoutDiagram(drawn: CircuitDocument): DiagramLayout {
  // The diagram shows what is joined, not where: breadboards are not drawn in it.
  const circuit = withoutBreadboards(drawn);
  const analysis = analyse(circuit);
  const board = circuit.components.find(isProgrammable);
  return board ? layoutTree(circuit, board, analysis) : layoutRails(circuit, analysis);
}
