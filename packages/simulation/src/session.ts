import { UNO_PIN_COUNT, UnoBoard, type PinDrive } from '@banglalab/board-emulators';
import { solveTimeStep, type Capacitor } from '@banglalab/circuit-engine';
import type { CircuitDocument } from '@banglalab/shared';
import { LOGIC_HIGH, LOGIC_LOW } from './library';
import { buildNetlist, type CircuitState, type Netlist } from './netlist';
import {
  Observation,
  readSolution,
  relayStates,
  solveState,
  type SimulationResult,
  type StateSolution,
} from './simulate';

/** How long the processor runs between exchanges with the circuit, in simulated milliseconds. */
const SLICE_MS = 1;
/** Longest time step used while capacitors are charging, in simulated milliseconds. */
const CAPACITOR_STEP_MS = 0.1;

export interface BoardStatus {
  /** True once a program has been uploaded. */
  programmed: boolean;
  /** Simulated time since the program started, milliseconds. */
  timeMs: number;
  drives: PinDrive[];
  /** Fraction of the time since the last frame that each pin spent driven high (PWM duty). */
  highFraction: number[];
  /** Text sent over serial since the last frame. */
  serial: string;
}

/**
 * A signal to record over time, as an instrument probe would: the voltage
 * across a part ("part:LED1") or on a board socket ("socket:UNO1.d9").
 */
export type Probe = `part:${string}` | `socket:${string}`;

/** What the probes saw since the previous frame. Each value holds until the next time. */
export interface SignalTrace {
  probes: Probe[];
  /** Simulated time of each sample, milliseconds. */
  times: number[];
  /** values[p][i] is probe p at times[i], in volts. */
  values: number[][];
}

export interface SimulationFrame {
  /** Simulated time since the session started, milliseconds. */
  timeMs: number;
  result: SimulationResult;
  boards: Record<string, BoardStatus>;
  /** Present only while probes are set. */
  trace?: SignalTrace;
}

interface RunningBoard {
  emulator: UnoBoard;
  /** Session time at which this program started. */
  startedAt: number;
  drives: PinDrive[];
  highTime: number[];
  serial: string;
  /** Level last presented to each input, for hysteresis and to avoid redundant updates. */
  inputLevel: (boolean | undefined)[];
  events: { timeMs: number; pin: number; drive: PinDrive }[];
}

const EMPTY_SOLUTION: StateSolution = {
  parts: {},
  wires: {},
  sockets: {},
  shorted: [],
  delivering: false,
  bridged: [],
  relays: {},
  iterations: 0,
};

/**
 * Runs a circuit through time, together with the programs on its boards.
 *
 * The processor and the circuit take turns: the processor runs for one
 * millisecond, every pin change it made is replayed against the circuit in
 * order, and the resulting voltages are fed back to its inputs. A program that
 * reads a pin it is also driving therefore sees the result up to a millisecond late.
 *
 * Without capacitors the circuit is steady between pin changes, so each
 * distinct combination of pin levels is solved once and remembered. With
 * capacitors the circuit is stepped through time (0.1 ms steps) instead.
 *
 * Time only moves when `advance` is called, so the session is deterministic
 * and can be tested without a clock.
 */
export class SimulationSession {
  private document: CircuitDocument;
  private pressed: readonly string[];
  private readonly boards = new Map<string, RunningBoard>();
  private observation = new Observation();
  private time = 0;
  private lastFrameAt = 0;

  /** Steady circuits: one remembered solution per combination of pin levels. */
  private solutions = new Map<string, StateSolution | null>();
  /** Circuits with capacitors: the charge each one holds, and the netlist being stepped. */
  private hasCapacitors = false;
  private readonly stored = new Map<string, number>();
  private stepping: { key: string; netlist: Netlist } | null = null;
  private latest: StateSolution | null = null;
  /** Which relay contacts are closed; a relay remembers its position between solves. */
  private relays: Record<string, boolean> = {};

  /** Number of times the circuit was actually solved; exposed for tests and tuning. */
  solveCount = 0;

  private probes: Probe[] = [];
  private trace: SignalTrace = { probes: [], times: [], values: [] };
  /** Time reached by the recording, which runs ahead of `time` inside a slice. */
  private clock = 0;

  constructor(document: CircuitDocument, pressed: readonly string[] = []) {
    this.document = document;
    this.pressed = pressed;
    this.update(document, pressed);
  }

  get timeMs(): number {
    return this.time;
  }

