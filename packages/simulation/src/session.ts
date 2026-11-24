import {
  UnoBoard,
  type HttpResponse,
  type PinDrive,
  type ProgrammableBoard,
} from '@banglalab/board-emulators';
import { solveTimeStep, type Capacitor } from '@banglalab/circuit-engine';
import {
  boardSocketOfPin,
  generatorVolts,
  isProgrammable,
  withoutBreadboards,
  type CircuitDocument,
  type ProgrammableType,
} from '@banglalab/shared';
import { BOARD_MODELS, type BoardModel } from './boards';
import { Esp32SimBoard, esp32Emulator, parseEsp32Firmware } from './esp32-sim-board';
import { Esp32SketchBoard } from './esp32-sketch-board';
import { MIN_SUPPLY, MODULE_MIN_SUPPLY } from './library';
import { MqttBroker, type MqttMessage } from './mqtt';

/** How many steps a sine or triangle wave from a function generator is drawn in, each period. */
const GENERATOR_STEPS = 32;
import {
  buildNetlist,
  netName,
  type ChargerState,
  type ChipState,
  type RegulatorState,
  type CircuitState,
  type DriverState,
  type Netlist,
} from './netlist';
import { Peripherals, type ScheduledInput } from './peripherals';
import { PIR_IDLE, pirDeadline, stepPir, type PirState } from './pir';
import {
  Observation,
  chipStates,
  driverStates,
  readSolution,
  relayStates,
  sameChips,
  sameSensing,
  sensorStates,
  chargerStates,
  regulatorStates,
  sameChargers,
  sameRegulators,
  sameDrivers,
  solveState,
  type SimulationResult,
  type StateSolution,
} from './simulate';

/** How long the processor runs between exchanges with the circuit, in simulated milliseconds. */
const SLICE_MS = 1;
/** Slice used when a part needs pulses timed more finely (an ultrasonic sensor's echo). */
const FINE_SLICE_MS = 0.25;
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
  /** All of the board's saved settings, present when the program changed them since the last frame. */
  settings?: string;
  /** Answers the board's web server gave since the last frame, when there were any. */
  http?: HttpResponse[];
}

/**
 * A signal to record over time, as an instrument probe would: the voltage
 * across a part ("part:LED1"), on a board socket ("socket:UNO1.d9"), or on a
 * leg of a part on the breadboard ("pin:U1.p5"), measured from ground.
 */
export type Probe = `part:${string}` | `socket:${string}` | `pin:${string}`;

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
  /**
   * How fast the simulation is running: simulated time over real time, 1 when
   * it keeps up. Set by whoever paces the session, when it measures it.
   */
  speed?: number;
  result: SimulationResult;
  boards: Record<string, BoardStatus>;
  /** MQTT messages sent since the last frame, by the boards or the dashboard. */
  mqtt?: MqttMessage[];
  /** Present only while probes are set. */
  trace?: SignalTrace;
}

interface RunningBoard {
  emulator: ProgrammableBoard;
  type: ProgrammableType;
  model: BoardModel;
  /** Session time at which this program started. */
  startedAt: number;
  drives: PinDrive[];
  highTime: number[];
  serial: string;
  /** Web server answers not yet reported. */
  http: HttpResponse[];
  /** Level last presented to each input, for hysteresis and to avoid redundant updates. */
  inputLevel: (boolean | undefined)[];
  /** Pins the board was last told the circuit does not decide (see `releaseInput`). */
  inputReleased: (boolean | undefined)[];
  events: { timeMs: number; pin: number; drive: PinDrive }[];
}

