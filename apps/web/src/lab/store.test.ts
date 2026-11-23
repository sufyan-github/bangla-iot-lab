import { emptyCircuit, ledCircuitExample, movePart, unoCircuitExample } from '@banglalab/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { simulate } from '@banglalab/simulation';
import { meterReading } from './meter';
import { useLab } from './store';

const lab = () => useLab.getState();
const project = (circuit = emptyCircuit()) => ({ id: 'p1', name: 'test', circuit, programs: {} });
beforeEach(() => lab().open(project()));

describe('lab editor state', () => {
  it('builds the LED circuit from taps, as a student would', () => {
    lab().addBattery();
    lab().setTool('resistor');
    lab().tapEndpoint('BB1.c5');
    expect(lab().tool).toBe('select'); // back to selecting, with the new part selected
    expect(lab().selectedId).toBe('R1');
    lab().setTool('led');
    lab().tapEndpoint('BB1.d9');
    lab().setTool('wire');
    for (const [from, to] of [
      ['BAT1.pos', 'BB1.tp1'],
      ['BAT1.neg', 'BB1.tn1'],
      ['BB1.tp4', 'BB1.a5'],
      ['BB1.a10', 'BB1.tn8'],
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
    lab().tapEndpoint('BB1.c5');
    expect(lab().notice).toBe('hole-occupied');
    expect(lab().circuit).toEqual(ledCircuitExample());

    lab().setTool('wire');
    expect(lab().notice).toBeNull();
    lab().tapEndpoint('BB1.c9'); // occupied by R1: refused before a wire is started
    expect(lab()).toMatchObject({ notice: 'hole-occupied', wireStart: null });
    lab().tapEndpoint('BB1.b1');
    lab().tapEndpoint('BB1.b1'); // tapping the start again cancels the wire
    expect(lab().wireStart).toBeNull();
    expect(lab().circuit.wires).toHaveLength(4);
  });

  it('edits and removes the selected part', () => {
    lab().open(project(ledCircuitExample()));
    lab().select('LED1');
    lab().flipSelected();
    expect(lab().circuit.components[3]).toMatchObject({
      pins: { anode: 'BB1.d10', cathode: 'BB1.d9' },
    });
    lab().setProps('LED1', { color: 'blue' });
    expect(lab().circuit.components[3]).toMatchObject({ props: { color: 'blue' } });
    lab().removeSelected();
    expect(lab().circuit.components.map((c) => c.id)).toEqual(['BB1', 'BAT1', 'R1']);
    expect(lab().selectedId).toBeNull();
  });

  it('gives a new board the Blink program, ready to run, and removes it with the board', async () => {
    lab().addUno();
    expect(lab().selectedId).toBe('UNO1');
    // The ready-made program is loaded, then put on the board.
    await vi.waitFor(() => expect(lab().programs.UNO1).toBeDefined());
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
    lab().tapEndpoint('BB1.c14');
    lab().setTool('potentiometer');
    lab().tapEndpoint('BB1.c20');
    expect(lab().circuit.components.map((c) => c.id)).toEqual(['BB1', 'SW1', 'POT1']);
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
        nodeVoltages: {},
        legCurrents: {},
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

describe('undo and redo', () => {
  it('steps back through edits and forward again', () => {
    lab().open(project(ledCircuitExample()));
    expect(lab().past).toHaveLength(0);
    lab().setTool('led');
    lab().tapEndpoint('BB1.h3');
    lab().setTool('wire');
    lab().tapEndpoint('BB1.g1');
    lab().tapEndpoint('BB1.g2');
    const built = lab().circuit;
    expect(built.components).toHaveLength(5);
    expect(built.wires).toHaveLength(5);

    lab().undo();
    expect(lab().circuit.wires).toHaveLength(4);
    lab().undo();
    expect(lab().circuit).toEqual(ledCircuitExample());
    lab().undo(); // nothing further back
    expect(lab().circuit).toEqual(ledCircuitExample());

    lab().redo();
    lab().redo();
    expect(lab().circuit).toBe(built);
    lab().redo(); // nothing further forward
    expect(lab().circuit).toBe(built);
  });

  it('forgets what was undone once a new edit is made', () => {
    lab().open(project(ledCircuitExample()));
    lab().select('R1');
    lab().removeSelected();
    lab().undo();
    expect(lab().future).toHaveLength(1);
    lab().select('LED1');
    lab().flipSelected();
    expect(lab().future).toHaveLength(0);
    lab().redo();
    expect(lab().circuit.components.map((c) => c.id)).toContain('R1');
  });

  it('does not record refused edits or selection', () => {
    lab().open(project(ledCircuitExample()));
    lab().setTool('led');
    lab().tapEndpoint('BB1.c5'); // taken
    lab().setTool('select');
    lab().select('R1');
    expect(lab().past).toHaveLength(0);
  });

  it('treats a whole drag as one step, and a drag that goes nowhere as none', () => {
    lab().open(project(ledCircuitExample()));
    const origin = lab().circuit;
    const moved = (dx: number) => {
      const result = movePart(origin, 'R1', dx, 0);
      if (!result.ok) throw new Error(result.error);
      return result.circuit;
    };
    lab().replaceCircuit(moved(1));
    lab().replaceCircuit(moved(2));
    lab().replaceCircuit(moved(3));
    lab().commitDrag(origin);
    expect(lab().past).toHaveLength(1);
    lab().undo();
    expect(lab().circuit).toBe(origin);

    lab().replaceCircuit(moved(1));
    lab().replaceCircuit(moved(0)); // back where it began
    lab().commitDrag(origin);
    expect(lab().past).toHaveLength(0);
  });

  it('merges a slider being dragged into one step', () => {
    lab().open(project(unoCircuitExample()));
    for (const position of [0.4, 0.3, 0.2, 0.1]) lab().setProps('POT1', { position });
    expect(lab().past).toHaveLength(1);
    lab().setProps('R1', { resistance: 1000 }); // another setting is its own step
    expect(lab().past).toHaveLength(2);
    lab().undo();
    lab().undo();
    expect(lab().circuit).toEqual(unoCircuitExample());
  });

  it('brings a removed board back with its program, and reloads it if running', async () => {
    lab().addUno();
    await vi.waitFor(() => expect(lab().programs.UNO1).toBeDefined());
    const program = lab().programs.UNO1!;
    const uploadsBefore = lab().uploads.UNO1!;
    lab().select('UNO1');
    lab().removeSelected();
    expect(lab().programs.UNO1).toBeUndefined();

    lab().undo();
    expect(lab().circuit.components.map((c) => c.id)).toEqual(['BB1', 'UNO1']);
    expect(lab().programs.UNO1).toBe(program);
    expect(lab().uploads.UNO1).toBe(uploadsBefore + 1);

    lab().undo(); // back before the board was added
    expect(lab().circuit.components.map((c) => c.id)).toEqual(['BB1']);
    expect(lab().programs).toEqual({});
    lab().redo();
    expect(lab().programs.UNO1).toBe(program);
  });

  it('keeps program text typed after the step that is undone', () => {
    lab().addUno();
    lab().setTool('led');
    lab().tapEndpoint('BB1.d9');
    lab().setSource('UNO1', '// my own program');
    lab().undo();
    expect(lab().circuit.components.map((c) => c.id)).toEqual(['BB1', 'UNO1']);
    expect(lab().programs.UNO1!.source).toBe('// my own program');
  });

  it('keeps a limited history and starts afresh when a project is opened', () => {
    lab().open(project(ledCircuitExample()));
    for (let i = 0; i < 130; i++) {
      lab().select('LED1');
      lab().flipSelected();
    }
    expect(lab().past).toHaveLength(100);
    lab().open(project());
    expect(lab().past).toHaveLength(0);
    expect(lab().future).toHaveLength(0);
  });
});

describe('multimeter probes', () => {
  const result = simulate(ledCircuitExample());

  it('places red first, then black, and then they take turns', () => {
    lab().open(project(ledCircuitExample()));
    lab().setTool('probe');
    lab().tapEndpoint('BB1.a5');
    expect(lab().meter).toMatchObject({ red: 'BB1.a5', black: null });
    lab().tapEndpoint('BB1.a9');
    expect(lab().meter).toMatchObject({ red: 'BB1.a5', black: 'BB1.a9' });
    lab().tapEndpoint('BAT1.pos'); // red was placed longest ago, so red moves
    expect(lab().meter).toMatchObject({ red: 'BAT1.pos', black: 'BB1.a9' });
    lab().tapEndpoint('BB1.tn1');
    expect(lab().meter).toMatchObject({ red: 'BAT1.pos', black: 'BB1.tn1' });
    // Probing changes nothing in the circuit and is not an undo step.
    expect(lab().circuit).toEqual(ledCircuitExample());
    expect(lab().past).toHaveLength(0);
  });

  it('lifts a probe that is tapped, and clears both', () => {
    lab().setTool('probe');
    lab().tapEndpoint('BB1.a5');
    lab().tapEndpoint('BB1.a9');
    lab().tapEndpoint('BB1.a5');
    expect(lab().meter).toMatchObject({ red: null, black: 'BB1.a9' });
    lab().tapEndpoint('BB1.b5'); // the free probe goes down again
    expect(lab().meter).toMatchObject({ red: 'BB1.b5', black: 'BB1.a9' });
    lab().clearMeter();
    expect(lab().meter).toMatchObject({ red: null, black: null });
  });

  it('reads red above black, or above ground with one probe', () => {
    const probes = (red: string | null, black: string | null) => ({
      red,
      black,
      last: 'red' as const,
    });
    expect(meterReading(result, probes(null, 'BB1.a5'))).toBeNull();
    expect(meterReading(null, probes('BB1.a5', null))).toEqual({ state: 'off' });
    expect(meterReading(result, probes('BB1.h20', null))).toEqual({ state: 'open' });

    const battery = meterReading(result, probes('BAT1.pos', null));
    expect(battery).toMatchObject({ state: 'ok' });
    expect((battery as { volts: number }).volts).toBeCloseTo(9, 1);
    // Across the LED: its forward voltage, with either sign depending on which way round.
    const across = meterReading(result, probes('BB1.d9', 'BB1.d10')) as { volts: number };
    expect(across.volts).toBeCloseTo(result.readings.LED1!.voltage, 6);
    const reversed = meterReading(result, probes('BB1.d10', 'BB1.d9')) as { volts: number };
    expect(reversed.volts).toBeCloseTo(-across.volts, 9);
    // Two holes in one strip are the same point.
    expect((meterReading(result, probes('BB1.a9', 'BB1.e9')) as { volts: number }).volts).toBe(0);
  });
});
