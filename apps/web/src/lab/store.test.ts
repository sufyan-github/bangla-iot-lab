import { emptyCircuit, ledCircuitExample, unoCircuitExample } from '@banglalab/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { useLab } from './store';

const lab = () => useLab.getState();
const project = (circuit = emptyCircuit()) => ({ id: 'p1', name: 'test', circuit, programs: {} });
beforeEach(() => lab().open(project()));

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
    lab().open(project(ledCircuitExample()));
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
    lab().open(project(ledCircuitExample()));
    lab().select('LED1');
    lab().flipSelected();
    expect(lab().circuit.components[2]).toMatchObject({ pins: { anode: 'd10', cathode: 'd9' } });
    lab().setProps('LED1', { color: 'blue' });
    expect(lab().circuit.components[2]).toMatchObject({ props: { color: 'blue' } });
    lab().removeSelected();
    expect(lab().circuit.components.map((c) => c.id)).toEqual(['BAT1', 'R1']);
    expect(lab().selectedId).toBeNull();
  });

  it('gives a new board the Blink program, ready to run, and removes it with the board', () => {
    lab().addUno();
    expect(lab().selectedId).toBe('UNO1');
    const program = lab().programs.UNO1!;
    expect(program.source).toContain('digitalWrite');
    expect(program.hex).toMatch(/^:/);
    expect(program.hexSource).toBe(program.source);
    lab().addUno();
    expect(lab().notice).toBe('board-limit');
    lab().select('UNO1');
    lab().removeSelected();
    expect(lab().programs).toEqual({});
  });

  it('places buttons and potentiometers with their tools', () => {
    lab().setTool('button');
    lab().tapEndpoint('c14');
    lab().setTool('potentiometer');
    lab().tapEndpoint('c20');
    expect(lab().circuit.components.map((c) => c.id)).toEqual(['SW1', 'POT1']);
  });

  it('tracks held buttons, collects serial text and forgets both when stopped', () => {
    lab().open(project(unoCircuitExample()));
    lab().setRunning(true);
    lab().setPressed('SW1', true);
    lab().setPressed('SW1', true);
    expect(lab().pressed).toEqual(['SW1']);
    const frame = (serial: string) => ({
      timeMs: 1,
      result: {
        ok: true,
        readings: {},
        wireCurrents: {},
        sockets: {},
        diagnostics: [],
        iterations: 1,
      },
      boards: { UNO1: { programmed: true, timeMs: 1, drives: [], highFraction: [], serial } },
    });
    lab().receiveFrame(frame('12\n'));
    lab().receiveFrame(frame('34\n'));
    expect(lab().serial.UNO1).toBe('12\n34\n');
    expect(lab().result).not.toBeNull();
    lab().setPressed('SW1', false);
    expect(lab().pressed).toEqual([]);

    lab().setRunning(false);
    expect(lab()).toMatchObject({ result: null, boards: {}, serial: {}, pressed: [] });
    lab().receiveFrame(frame('late\n')); // arrives after stopping: ignored
    expect(lab().result).toBeNull();
  });
});