const EMPTY_SOLUTION: StateSolution = {
  parts: {},
  wires: {},
  sockets: {},
  nodes: {},
  legs: {},
  shorted: [],
  delivering: false,
  bridged: [],
  relays: {},
  motion: {},
  clocks: {},
  channels: {},
  drivers: {},
  chips: {},
  sensing: {},
  chargers: {},
  regulators: {},
  floating: [],
  unsettled: false,
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
  /** Servos, ultrasonic sensors and LCDs, which work by timing rather than voltage. */
  private readonly peripherals = new Peripherals();
  /** Input pulses sensors have promised, earliest first. */
  private scheduled: ScheduledInput[] = [];
  /** Ultrasonic sensors whose echo line is HIGH right now. */
  private echo: Record<string, boolean> = {};
  /** Where each motion sensor is in its timing, and which have their output HIGH right now. */
  private readonly pirs = new Map<string, PirState>();
  private motion: Record<string, boolean> = {};
  /**
   * Each board's saved settings, as kept from one run to the next (the
   * ESP32's flash). Given by whoever starts the session, changed by programs.
   */
  private readonly settings = new Map<string, string>();
  private readonly settingsChanged = new Set<string>();
  /** What each motor driver was last found to be doing: where the next solve starts from. */
  private drivers: Record<string, DriverState> = {};
  /** What each logic chip was last found to be doing. */
  private chips: Record<string, ChipState> = {};
  /** What each sensor that depends on the circuit itself last saw. */
  private sensing: Record<string, number> = {};
  /** What each charger and step-down regulator was last found to be doing. */
  private chargers: Record<string, ChargerState> = {};
  private regulators: Record<string, RegulatorState> = {};

  /** Number of times the circuit was actually solved; exposed for tests and tuning. */
  solveCount = 0;

  private probes: Probe[] = [];
  private trace: SignalTrace = { probes: [], times: [], values: [] };
  private probeNets: (string | null)[] = [];
  /** Time reached by the recording, which runs ahead of `time` inside a slice. */
  private clock = 0;

  constructor(document: CircuitDocument, pressed: readonly string[] = []) {
    this.document = withoutBreadboards(document);
    this.pressed = pressed;
    this.update(document, pressed);
  }

  get timeMs(): number {
    return this.time;
  }

  /** True when the circuit changes by itself as time passes: a program is running or a capacitor is present. */
  /**
   * True when the circuit changes as time passes, even with nothing touched: a
   * program runs, a capacitor charges, a clock module ticks or a motion
   * sensor's output times out.
   */
  get isTimeDependent(): boolean {
    return (
      this.boards.size > 0 ||
      this.hasCapacitors ||
      this.document.components.some(
        (c) =>
          c.type === 'clock' ||
          c.type === 'pir' ||
          (c.type === 'battery' && c.props.source === 'generator'),
      )
    );
  }

  /** Clock modules whose output is HIGH now. */
  private clocks: Record<string, boolean> = {};
  /** Each function generator's output now, in volts. */
  private sources: Record<string, number> = {};

  /** The function generators' outputs at this moment. */
  private stepSources(): void {
    const next: Record<string, number> = {};
    let changed = false;
    for (const c of this.document.components) {
      if (c.type !== 'battery' || c.props.source !== 'generator') continue;
      // Kept to the millivolt, so that one value is one solution to reuse.
      next[c.id] = Math.round(generatorVolts(c.props, this.time) * 1000) / 1000;
      changed ||= next[c.id] !== this.sources[c.id];
    }
    if (!changed && Object.keys(next).length === Object.keys(this.sources).length) return;
    this.sources = next;
    this.feedInputs();
  }

  /**
   * The next moment a generator's output changes: each half period for a square
   * wave, and 32 times a period for the others, so that they are drawn smoothly.
   */
  private sourceDeadline(): number {
    let soonest = Infinity;
    for (const c of this.document.components) {
      if (c.type !== 'battery' || c.props.source !== 'generator') continue;
      const period = 1000 / (c.props.hz ?? 1);
      const step =
        c.props.wave === 'square' || c.props.wave === undefined
          ? period / 2
          : period / GENERATOR_STEPS;
      soonest = Math.min(soonest, (Math.floor(this.time / step + 1e-9) + 1) * step);
    }
    return soonest;
  }

  /** Each clock module's output at this moment: HIGH in the second half of each period. */
  private stepClocks(): void {
    const next: Record<string, boolean> = {};
    let changed = false;
    for (const clock of this.document.components) {
      if (clock.type !== 'clock') continue;
      const halves = Math.floor((this.time * 2 * clock.props.hz) / 1000 + 1e-9);
      next[clock.id] = halves % 2 === 1;
      changed ||= next[clock.id] !== (this.clocks[clock.id] ?? false);
    }
    if (!changed) return;
    this.clocks = next;
    this.feedInputs();
  }

  /** The next moment a clock module's output changes, or Infinity. */
  private clockDeadline(): number {
    let soonest = Infinity;
    for (const clock of this.document.components) {
      if (clock.type !== 'clock') continue;
      const half = 1000 / (2 * clock.props.hz);
      soonest = Math.min(soonest, (Math.floor(this.time / half + 1e-9) + 1) * half);
    }
    return soonest;
  }

  /** Applies an edit or a button press. Running programs keep running; capacitors keep their charge. */
  update(circuit: CircuitDocument, pressed: readonly string[] = []): void {
    // Breadboards play no part in the electricity: the strips follow from the hole names.
    const document = withoutBreadboards(circuit);
    this.document = document;
    this.probeNets = this.netsOfProbes();
    this.pressed = pressed;
    this.solutions = new Map();
    this.stepping = null;
    this.hasCapacitors = document.components.some((c) => c.type === 'capacitor');
    for (const id of this.boards.keys()) {
      const board = this.boards.get(id)!;
      if (!document.components.some((c) => c.id === id && c.type === board.type)) {
        board.emulator.dispose?.();
        this.boards.delete(id);
      }
    }
    for (const id of this.stored.keys()) {
      if (!document.components.some((c) => c.id === id)) this.stored.delete(id);
    }
    for (const id of this.pirs.keys()) {
      if (!document.components.some((c) => c.id === id && c.type === 'pir')) this.pirs.delete(id);
    }
    this.motion = Object.fromEntries([...this.pirs].map(([id, pir]) => [id, pir.high]));
    this.peripherals.rewire(document);
    this.scheduled = this.scheduled.filter((input) => this.boards.has(input.boardId));
    this.feedInputs();
  }

  /** The saved settings a board starts with when its program is next loaded. */
  setSettings(boardId: string, settings: string): void {
    this.settings.set(boardId, settings);
  }

  /** A board's saved settings as they are now. */
  savedSettings(boardId: string): string {
    return this.settings.get(boardId) ?? '';
  }

  /** Chooses which signals to record for the oscilloscope and logic analyser. */
  setProbes(probes: readonly Probe[]): void {
    this.probes = [...probes];
    this.trace = { probes: this.probes, times: [], values: this.probes.map(() => []) };
    this.probeNets = this.netsOfProbes();
  }

  /** For each probe on a leg, the net its hole is in; null for the other probes. */
  private netsOfProbes(): (string | null)[] {
    return this.probes.map((probe) => {
      if (!probe.startsWith('pin:')) return null;
      const [id, pin] = probe.slice('pin:'.length).split('.');
      const component = this.document.components.find((c) => c.id === id);
      const hole =
        component && 'pins' in component
          ? (component.pins as Record<string, string | undefined>)[pin ?? '']
          : undefined;
      return hole ? netName(hole) : null;
    });
  }

  /** Adds a sample to the trace, unless nothing changed since the last one. */
  private record(solution: StateSolution | null): void {
    if (this.probes.length === 0) return;
    const { times, values } = this.trace;
    const sample = this.probes.map((probe, p) => {
      const net = this.probeNets[p];
      if (net) return solution?.nodes[net] ?? 0;
      const id = probe.slice(probe.indexOf(':') + 1);
      const source = probe.startsWith('part:') ? solution?.parts[id] : solution?.sockets[id];
      return source?.voltage ?? 0;
    });
    const last = times.length - 1;
    if (last >= 0 && sample.every((v, p) => Math.abs(v - values[p]![last]!) < 1e-6)) return;
    times.push(this.clock);
    sample.forEach((v, p) => values[p]!.push(v));
  }

  /**
   * Uploads a built program to a board and starts it from reset. The program is
   * text: Intel HEX for the UNO-compatible board; for the ESP32, a sketch
   * module in base64. Throws if it is not a valid program for that board.
   */
  loadFirmware(boardId: string, program: string): void {
    const component = this.document.components.find((c) => c.id === boardId);
    if (component?.type === 'esp32') {
      // Two kinds of ESP32 program: real firmware for the chip emulator, or a
      // sketch built against the lab's own board library.
      const firmware = parseEsp32Firmware(program);
      if (firmware) {
        const emulator = esp32Emulator();
        if (!emulator) throw new Error('the chip emulator has not been loaded');
        this.loadProgram(boardId, new Esp32SimBoard(emulator, firmware));
        return;
      }
      const bytes = Uint8Array.from(atob(program.trim()), (char) => char.charCodeAt(0));
      this.loadProgram(boardId, new Esp32SketchBoard(bytes, this.settings.get(boardId) ?? ''));
    } else {
      this.loadProgram(boardId, new UnoBoard(program));
    }
  }

  /**
   * Puts a board that is ready to run its program (from reset, at time zero) in
   * the place of the circuit's board `boardId`. Throws if the circuit has no
   * such board.
   */
  loadProgram(boardId: string, emulator: ProgrammableBoard): void {
    const component = this.document.components.find((c) => c.id === boardId);
    if (!component || !isProgrammable(component)) {
      throw new Error(`the circuit has no board called ${boardId}`);
    }
    const model = BOARD_MODELS[component.type];
    const board: RunningBoard = {
      emulator,
      type: component.type,
      model,
      startedAt: this.time,
      drives: Array.from({ length: model.pinCount }, (_, pin) => emulator.pinDrive(pin)),
      highTime: new Array<number>(model.pinCount).fill(0),
      serial: '',
      http: [],
      inputLevel: [],
      inputReleased: [],
      events: [],
    };
    emulator.onPinChange((pin, drive, timeMs) => {
      const at = board.startedAt + timeMs;
      board.events.push({ timeMs: at, pin, drive });
      // Timing-based parts hear about the change at once, so a sensor's reply can be
      // delivered at exactly the right moment later in this same run.
      const replies = this.peripherals.pinChanged(
        boardId,
        pin,
        drive,
        at,
        (other) => emulator.pinDrive(other) === 'high',
      );
      if (replies.length > 0) {
        this.scheduled.push(...replies);
        this.scheduled.sort((a, b) => a.timeMs - b.timeMs);
        // The first of them may be due before this run was going to end.
        emulator.stopAt?.(replies[0]!.timeMs - board.startedAt);
      }
    });
    emulator.onSerial((text) => (board.serial += text));
    emulator.onHttpResponse?.((response) => board.http.push(response));
    emulator.onMqtt?.({
      connect: (_clientId, deliver) => {
        this.broker.connect(boardId, (message) => deliver(message.topic, message.payload));
        return true;
      },
      disconnect: () => this.broker.disconnect(boardId),
      publish: (topic, payload, retained) =>
        this.broker.publish({ topic, payload, from: boardId, timeMs: this.clock }, retained),
      subscribe: (filter, subscribe) =>
        subscribe
          ? this.broker.subscribe(boardId, filter)
          : this.broker.unsubscribe(boardId, filter),
    });
    emulator.onSettingsSaved?.((settings) => {
      this.settings.set(boardId, settings);
      this.settingsChanged.add(boardId);
    });
    emulator.onI2c?.((transfer) => this.peripherals.i2c(boardId, transfer));
    emulator.onOneWire?.((step) => this.peripherals.oneWire(boardId, step));
    emulator.onUart?.({
      write: (port, bytes) => this.peripherals.uartWrite(boardId, port, bytes),
      receive: (port) => this.peripherals.uartReceive(boardId, port),
    });
    emulator.onSpi?.((transfer) => {
      const reply = this.peripherals.spi(
        boardId,
        transfer,
        (pin) => emulator.pinDrive(pin) === 'high',
      );
      // A radio may have decided when its DIO0 line next changes.
      this.takeRadioInputs((timeMs) => emulator.stopAt?.(timeMs - board.startedAt), boardId);
      return reply;
    });
    emulator.onLedStrip?.((frame) => this.peripherals.ledStrip(boardId, frame));
    this.boards.get(boardId)?.emulator.dispose?.();
    this.boards.set(boardId, board);
    this.stepping = null;
    this.feedInputs();
  }

  /**
   * Moves the DIO0 changes the radios have decided into the inputs to deliver.
   * The board whose program is running now is stopped at the first of its own.
   */
  private takeRadioInputs(stopAt?: (timeMs: number) => void, boardId?: string): void {
    const inputs = this.peripherals.takeInputs();
    if (inputs.length === 0) return;
    this.scheduled.push(...inputs);
    this.scheduled.sort((a, b) => a.timeMs - b.timeMs);
    const own = inputs.filter((input) => input.boardId === boardId);
    if (stopAt && own.length) stopAt(Math.min(...own.map((input) => input.timeMs)));
  }

  private state(): CircuitState {
    const boards: Record<string, PinDrive[]> = {};
    for (const [id, board] of this.boards) boards[id] = board.drives;
    return {
      pressed: this.pressed,
      boards,
      stored: Object.fromEntries(this.stored),
      relays: this.relays,
      echo: this.echo,
      motion: this.motion,
      clocks: this.clocks,
      sources: this.sources,
      drivers: this.drivers,
      chips: this.chips,
      sensing: this.sensing,
      chargers: this.chargers,
      regulators: this.regulators,
    };
  }

  private stateKey(): string {
    let key = '';
    for (const [id, board] of this.boards) key += `${id}:${board.drives.join(',')};`;
    for (const [id, closed] of Object.entries(this.relays)) if (closed) key += `${id};`;
    for (const [id, high] of Object.entries(this.echo)) if (high) key += `${id}^;`;
    for (const [id, high] of Object.entries(this.motion)) if (high) key += `${id}~;`;
    for (const [id, high] of Object.entries(this.clocks)) if (high) key += `${id}^^;`;
    for (const [id, volts] of Object.entries(this.sources)) key += `${id}~${volts};`;
    // A latch made of gates remembers: the same pin levels can leave it either way.
    // A charger's protection remembers that it cut off.
    for (const [id, charger] of Object.entries(this.chargers)) {
      if (charger.tripped) key += `${id}!;`;
    }
    for (const [id, chip] of Object.entries(this.chips)) {
      key += `${id}#${Object.values(chip.outputs).map(Number).join('')}`;
      // A chip that remembers answers the same pin levels differently by what it holds,
      // and sees a clock edge by comparing with the levels it read last.
      if (chip.memory.length) {
        key += `@${chip.memory.join(',')}<${Object.values(chip.inputs).map(Number).join('')}`;
      }
      key += ';';
    }
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
    if (solution) {
      this.relays = solution.relays;
      this.drivers = solution.drivers;
      this.chips = solution.chips;
      this.sensing = solution.sensing;
      this.chargers = solution.chargers;
      this.regulators = solution.regulators;
    }
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
    this.latest.motion = this.motion;
    // A contact that should move does so for the next step.
    this.latest.relays = this.relays;
    this.relays = relayStates(this.document, this.latest, this.relays);
    // So does a motor driver that should switch: the circuit is rebuilt for the next step.
    this.latest.drivers = this.drivers;
    const drivers = driverStates(this.document, this.latest, this.drivers);
    if (!sameDrivers(this.drivers, drivers)) {
      this.drivers = drivers;
      this.stepping = null;
    }
    this.latest.chips = this.chips;
    const chips = chipStates(this.document, this.latest, this.chips);
    if (!sameChips(this.chips, chips)) {
      this.chips = chips;
      this.stepping = null;
    }
    this.latest.sensing = this.sensing;
    const sensing = sensorStates(this.document, this.latest);
    if (!sameSensing(this.sensing, sensing)) {
      this.sensing = sensing;
      this.stepping = null;
    }
    this.latest.chargers = this.chargers;
    const chargers = chargerStates(this.document, this.latest, this.chargers);
    if (!sameChargers(this.chargers, chargers)) {
      this.chargers = chargers;
      this.stepping = null;
    }
    this.latest.regulators = this.regulators;
    const regulators = regulatorStates(this.document, this.latest);
    if (!sameRegulators(this.regulators, regulators)) {
      this.regulators = regulators;
      this.stepping = null;
    }
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
      for (let pin = 0; pin < board.model.pinCount; pin++) {
        if (board.drives[pin] === 'high') board.highTime[pin]! += milliseconds;
      }
    }
  }

  /** Presents the circuit's voltages to every board's digital and analog inputs. */
  private feedInputs(): void {
    if (this.boards.size === 0) return;
    const solution = this.hasCapacitors ? this.latest : this.solveSteady();
    const minSupply = new Map(
      this.document.components.map((c) => [c.id, MIN_SUPPLY[c.type] ?? MODULE_MIN_SUPPLY]),
    );
    this.peripherals.setPowered(
      (id) => (solution?.parts[id]?.voltage ?? 0) >= (minSupply.get(id) ?? MODULE_MIN_SUPPLY),
    );
    this.peripherals.setBoardClock((boardId) => {
      const board = this.boards.get(boardId);
      return board ? this.time - board.startedAt : undefined;
    });
    this.peripherals.setLinesUp((id) => {
      const supply = solution?.parts[id]?.supply ?? 0;
      return supply > 0 && (solution?.channels[`${id}.dq`]?.voltage ?? 0) > supply / 2;
    });
    this.peripherals.setMeasured((id) => ({
      shunt: solution?.channels[`${id}.shunt`]?.voltage ?? 0,
      bus: solution?.channels[`${id}.bus`]?.voltage ?? 0,
    }));
    for (const [id, board] of this.boards) {
      const { model } = board;
      for (let pin = 0; pin < model.pinCount; pin++) {
        const resting = this.peripherals.sensorInputs.get(`${id}:${pin}`);
        if (resting !== undefined) {
          // This input is driven by a sensor's timed pulses; between them it rests
          // at the sensor's idle level.
          if (board.inputLevel[pin] === undefined) {
            board.inputLevel[pin] = resting;
            board.inputReleased[pin] = false;
            board.emulator.setDigitalInput(pin, resting);
          }
          continue;
        }
        const terminal = boardSocketOfPin(board.type, pin);
        // A pin number with no socket on this board (the ESP32's flash pins) is left alone.
        if (terminal === null) continue;
        const sample = solution?.sockets[`${id}.${terminal}`];
        // Nothing plugged in: a pull-up reads HIGH, a bare input reads LOW.
        const voltage = sample ? sample.voltage : board.drives[pin] === 'pullup' ? model.vcc : 0;
        const previous = board.inputLevel[pin];
        const level =
          voltage > model.logicHigh ? true : voltage < model.logicLow ? false : (previous ?? false);
        // A board that models its own pulls is told when the circuit is not deciding the
        // level, so that a pull-up enabled by the program reads HIGH in the same instant.
        const released =
          board.emulator.releaseInput !== undefined && this.pinDecidesItself(id, board, pin, level);
        if (level !== previous || released !== (board.inputReleased[pin] ?? false)) {
          board.inputLevel[pin] = level;
          board.inputReleased[pin] = released;
          if (released) board.emulator.releaseInput!(pin);
          else board.emulator.setDigitalInput(pin, level);
        }
        board.emulator.setPinVoltage(pin, voltage);
      }
    }
  }

  /**
   * The level a board pin sees when a sensor's output changes. Usually the
   * sensor's own level; but what is between the two matters (a divider that
   * brings 5 V down, or one that brings it down too far), so the circuit is
   * asked, with the sensor's output as it is about to be.
   */
  private levelFromSensor(boardId: string, board: RunningBoard, input: ScheduledInput): boolean {
    if (this.hasCapacitors || input.asIs) return input.level;
    const terminal = boardSocketOfPin(board.type, input.pin);
    if (terminal === null) return input.level;
    const echo = this.echo;
    const relays = this.relays;
    const drivers = this.drivers;
    const chips = this.chips;
    const sensing = this.sensing;
    const chargers = this.chargers;
    const regulators = this.regulators;
    this.echo = { ...echo, [input.sensorId]: input.level };
    const volts = this.solveSteady()?.sockets[`${boardId}.${terminal}`]?.voltage;
    this.echo = echo;
    this.relays = relays;
    this.drivers = drivers;
    this.chips = chips;
    this.sensing = sensing;
    this.chargers = chargers;
    this.regulators = regulators;
    if (volts === undefined) return input.level;
    if (volts > board.model.logicHigh) return true;
    if (volts < board.model.logicLow) return false;
    return board.inputLevel[input.pin] ?? false;
  }

  /**
   * True when nothing in the circuit decides a pin's level: its socket is
   * empty, the pin is driving it itself, or it reads LOW only because nothing
   * holds it up (it would read HIGH with the pin's own pull-up on).
   */
  private pinDecidesItself(
    boardId: string,
    board: RunningBoard,
    pin: number,
    level: boolean,
  ): boolean {
    const drive = board.drives[pin];
    if (drive === 'high' || drive === 'low') return true;
    const terminal = boardSocketOfPin(board.type, pin);
    if (terminal === null) return false;
    const socket = `${boardId}.${terminal}`;
    const steady = this.hasCapacitors ? this.latest : this.solveSteady();
    if (!steady?.sockets[socket]) return true; // nothing plugged in
    // With a pull already on, the level is what it is: the circuit and the pull settled it.
    if (drive === 'pullup' || drive === 'pulldown') return level === (drive === 'pullup');
    if (level || this.hasCapacitors) return false;
    // A plain input reading LOW: held LOW by the circuit, or merely not held up?
    // Asked of the solver as a question; nothing about the running circuit may change.
    const before = board.drives[pin]!;
    const relays = this.relays;
    const drivers = this.drivers;
    const chips = this.chips;
    const sensing = this.sensing;
    const chargers = this.chargers;
    const regulators = this.regulators;
    board.drives[pin] = 'pullup';
    const pulled = this.solveSteady();
    board.drives[pin] = before;
    this.relays = relays;
    this.drivers = drivers;
    this.chips = chips;
    this.sensing = sensing;
    this.chargers = chargers;
    this.regulators = regulators;
    return (pulled?.sockets[socket]?.voltage ?? 0) > board.model.logicHigh;
  }

  /**
   * Brings every motion sensor up to the present moment: its output rises on
   * movement and falls when its hold time has run out.
   */
  private stepMotion(): void {
    const sensors = this.document.components.filter((c) => c.type === 'pir');
    if (sensors.length === 0) return;
    const solution = this.hasCapacitors ? this.latest : this.solveSteady();
    const next: Record<string, boolean> = {};
    let changed = false;
    for (const sensor of sensors) {
      const before = this.pirs.get(sensor.id) ?? PIR_IDLE;
      const after = stepPir(before, this.time, {
        motion: sensor.props.motion,
        powered: (solution?.parts[sensor.id]?.voltage ?? 0) >= MIN_SUPPLY.pir!,
        holdMs: sensor.props.hold * 1000,
      });
      this.pirs.set(sensor.id, after);
      next[sensor.id] = after.high;
      changed ||= after.high !== before.high;
    }
    if (!changed) return;
    this.motion = next;
    this.feedInputs();
  }

  /** The next moment a motion sensor's output changes by itself, or Infinity. */
  private motionDeadline(): number {
    let soonest = Infinity;
    for (const sensor of this.document.components) {
      if (sensor.type !== 'pir') continue;
      const at = pirDeadline(this.pirs.get(sensor.id) ?? PIR_IDLE, sensor.props.motion);
      if (at > this.time + 1e-9) soonest = Math.min(soonest, at);
    }
    return soonest;
  }

  /** Moves simulated time forward. */
  advance(milliseconds: number): void {
    const end = this.time + milliseconds;
    // Stop at each moment a motion sensor's output changes, so that it changes on time
    // however long the stretch asked for.
    for (;;) {
      this.stepMotion();
      this.stepClocks();
      this.stepSources();
      const until = Math.min(
        end,
        this.motionDeadline(),
        this.clockDeadline(),
        this.sourceDeadline(),
      );
      if (until > this.time) this.run(until - this.time);
      if (this.time >= end - 1e-9) break;
    }
    this.time = end;
    this.stepMotion();
    this.stepClocks();
    this.stepSources();
  }

  private run(milliseconds: number): void {
    const end = this.time + milliseconds;
    this.clock = this.time;
    if (!this.isTimeDependent) {
      this.hold(milliseconds);
      this.time = end;
      return;
    }
    const slice = this.peripherals.needsFineTiming ? FINE_SLICE_MS : SLICE_MS;
    while (this.time < end - 1e-9) {
      const sliceEnd = Math.min(end, this.time + slice);
      // Radios finish sending and receiving on time, whether or not a program is asking.
      this.peripherals.advanceRadios(this.time);
      this.takeRadioInputs();
      /** Everything that changes the circuit during this slice, to be replayed in order. */
      const changes: { timeMs: number; apply(): void }[] = [];
      for (const [boardId, board] of this.boards) {
        // Run up to each promised sensor pulse, deliver it, and carry on. A pulse may be
        // promised while the board is running (a sensor answering what the program just
        // did): the board is then stopped at that instant, where it can be.
        for (;;) {
          const next = this.scheduled.find((s) => s.boardId === boardId);
          const until = next && next.timeMs < sliceEnd ? next.timeMs : sliceEnd;
          const before = board.startedAt + board.emulator.timeMs;
          board.emulator.runUntil(until - board.startedAt);
          const reached = board.startedAt + board.emulator.timeMs + 1e-9;
          let delivered = false;
          for (;;) {
            const input = this.scheduled.find((s) => s.boardId === boardId);
            if (!input || input.timeMs > reached) break;
            this.scheduled.splice(this.scheduled.indexOf(input), 1);
            delivered = true;
            const level = this.levelFromSensor(boardId, board, input);
            board.emulator.setDigitalInput(input.pin, level);
            board.inputLevel[input.pin] = level;
            board.inputReleased[input.pin] = false;
            // An ultrasonic sensor's echo is also a voltage in the circuit; a DHT11's
            // data pulses are not modelled as one.
            if (!input.asIs) {
              changes.push({
                timeMs: input.timeMs,
                apply: () => (this.echo = { ...this.echo, [input.sensorId]: input.level }),
              });
            }
          }
          if (reached >= sliceEnd - 1e-9) break;
          // A board that has stopped for good no longer moves its clock: do not wait for it.
          if (!delivered && reached <= before + 1e-9) break;
        }
        for (const event of board.events) {
          changes.push({
            timeMs: event.timeMs,
            apply: () => (board.drives[event.pin] = event.drive),
          });
        }
        board.events = [];
      }
      changes.sort((a, b) => a.timeMs - b.timeMs);

      let cursor = this.time;
      for (const change of changes) {
        const at = Math.min(change.timeMs, sliceEnd);
        this.hold(at - cursor);
        cursor = Math.max(cursor, at);
        change.apply();
      }
      this.hold(sliceEnd - cursor);
      this.time = sliceEnd;
      this.feedInputs();
    }
    this.time = end;
  }

  /** The lab's MQTT broker, shared by the boards and the dashboard panel. */
  private readonly broker = new MqttBroker();

  /** A message from the dashboard panel. False when the topic is not one a client may publish to. */
  publishMqtt(topic: string, payload: string, retained = false): boolean {
    return this.broker.publish({ topic, payload, from: 'dashboard', timeMs: this.time }, retained);
  }

  /**
   * A request from the lab's browser panel to a board's web server. Returns its
   * number, to find the answer by in a later frame, or why it was not sent.
   */
  request(boardId: string, path: string): number | 'no-board' | 'no-wifi' | 'no-server' | 'busy' {
    const board = this.boards.get(boardId);
    if (!board?.emulator.request) return 'no-board';
    return board.emulator.request(path);
  }

  /**
   * Text typed on the phone panel of a Bluetooth or GSM module: it reaches the
   * module now, and the board as fast as the serial line carries it.
   */
  phone(id: string, text: string): void {
    this.peripherals.phone(id, text);
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
    for (const [id, status] of Object.entries(this.peripherals.status())) {
      if (result.readings[id]) Object.assign(result.readings[id], status);
    }
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
        ...(this.settingsChanged.has(id) ? { settings: this.settings.get(id) ?? '' } : {}),
        ...(board.http.length > 0 ? { http: board.http } : {}),
      };
      board.highTime.fill(0);
      board.serial = '';
      board.http = [];
      this.settingsChanged.delete(id);
    }
    const frame: SimulationFrame = { timeMs: this.time, result, boards };
    const messages = this.broker.takeLog();
    if (messages.length > 0) frame.mqtt = messages;
    if (this.probes.length > 0) {
      frame.trace = this.trace;
      this.trace = { probes: this.probes, times: [], values: this.probes.map(() => []) };
    }
    return frame;
  }
}