  /** True when the circuit changes by itself as time passes: a program is running or a capacitor is present. */
  get isTimeDependent(): boolean {
    return this.boards.size > 0 || this.hasCapacitors;
  }

  /** Applies an edit or a button press. Running programs keep running; capacitors keep their charge. */
  update(document: CircuitDocument, pressed: readonly string[] = []): void {
    this.document = document;
    this.pressed = pressed;
    this.solutions = new Map();
    this.stepping = null;
    this.hasCapacitors = document.components.some((c) => c.type === 'capacitor');
    for (const id of this.boards.keys()) {
      if (!document.components.some((c) => c.id === id && c.type === 'uno')) this.boards.delete(id);
    }
    for (const id of this.stored.keys()) {
      if (!document.components.some((c) => c.id === id)) this.stored.delete(id);
    }
    this.feedInputs();
  }

  /** Chooses which signals to record for the oscilloscope and logic analyser. */
  setProbes(probes: readonly Probe[]): void {
    this.probes = [...probes];
    this.trace = { probes: this.probes, times: [], values: this.probes.map(() => []) };
  }

  /** Adds a sample to the trace, unless nothing changed since the last one. */
  private record(solution: StateSolution | null): void {
    if (this.probes.length === 0) return;
    const { times, values } = this.trace;
    const sample = this.probes.map((probe) => {
      const id = probe.slice(probe.indexOf(':') + 1);
      const source = probe.startsWith('part:') ? solution?.parts[id] : solution?.sockets[id];
      return source?.voltage ?? 0;
    });
    const last = times.length - 1;
    if (last >= 0 && sample.every((v, p) => Math.abs(v - values[p]![last]!) < 1e-6)) return;
    times.push(this.clock);
    sample.forEach((v, p) => values[p]!.push(v));
  }

  /** Uploads a program to a board and starts it from reset. Throws if the firmware is not valid. */
  loadFirmware(boardId: string, hex: string): void {
    const emulator = new UnoBoard(hex);
    const board: RunningBoard = {
      emulator,
      startedAt: this.time,
      drives: Array.from({ length: UNO_PIN_COUNT }, (_, pin) => emulator.pinDrive(pin)),
      highTime: new Array<number>(UNO_PIN_COUNT).fill(0),
      serial: '',
      inputLevel: [],
      events: [],
    };
    emulator.onPinChange((pin, drive, timeMs) => {
      board.events.push({ timeMs: board.startedAt + timeMs, pin, drive });
    });
    emulator.onSerial((text) => (board.serial += text));
    this.boards.set(boardId, board);
    this.stepping = null;
    this.feedInputs();
  }

  private state(): CircuitState {
    const boards: Record<string, PinDrive[]> = {};
    for (const [id, board] of this.boards) boards[id] = board.drives;
    return {
      pressed: this.pressed,
      boards,
      stored: Object.fromEntries(this.stored),
      relays: this.relays,
    };
  }

  private stateKey(): string {
    let key = '';
    for (const [id, board] of this.boards) key += `${id}:${board.drives.join(',')};`;
    for (const [id, closed] of Object.entries(this.relays)) if (closed) key += `${id};`;
    return key;
  }

  /** The settled solution for the present pin levels (capacitors treated as fully charged). */
  private solveSteady(): StateSolution | null {
    if (this.document.components.length === 0) return EMPTY_SOLUTION;
    const key = this.stateKey();
    let solution = this.solutions.get(key);
    if (solution === undefined) {
      solution = solveState(this.document, this.state());
      this.solutions.set(key, solution);
      this.solveCount++;
    }
    if (solution) this.relays = solution.relays;
    return solution;
  }

  /** Moves a circuit with capacitors forward by one time step and returns the state it reached. */
  private stepCapacitors(milliseconds: number): StateSolution | null {
    const key = this.stateKey();
    if (this.stepping?.key !== key) {
      // Pin levels changed: same charges, new sources.
      this.stepping = { key, netlist: buildNetlist(this.document, this.state()) };
    }
    const { netlist } = this.stepping;
    const result = solveTimeStep(netlist.circuit, milliseconds / 1000);
    this.solveCount++;
    if (!result.ok) return (this.latest = null);
    for (const [id, device] of netlist.partDevice) {
      if (device.kind === 'capacitor') this.stored.set(id, (device as Capacitor).storedVoltage);
    }
    this.latest = readSolution(this.document, netlist, result.solution, result.iterations);
    // A contact that should move does so for the next step.
    this.latest.relays = this.relays;
    this.relays = relayStates(this.document, this.latest, this.relays);
    return this.latest;
  }

