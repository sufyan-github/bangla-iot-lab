import { UNO_PIN_COUNT, UnoBoard, type PinDrive } from '@banglalab/board-emulators';
import type { CircuitDocument } from '@banglalab/shared';
import { LOGIC_HIGH, LOGIC_LOW } from './library';
import type { CircuitState } from './netlist';
import { Observation, solveState, type SimulationResult, type StateSolution } from './simulate';

/** How long the processor runs between exchanges with the circuit, in simulated milliseconds. */
const SLICE_MS = 1;

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

export interface SimulationFrame {
  /** Simulated time since the session started, milliseconds. */
  timeMs: number;
  result: SimulationResult;
  boards: Record<string, BoardStatus>;
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

/**
 * Runs a circuit together with the programs on its boards.
 *
 * The processor and the circuit take turns: the processor runs for one
 * millisecond, every pin change it made is replayed against the circuit in
 * order, and the resulting voltages are fed back to its inputs. Between pin
 * changes the circuit is steady, so each distinct combination of pin levels is
 * solved once and remembered. A program that reads a pin it is also driving
 * therefore sees the result up to a millisecond late.
 *
 * Time only moves when `advance` is called, so the session is deterministic
 * and can be tested without a clock.
 */
export class SimulationSession {
  private document: CircuitDocument;
  private pressed: readonly string[];
  private readonly boards = new Map<string, RunningBoard>();
  private solutions = new Map<string, StateSolution | null>();
  private observation = new Observation();
  private time = 0;
  private lastFrameAt = 0;
  /** Number of times the circuit was actually solved; exposed for tests and tuning. */
  solveCount = 0;

  constructor(document: CircuitDocument, pressed: readonly string[] = []) {
    this.document = document;
    this.pressed = pressed;
  }

  get timeMs(): number {
    return this.time;
  }

  /** True when at least one board has a program, so time matters. */
  get hasPrograms(): boolean {
    return this.boards.size > 0;
  }

  /** Applies an edit or a button press. Running programs keep running. */
  update(document: CircuitDocument, pressed: readonly string[] = []): void {
    this.document = document;
    this.pressed = pressed;
    this.solutions = new Map();
    for (const id of this.boards.keys()) {
      if (!document.components.some((c) => c.id === id && c.type === 'uno')) this.boards.delete(id);
    }
    this.feedInputs();
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
    this.feedInputs();
  }

  private state(): CircuitState {
    const boards: Record<string, PinDrive[]> = {};
    for (const [id, board] of this.boards) boards[id] = board.drives;
    return { pressed: this.pressed, boards };
  }

  private solve(): StateSolution | null {
    let key = '';
    for (const [id, board] of this.boards) key += `${id}:${board.drives.join(',')};`;
    let solution = this.solutions.get(key);
    if (solution === undefined) {
      solution =
        this.document.components.length > 0
          ? solveState(this.document, this.state())
          : EMPTY_SOLUTION;
      this.solutions.set(key, solution);
      this.solveCount++;
    }
    return solution;
  }

  /** Presents the circuit's voltages to every board's digital and analog inputs. */
  private feedInputs(): void {
    if (this.boards.size === 0) return;
    const solution = this.solve();
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
    if (this.boards.size === 0) {
      this.observation.add(this.solve(), milliseconds);
      this.time = end;
      return;
    }
    while (this.time < end) {
      const sliceEnd = Math.min(end, this.time + SLICE_MS);
      const events: (RunningBoard['events'][number] & { board: RunningBoard })[] = [];
      for (const board of this.boards.values()) {
        board.emulator.runUntil(sliceEnd - board.startedAt);
        for (const event of board.events) events.push({ ...event, board });
        board.events = [];
      }
      if (this.boards.size > 1) events.sort((a, b) => a.timeMs - b.timeMs);

      let cursor = this.time;
      const hold = (until: number) => {
        const duration = Math.min(until, sliceEnd) - cursor;
        if (duration <= 0) return;
        this.observation.add(this.solve(), duration);
        for (const board of this.boards.values()) {
          for (let pin = 0; pin < UNO_PIN_COUNT; pin++) {
            if (board.drives[pin] === 'high') board.highTime[pin]! += duration;
          }
        }
        cursor += duration;
      };
      for (const event of events) {
        hold(event.timeMs);
        event.board.drives[event.pin] = event.drive;
      }
      hold(sliceEnd);
      this.time = sliceEnd;
      this.feedInputs();
    }
  }

  /** Readings averaged since the previous frame, plus each board's status. */
  frame(): SimulationFrame {
    if (this.observation.isEmpty) this.observation.add(this.solve(), 1);
    const result = this.observation.interpret(this.document, {
      programRunning: this.boards.size > 0,
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
    return { timeMs: this.time, result, boards };
  }
}

const EMPTY_SOLUTION: StateSolution = {
  parts: {},
  wires: {},
  sockets: {},
  shorted: [],
  delivering: false,
  bridged: [],
  iterations: 0,
};
