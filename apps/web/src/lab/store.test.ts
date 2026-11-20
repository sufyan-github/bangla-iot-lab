import { ledCircuitExample, emptyCircuit } from '@banglalab/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { useLab } from './store';

const lab = () => useLab.getState();
beforeEach(() => lab().open({ id: 'p1', name: 'test', circuit: emptyCircuit() }));

describe('lab editor state', () => {
  it('builds the LED circuit from taps, as a student would', () => {
    lab().addBattery();
    lab().setTool('resistor');
    lab().tapEndpoint('c5');
    expect(lab().tool).toBe('select'); // back to selecting, with the new part selected
    expect(lab().selectedId).toBe('R1');
    lab().setTool('led');
    lab().tapEndpoint('d9');
    lab().setTool('wire');
    for (const [from, to] of [
      ['BAT1.pos', 'tp1'],
      ['BAT1.neg', 'tn1'],
      ['tp4', 'a5'],
      ['a10', 'tn8'],
    ] as const) {
      lab().tapEndpoint(from);
      expect(lab().wireStart).toBe(from);
      lab().tapEndpoint(to);
      expect(lab().wireStart).toBeNull();
    }
    expect(lab().tool).toBe('wire'); // stays in wire mode for the next wire
    expect(lab().circuit).toEqual(ledCircuitExample());
  });

  it('explains a refused edit and keeps the circuit unchanged', () => {
    lab().open({ id: 'p1', name: 'test', circuit: ledCircuitExample() });
    lab().setTool('led');
    lab().tapEndpoint('c5');
    expect(lab().notice).toBe('hole-occupied');
    expect(lab().circuit).toEqual(ledCircuitExample());

    lab().setTool('wire');
    expect(lab().notice).toBeNull();
    lab().tapEndpoint('c9'); // occupied by R1: refused before a wire is started
    expect(lab()).toMatchObject({ notice: 'hole-occupied', wireStart: null });
    lab().tapEndpoint('b1');
    lab().tapEndpoint('b1'); // tapping the start again cancels the wire
    expect(lab().wireStart).toBeNull();
    expect(lab().circuit.wires).toHaveLength(4);
  });

  it('edits and removes the selected part', () => {
    lab().open({ id: 'p1', name: 'test', circuit: ledCircuitExample() });
    lab().select('LED1');
    lab().flipSelected();
    expect(lab().circuit.components[2]).toMatchObject({ pins: { anode: 'd10', cathode: 'd9' } });
    lab().setProps('LED1', { color: 'blue' });
    expect(lab().circuit.components[2]).toMatchObject({ props: { color: 'blue' } });
    lab().removeSelected();
    expect(lab().circuit.components.map((c) => c.id)).toEqual(['BAT1', 'R1']);
    expect(lab().selectedId).toBeNull();
  });

  it('clears results when the circuit is stopped', () => {
    lab().setRunning(true);
    lab().setResult({ ok: true, readings: {}, wireCurrents: {}, diagnostics: [], iterations: 1 });
    lab().setRunning(false);
    expect(lab().result).toBeNull();
  });
});