  /** Holds the present pin levels for a stretch of time and records what the circuit did. */
  private hold(milliseconds: number): void {
    if (milliseconds <= 0) return;
    if (!this.hasCapacitors) {
      const solution = this.solveSteady();
      this.record(solution);
      this.observation.add(solution, milliseconds);
      this.clock += milliseconds;
    } else {
      for (let remaining = milliseconds; remaining > 1e-9;) {
        const step = Math.min(remaining, CAPACITOR_STEP_MS);
        const solution = this.stepCapacitors(step);
        this.clock += step;
        this.record(solution); // the state reached at the end of the step
        this.observation.add(solution, step);
        remaining -= step;
      }
    }
    for (const board of this.boards.values()) {
      for (let pin = 0; pin < UNO_PIN_COUNT; pin++) {
        if (board.drives[pin] === 'high') board.highTime[pin]! += milliseconds;
      }
    }
  }

  /** Presents the circuit's voltages to every board's digital and analog inputs. */
  private feedInputs(): void {
    if (this.boards.size === 0) return;
    const solution = this.hasCapacitors ? this.latest : this.solveSteady();
    for (const [id, board] of this.boards) {
      for (let pin = 0; pin < UNO_PIN_COUNT; pin++) {
        const socket = `${id}.${pin < 14 ? `d${pin}` : `a${pin - 14}`}`;
        const sample = solution?.sockets[socket];
        // Nothing plugged in: a pull-up reads HIGH, a bare input reads LOW.
        const voltage = sample ? sample.voltage : board.drives[pin] === 'pullup' ? 5 : 0;
        const previous = board.inputLevel[pin];
        const level =
          voltage > LOGIC_HIGH ? true : voltage < LOGIC_LOW ? false : (previous ?? false);
        if (level !== previous) {
          board.inputLevel[pin] = level;
          board.emulator.setDigitalInput(pin, level);
        }
        if (pin >= 14) board.emulator.setAnalogInput(pin - 14, voltage);
      }
    }
  }

  /** Moves simulated time forward. */
  advance(milliseconds: number): void {
    const end = this.time + milliseconds;
    this.clock = this.time;
    if (!this.isTimeDependent) {
      this.hold(milliseconds);
      this.time = end;
      return;
    }
    while (this.time < end - 1e-9) {
      const sliceEnd = Math.min(end, this.time + SLICE_MS);
      const events: (RunningBoard['events'][number] & { board: RunningBoard })[] = [];
      for (const board of this.boards.values()) {
        board.emulator.runUntil(sliceEnd - board.startedAt);
        for (const event of board.events) events.push({ ...event, board });
        board.events = [];
      }
      if (this.boards.size > 1) events.sort((a, b) => a.timeMs - b.timeMs);

      let cursor = this.time;
      for (const event of events) {
        const at = Math.min(event.timeMs, sliceEnd);
        this.hold(at - cursor);
        cursor = Math.max(cursor, at);
        event.board.drives[event.pin] = event.drive;
      }
      this.hold(sliceEnd - cursor);
      this.time = sliceEnd;
      this.feedInputs();
    }
    this.time = end;
  }

  /** Readings averaged since the previous frame, plus each board's status. */
  frame(): SimulationFrame {
    if (this.observation.isEmpty) {
      // No time has passed since the last frame: report the present state.
      this.observation.add(this.hasCapacitors && this.latest ? this.latest : this.solveSteady(), 1);
    }
    const result = this.observation.interpret(this.document, {
      timeDependent: this.isTimeDependent,
    });
    const sinceLastFrame = this.time - this.lastFrameAt;
    this.observation = new Observation();
    this.lastFrameAt = this.time;

    const boards: Record<string, BoardStatus> = {};
    for (const [id, board] of this.boards) {
      boards[id] = {
        programmed: true,
        timeMs: this.time - board.startedAt,
        drives: [...board.drives],
        highFraction: board.highTime.map((high, pin) =>
          sinceLastFrame > 0
            ? Math.min(1, high / sinceLastFrame)
            : board.drives[pin] === 'high'
              ? 1
              : 0,
        ),
        serial: board.serial,
      };
      board.highTime.fill(0);
      board.serial = '';
    }
    const frame: SimulationFrame = { timeMs: this.time, result, boards };
    if (this.probes.length > 0) {
      frame.trace = this.trace;
      this.trace = { probes: this.probes, times: [], values: this.probes.map(() => []) };
    }
    return frame;
  }
}
