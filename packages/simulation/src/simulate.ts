import { solveDc, type Device, type NpnTransistor, type Solution } from '@banglalab/circuit-engine';
import {
  boardTerminals,
  isProgrammable,
  terminalsOf,
  type CircuitDocument,
} from '@banglalab/shared';
import { BOARD_MODELS } from './boards';
import {
  BUZZER_ON_VOLTAGE,
  LED_BURN_CURRENT,
  LED_FORWARD_VOLTAGE,
  LED_MAX_CURRENT,
  LED_RATED_CURRENT,
  LED_VISIBLE_CURRENT,
  L298N_INPUT_HIGH,
  L298N_INPUT_LOW,
  L298N_LOGIC_MIN,
  L298N_LOGIC_VOLTS,
  L298N_REGULATOR_DROPOUT,
  MIN_SUPPLY,
  MODULE_COMPARATOR_MIN_SUPPLY,
  MOTOR_RATED_VOLTAGE,
  MOTOR_START_VOLTAGE,
  RELAY_DROP_OUT_CURRENT,
  RELAY_MODULE_DROP_OUT,
  RELAY_MODULE_HOLD_VOLTS,
  RELAY_MODULE_PULL_IN,
  RELAY_PULL_IN_CURRENT,
  RGB_CHANNELS,
  moduleTripped,
  type RgbChannel,
} from './library';
import {
  DRIVER_IDLE,
  IDLE_STATE,
  buildNetlist,
  netName,
  type CircuitState,
  type DriverState,
  type Netlist,
} from './netlist';

export type LedState = 'off' | 'on' | 'overcurrent' | 'burned' | 'reversed';

export interface Reading {
  /**
   * Volts across the part, averaged over the observed time. LED: anode minus
   * cathode. Battery or board: at its supply terminals. Potentiometer: end to end.
   */
  voltage: number;
  /** Average amperes through the part. For a battery or board: the current it delivers. */
  current: number;
  /** Average watts dissipated (or delivered, for a battery or board). */
  power: number;
  /** For LEDs. For an RGB LED: the worst state and the brightest of its three. */
  led?: { state: LedState; brightness: number };
  /** Only for an RGB LED: how bright each of its three LEDs is, 0 to 1. */
  rgb?: Record<RgbChannel, number>;
  /**
   * For parts that do something you can see or hear: 1 while a buzzer sounds, a
   * relay's contact is closed, a sensor module's indicator is lit or a motion
   * sensor's output is HIGH; and a motor's speed from −1 (full speed backwards) to 1.
   */
  activity?: number;
  /** Servo horn position in degrees (0-180), once a program has set it. */
  angle?: number;
  /** What a character LCD is showing: its two lines of sixteen characters. */
  lcd?: { lines: [string, string] };
  /**
   * What an OLED display is showing. `pixels` is the picture, 128 × 64, one bit
   * a pixel, row by row from the top with the leftmost pixel in the highest
   * bit, as base64; absent while the panel is dark. `brightness` is 0 to 1.
   */
  oled?: { lit: boolean; brightness: number; pixels?: string };
}

export type DiagnosticCode =
  | 'no-battery'
  | 'open-circuit'
  | 'short-circuit'
  | 'supply-short'
  | 'led-reversed'
  | 'led-overcurrent'
  | 'led-burned'
  | 'led-bypassed'
  | 'led-low-voltage'
  | 'legs-in-same-strip'
  | 'pin-overcurrent'
  | 'pin-overvoltage'
  | 'module-underpowered'
  | 'supply-backfeed'
  | 'relay-low-trigger'
  | 'solver-failed';

export interface Diagnostic {
  code: DiagnosticCode;
  severity: 'info' | 'warning' | 'error';
  /** The part the message is about, when there is one. */
  componentId?: string;
  /** For `pin-overcurrent` and `pin-overvoltage`: the board socket, e.g. "d13". */
  socket?: string;
  /**
   * For `pin-overvoltage`: the highest voltage seen on the pin, and what the pin can stand.
   * For `module-underpowered`: the module's supply, and the least it works on.
   * For `supply-backfeed`: the voltage a board's supply pin is being fed from outside.
   */
  volts?: number;
  limit?: number;
}

export interface SimulationResult {
  /** False only when the solver could not find an answer. */
  ok: boolean;
  readings: Record<string, Reading>;
  /** Average amperes in each wire; positive means flowing from `from` to `to`. */
  wireCurrents: Record<string, number>;
  /** Board sockets in use, keyed "UNO1.d13": volts above GND and amperes flowing out of the socket. */
  sockets: Record<string, { voltage: number; current: number }>;
  /**
   * Average volts above ground at every net that something is connected to,
   * keyed by `netName`. A hole that is missing here is joined to nothing.
   */
  nodeVoltages: Record<string, number>;
  /**
   * Average amperes flowing into each part through each of its legs, keyed
   * "R1.a" or "UNO1.d13". A part's legs add up to zero: what goes in comes out.
   */
  legCurrents: Record<string, number>;
  diagnostics: Diagnostic[];
  iterations: number;
}

interface Sample {
  voltage: number;
  current: number;
  /** For a module whose `voltage` is its output signal: what it is supplied with. */
  supply?: number;
}

/** The circuit solved for one instant: one combination of pin levels and button presses. */
export interface StateSolution {
  parts: Record<string, Sample>;
  wires: Record<string, number>;
  sockets: Record<string, Sample>;
  /** Volts at every net, by net name. */
  nodes: Record<string, number>;
  /** Amperes into each part through each leg, keyed "R1.a". */
  legs: Record<string, number>;
  /** Batteries pushed below half their voltage, or a board supply past its limit. */
  shorted: string[];
  /** True when any source is delivering or absorbing a noticeable current. */
  delivering: boolean;
  bridged: string[];
  /** Which relay contacts are closed in this state. */
  relays: Record<string, boolean>;
  /** Which motion sensors have their output HIGH in this state. */
  motion: Record<string, boolean>;
  /** Each LED of an RGB LED module, keyed "RGB1.r". */
  channels: Record<string, Sample>;
  /** What each motor driver is doing in this state. */
  drivers: Record<string, DriverState>;
  iterations: number;
}

/** A battery pushed below half its voltage is feeding less resistance than its own. */
const SHORT_CIRCUIT_SAG = 0.5;
const NEGLIGIBLE_CURRENT = 1e-6;
const REVERSED_VOLTAGE = -0.5;
/** Below this a module's supply legs are taken as not wired up yet, and nothing is said. */
const UNPOWERED_VOLTS = 0.5;

/**
 * Works out which relay contacts should be closed for the coil currents just
 * solved. A closed contact holds on until its coil current drops well below
 * the level needed to close it.
 */
export function relayStates(
  document: CircuitDocument,
  solution: StateSolution,
  current: Readonly<Record<string, boolean>>,
): Record<string, boolean> {
  const next: Record<string, boolean> = {};
  for (const component of document.components) {
    if (component.type === 'relaymodule') {
      // The optocoupler's LED current decides; the coil also needs enough supply.
      const led = Math.abs(solution.channels[`${component.id}.opto`]?.current ?? 0);
      const supply = solution.parts[component.id]?.voltage ?? 0;
      next[component.id] = current[component.id]
        ? led > RELAY_MODULE_DROP_OUT && supply > RELAY_MODULE_HOLD_VOLTS
        : led >= RELAY_MODULE_PULL_IN && supply >= MIN_SUPPLY.relaymodule!;
      continue;
    }
    if (component.type !== 'relay') continue;
    const coil = Math.abs(solution.parts[component.id]?.current ?? 0);
    next[component.id] = current[component.id]
      ? coil > RELAY_DROP_OUT_CURRENT
      : coil >= RELAY_PULL_IN_CURRENT;
  }
  return next;
}

/**
 * What each motor driver does for the voltages just solved: how much its
 * regulator can make from its supply, whether its logic has enough to work, and
 * the level on each input. A voltage between LOW and HIGH leaves an input as it was.
 */
export function driverStates(
  document: CircuitDocument,
  solution: StateSolution,
  current: Readonly<Record<string, DriverState>>,
): Record<string, DriverState> {
  const next: Record<string, DriverState> = {};
  for (const component of document.components) {
    if (component.type !== 'l298n') continue;
    const before = current[component.id] ?? DRIVER_IDLE;
    const ground = solution.nodes[netName(`${component.id}.gnd`)] ?? 0;
    const volts = (terminal: string) =>
      (solution.nodes[netName(`${component.id}.${terminal}`)] ?? ground) - ground;
    const level = (terminal: keyof DriverState['inputs']) => {
      const seen = volts(terminal);
      if (seen > L298N_INPUT_HIGH) return true;
      if (seen < L298N_INPUT_LOW) return false;
      return before.inputs[terminal];
    };
    next[component.id] = {
      rail: Math.min(L298N_LOGIC_VOLTS, Math.max(0, volts('vs') - L298N_REGULATOR_DROPOUT)),
      awake: volts('5v') >= L298N_LOGIC_MIN,
      inputs: {
        in1: level('in1'),
        in2: level('in2'),
        in3: level('in3'),
        in4: level('in4'),
        ena: level('ena'),
        enb: level('enb'),
      },
    };
  }
  return next;
}

/** True when two sets of driver states are the same to within a few millivolts. */
export function sameDrivers(
  a: Readonly<Record<string, DriverState>>,
  b: Readonly<Record<string, DriverState>>,
): boolean {
  return Object.entries(b).every(([id, state]) => {
    const other = a[id];
    return (
      other !== undefined &&
      Math.abs(other.rail - state.rail) < 0.003 &&
      other.awake === state.awake &&
      Object.entries(state.inputs).every(
        ([name, value]) => other.inputs[name as keyof DriverState['inputs']] === value,
      )
    );
  });
}

/**
 * A motion sensor's output when nothing is keeping time: HIGH while something
 * moves in front of a powered sensor.
 */
function motionOutputs(document: CircuitDocument, solution: StateSolution) {
  const next: Record<string, boolean> = {};
  for (const component of document.components) {
    if (component.type !== 'pir') continue;
    const powered = (solution.parts[component.id]?.voltage ?? 0) >= MIN_SUPPLY.pir!;
    next[component.id] = component.props.motion && powered;
  }
  return next;
}

const sameStates = (a: Readonly<Record<string, boolean>>, b: Readonly<Record<string, boolean>>) =>
  Object.keys(b).every((id) => Boolean(a[id]) === b[id]);

/**
 * Solves the settled (DC) circuit for one state. Returns null when no solution
 * exists. Relays are re-solved until their contacts agree with their coil
 * currents; a relay wired to interrupt its own coil never agrees, so the
 * search stops after a few rounds with the last answer.
 */
export function solveState(document: CircuitDocument, state: CircuitState): StateSolution | null {
  let relays = state.relays ?? {};
  let motion = state.motion ?? {};
  let drivers = state.drivers ?? {};
  const hasDriver = document.components.some((c) => c.type === 'l298n');
  let solution: StateSolution | null = null;
  // A motor driver needs a few more rounds: its regulator, then its logic, then its outputs.
  for (let round = 0; round < (hasDriver ? 12 : 4); round++) {
    const netlist = buildNetlist(document, { ...state, relays, motion, drivers });
    const dc = solveDc(netlist.circuit);
    if (!dc.ok) return null;
    solution = readSolution(document, netlist, dc.solution, dc.iterations);
    const next = relayStates(document, solution, relays);
    // Whether a motion sensor is powered is only known once the circuit is solved.
    const moving = state.motion ?? motionOutputs(document, solution);
    const driving = hasDriver ? driverStates(document, solution, drivers) : drivers;
    solution.relays = next;
    solution.motion = moving;
    solution.drivers = drivers;
    if (sameStates(relays, next) && sameStates(motion, moving) && sameDrivers(drivers, driving)) {
      break;
    }
    relays = next;
    motion = moving;
    drivers = driving;
  }
  return solution;
}

/** Turns solver output back into per-part, per-wire and per-socket values. */
export function readSolution(
  document: CircuitDocument,
  netlist: Netlist,
  solution: Solution,
  iterations: number,
): StateSolution {
  const volts = (endpoint: string) => {
    const node = netlist.nodeOf(endpoint);
    return node < 0 ? 0 : solution.voltage(node);
  };

  const result: StateSolution = {
    parts: {},
    wires: {},
    sockets: {},
    nodes: {},
    legs: {},
    shorted: [],
    delivering: false,
    bridged: netlist.bridgedParts,
    relays: {},
    motion: {},
    channels: {},
    drivers: {},
    iterations,
  };

  for (const [socket, device] of netlist.socketDevice) {
    // Both pin models report current flowing into the board as positive; flip it.
    const current = -device.current(solution);
    result.sockets[socket] = { voltage: device.voltage(solution), current };
    if (Math.abs(current) > NEGLIGIBLE_CURRENT) result.delivering = true;
  }

  for (const component of document.components) {
    const { id } = component;
    const device = netlist.partDevice.get(id);
    switch (component.type) {
      case 'battery': {
        const current = device ? -device.current(solution) : 0;
        const voltage = volts(`${id}.pos`) - volts(`${id}.neg`);
        result.parts[id] = { voltage, current };
        if (Math.abs(current) > NEGLIGIBLE_CURRENT) result.delivering = true;
        if (current > 0 && voltage < component.props.voltage * SHORT_CIRCUIT_SAG) {
          result.shorted.push(id);
        }
        break;
      }
      case 'uno':
      case 'esp32': {
        const model = BOARD_MODELS[component.type];
        let current = 0;
        for (const terminal of boardTerminals(component.type)) {
          current += Math.max(0, result.sockets[`${id}.${terminal}`]?.current ?? 0);
        }
        const main = model.supplies[0]!;
        const supply = result.sockets[`${id}.${main.terminal}`];
        result.parts[id] = { voltage: supply?.voltage ?? main.volts, current };
        const overloaded = model.supplies.some(
          (s) => (result.sockets[`${id}.${s.terminal}`]?.current ?? 0) > s.maxCurrent,
        );
        if (overloaded) result.shorted.push(id);
        break;
      }
      case 'potentiometer':
        result.parts[id] = {
          voltage: volts(component.pins.a) - volts(component.pins.b),
          current: device?.current(solution) ?? 0,
        };
        break;
      case 'button':
      case 'switch':
        // Open contacts have no device, but the voltage across them is still meaningful.
        result.parts[id] = {
          voltage: volts(component.pins.a) - volts(component.pins.b),
          current: device?.current(solution) ?? 0,
        };
        break;
      case 'relaymodule': {
        // What it takes from its supply, and what its input sees.
        const fromSupply = ['', ':coil', ...(component.props.trigger === 'low' ? [':optoR'] : [])]
          .map((suffix) => netlist.circuit.devices.find((d) => d.id === `${id}${suffix}`))
          .reduce((sum, d) => sum + (d?.current(solution) ?? 0), 0);
        result.parts[id] = {
          voltage: volts(component.pins.vcc) - volts(component.pins.gnd),
          current: fromSupply,
        };
        const led = netlist.circuit.devices.find((d) => d.id === `${id}:opto`);
        result.channels[`${id}.opto`] = {
          voltage: led?.voltage(solution) ?? 0,
          current: led?.current(solution) ?? 0,
        };
        result.channels[`${id}.in`] = {
          voltage: volts(component.pins.in) - volts(component.pins.gnd),
          current: 0,
        };
        break;
      }
      case 'dht11':
      case 'pir':
        // A digital sensor: what is shown is its supply, which decides whether it works.
        result.parts[id] = {
          voltage: volts(component.pins.vcc) - volts(component.pins.gnd),
          current: device?.current(solution) ?? 0,
        };
        break;
      case 'ldrmodule':
      case 'rain':
      case 'mq135':
        result.parts[id] = {
          voltage: volts(component.pins.ao) - volts(component.pins.gnd),
          current: device?.current(solution) ?? 0,
          supply: volts(component.pins.vcc) - volts(component.pins.gnd),
        };
        break;
      case 'rgbled': {
        let total = 0;
        let highest = 0;
        for (const channel of RGB_CHANNELS) {
          const led = netlist.circuit.devices.find((d) => d.id === `${id}:${channel}`);
          const sample = {
            voltage: led?.voltage(solution) ?? 0,
            current: led?.current(solution) ?? 0,
          };
          result.channels[`${id}.${channel}`] = sample;
          total += sample.current;
          highest = Math.max(highest, sample.voltage);
        }
        result.parts[id] = { voltage: highest, current: total };
        break;
      }
      case 'temperature':
      case 'soil':
      case 'ir':
        // What matters for a sensor is its output signal; the current is what it draws.
        result.parts[id] = {
          voltage: volts(component.pins.out) - volts(component.pins.gnd),
          current: device?.current(solution) ?? 0,
        };
        break;
      default:
        result.parts[id] = {
          voltage: device?.voltage(solution) ?? 0,
          current: device?.current(solution) ?? 0,
        };
    }
  }

  for (const wire of document.wires) {
    result.wires[wire.id] = netlist.wireDevice.get(wire.id)?.current(solution) ?? 0;
  }

  for (const [name, node] of netlist.nodeNames) result.nodes[name] = solution.voltage(node);

  // Current into a device at one of its nodes. A device's current runs from its first
  // terminal to its second; a transistor has a collector and a base current, and the
  // emitter carries both back out.
  const entering = (device: Device, node: number): number => {
    const [first, second, third] = device.nodes;
    if (third !== undefined && 'baseCurrent' in device) {
      const collector = device.current(solution);
      const base = (device as NpnTransistor).baseCurrent(solution);
      return (
        (first === node ? collector : 0) +
        (second === node ? base : 0) -
        (third === node ? collector + base : 0)
      );
    }
    const current = device.current(solution);
    return (first === node ? current : 0) - (second === node ? current : 0);
  };
  for (const component of document.components) {
    const { id } = component;
    if (component.type === 'battery') {
      const current = netlist.partDevice.get(id)?.current(solution) ?? 0;
      result.legs[`${id}.pos`] = current;
      result.legs[`${id}.neg`] = -current;
    } else if (isProgrammable(component)) {
      let total = 0;
      for (const [socket, device] of netlist.socketDevice) {
        if (!socket.startsWith(`${id}.`)) continue;
        result.legs[socket] = device.current(solution);
        total += result.legs[socket];
      }
      // Whatever goes into the board through its pins comes back out through ground.
      result.legs[`${id}.gnd`] = -total;
    } else {
      // A part may be several devices (a potentiometer is two resistors): add up those at each leg.
      const own = netlist.circuit.devices.filter(
        (device) => device.id === id || device.id.startsWith(`${id}:`),
      );
      const counted = new Set<number>();
      // Legs in breadboard holes, or the terminals of a module that sits beside the board.
      const legs: [string, string][] =
        'pins' in component
          ? Object.entries(component.pins)
          : terminalsOf(component).map((terminal) => [terminal, `${id}.${terminal}`]);
      for (const [pin, hole] of legs) {
        const node = netlist.nodeOf(hole);
        // Legs sharing a strip share a node; its current is reported once, on the first of them.
        const fresh = node >= 0 && !counted.has(node);
        counted.add(node);
        result.legs[`${id}.${pin}`] = fresh
          ? own.reduce((sum, device) => sum + entering(device, node), 0)
          : 0;
      }
    }
  }
  // A motor driver's current is everything it takes from its supply: its own, and its motors'.
  for (const component of document.components) {
    if (component.type !== 'l298n') continue;
    const sample = result.parts[component.id];
    if (sample) sample.current = result.legs[`${component.id}.vs`] ?? 0;
  }
  return result;
}

/**
 * What was observed over a stretch of time: each state the circuit was in and
 * for how long. A circuit without a running program has a single state.
 */
export class Observation {
  private readonly durations = new Map<StateSolution, number>();
  private failed = false;

  get isEmpty(): boolean {
    return this.durations.size === 0 && !this.failed;
  }

  add(solution: StateSolution | null, duration: number): void {
    if (solution === null) this.failed = true;
    else if (duration > 0) {
      this.durations.set(solution, (this.durations.get(solution) ?? 0) + duration);
    }
  }

  /** Summarises the observation as readings and plain diagnostics. */
  interpret(document: CircuitDocument, options: { timeDependent: boolean }): SimulationResult {
    const result: SimulationResult = {
      ok: !this.failed,
      readings: {},
      wireCurrents: {},
      sockets: {},
      nodeVoltages: {},
      legCurrents: {},
      diagnostics: [],
      iterations: 0,
    };
    if (this.failed) {
      result.diagnostics.push({ code: 'solver-failed', severity: 'error' });
      return result;
    }
    const states = [...this.durations];
    const total = states.reduce((sum, [, duration]) => sum + duration, 0);
    if (total === 0) return result;

    /** Time-weighted average of a value across the observed states. */
    const average = (pick: (s: StateSolution) => number) =>
      states.length === 1
        ? pick(states[0]![0]) // steady circuit: exact, no rounding from the weighting
        : states.reduce((sum, [s, duration]) => sum + pick(s) * duration, 0) / total;
    const extreme = (pick: (s: StateSolution) => number, best: (...v: number[]) => number) =>
      best(...states.map(([s]) => pick(s)));
    const first = states[0]![0];
    result.iterations = first.iterations;

    for (const componentId of first.bridged) {
      result.diagnostics.push({ code: 'legs-in-same-strip', severity: 'warning', componentId });
    }

    const sources = document.components.filter((c) => c.type === 'battery' || isProgrammable(c));
    if (sources.length === 0) result.diagnostics.push({ code: 'no-battery', severity: 'info' });

    const shorted = new Set(states.flatMap(([s]) => s.shorted));
    for (const componentId of shorted) {
      const isBoard = document.components.some((c) => c.id === componentId && isProgrammable(c));
      result.diagnostics.push({
        code: isBoard ? 'supply-short' : 'short-circuit',
        severity: 'error',
        componentId,
      });
    }

    for (const socket of Object.keys(first.sockets)) {
      const voltage = average((s) => s.sockets[socket]!.voltage);
      const current = average((s) => s.sockets[socket]!.current);
      result.sockets[socket] = { voltage, current };
      const [componentId, name] = socket.split('.') as [string, string];
      const peak = extreme((s) => Math.abs(s.sockets[socket]!.current), Math.max);
      const owner = document.components.find((c) => c.id === componentId);
      const model = owner && isProgrammable(owner) ? BOARD_MODELS[owner.type] : null;
      const isSupply = model?.supplies.some((s) => s.terminal === name) ?? false;
      if (model && !isSupply && peak > model.maxPinCurrent) {
        result.diagnostics.push({
          code: 'pin-overcurrent',
          severity: 'error',
          componentId,
          socket: name,
        });
      }
      // A supply pin that is being fed from outside, while the board has its own supply too.
      if (model?.supplies.some((s) => s.terminal === name && s.behindDiode) && current < -0.001) {
        result.diagnostics.push({
          code: 'supply-backfeed',
          severity: 'warning',
          componentId,
          socket: name,
          volts: voltage,
        });
      }
      // A 5 V signal on a 3.3 V board's pin: the commonest way to destroy one.
      const highest = extreme((s) => s.sockets[socket]!.voltage, Math.max);
      if (model && !isSupply && !model.grounds.includes(name) && highest > model.maxPinVoltage) {
        result.diagnostics.push({
          code: 'pin-overvoltage',
          severity: 'error',
          componentId,
          socket: name,
          volts: highest,
          limit: model.maxPinVoltage,
        });
      }
    }

    let reversedLed = false;
    for (const component of document.components) {
      const { id } = component;
      if (!(id in first.parts)) continue;
      const reading: Reading = {
        voltage: average((s) => s.parts[id]!.voltage),
        current: average((s) => s.parts[id]!.current),
        power: average((s) => s.parts[id]!.voltage * s.parts[id]!.current),
      };
      if (component.type === 'led' || component.type === 'rgbled') {
        // Damage depends on the worst instant; brightness on the average (as the eye sees PWM).
        const judge = (pick: (s: StateSolution) => Sample) => {
          const current = average((s) => pick(s).current);
          const peak = extreme((s) => pick(s).current, Math.max);
          const lowest = extreme((s) => pick(s).voltage, Math.min);
          let state: LedState = 'off';
          if (peak > LED_BURN_CURRENT) state = 'burned';
          else if (peak > LED_MAX_CURRENT) state = 'overcurrent';
          else if (current >= LED_VISIBLE_CURRENT) state = 'on';
          else if (lowest < REVERSED_VOLTAGE) state = 'reversed';
          const lit = state === 'on' || state === 'overcurrent';
          return {
            state,
            brightness: lit ? Math.min(1, Math.sqrt(current / LED_RATED_CURRENT)) : 0,
          };
        };
        if (component.type === 'led') {
          reading.led = judge((s) => s.parts[id]!);
        } else {
          // Three LEDs in one case: each is judged alone, and the worst one is reported.
          const each = RGB_CHANNELS.map((channel) => judge((s) => s.channels[`${id}.${channel}`]!));
          const worst = (['burned', 'overcurrent', 'reversed', 'on', 'off'] as const).find((s) =>
            each.some((led) => led.state === s),
          )!;
          reading.led = {
            state: worst,
            brightness: Math.max(...each.map((led) => led.brightness)),
          };
          reading.rgb = { r: each[0]!.brightness, g: each[1]!.brightness, b: each[2]!.brightness };
        }
        const { state } = reading.led;
        if (state === 'reversed') {
          reversedLed = true;
          result.diagnostics.push({ code: 'led-reversed', severity: 'warning', componentId: id });
        } else if (state === 'burned') {
          result.diagnostics.push({ code: 'led-burned', severity: 'error', componentId: id });
        } else if (state === 'overcurrent') {
          result.diagnostics.push({
            code: 'led-overcurrent',
            severity: 'warning',
            componentId: id,
          });
        }
      }
      if (component.type === 'relay' || component.type === 'relaymodule') {
        reading.activity = average((s) => (s.relays[id] ? 1 : 0)) >= 0.5 ? 1 : 0;
        // A LOW-trigger module whose IN only gets a 3.3 V HIGH: on some modules a 3.3 V
        // pin cannot switch it off. The lab's model does switch off; it says so plainly.
        if (component.type === 'relaymodule' && component.props.trigger === 'low') {
          const highest = extreme((s) => s.channels[`${id}.in`]?.voltage ?? 0, Math.max);
          if (highest > 2.5 && highest < 4) {
            result.diagnostics.push({
              code: 'relay-low-trigger',
              severity: 'warning',
              componentId: id,
            });
          }
        }
      } else if (component.type === 'l298n') {
        // Its light: on while its logic has power.
        reading.activity = average((s) => (s.drivers[id]?.awake ? 1 : 0)) >= 0.5 ? 1 : 0;
      } else if (component.type === 'pir') {
        reading.activity = average((s) => (s.motion[id] ? 1 : 0)) >= 0.5 ? 1 : 0;
      } else if (
        component.type === 'ldrmodule' ||
        component.type === 'rain' ||
        component.type === 'mq135'
      ) {
        // The module's second LED: lit while its comparator holds DO LOW.
        const supply = average((s) => s.parts[id]!.supply ?? 0);
        reading.activity =
          moduleTripped(component) && supply >= MODULE_COMPARATOR_MIN_SUPPLY ? 1 : 0;
      } else if (component.type === 'buzzer') {
        reading.activity = reading.voltage >= BUZZER_ON_VOLTAGE ? 1 : 0;
      } else if (component.type === 'motor') {
        const turning = Math.abs(reading.voltage) >= MOTOR_START_VOLTAGE;
        reading.activity = turning
          ? Math.max(-1, Math.min(1, reading.voltage / MOTOR_RATED_VOLTAGE))
          : 0;
      }
      // A module wired to a supply that is too low for it: it looks connected and does nothing.
      const least = MIN_SUPPLY[component.type];
      if (least !== undefined) {
        const supply = average((s) => s.parts[id]!.supply ?? s.parts[id]!.voltage);
        if (supply > UNPOWERED_VOLTS && supply < least) {
          result.diagnostics.push({
            code: 'module-underpowered',
            severity: 'warning',
            componentId: id,
            volts: supply,
            limit: least,
          });
        }
      }
      result.readings[id] = reading;
    }

    for (const wire of document.wires) {
      result.wireCurrents[wire.id] = average((s) => s.wires[wire.id] ?? 0);
    }
    for (const name of Object.keys(first.nodes)) {
      result.nodeVoltages[name] = average((s) => s.nodes[name] ?? 0);
    }
    for (const leg of Object.keys(first.legs)) {
      result.legCurrents[leg] = average((s) => s.legs[leg] ?? 0);
    }

    // The "why is this LED dark?" explanations assume a steady circuit. While a program is
    // running an LED is often dark simply because its pin is LOW, and a charged capacitor
    // rightly stops the current, so in those cases they are held back.
    const delivering = states.some(([s]) => s.delivering);
    let underpowered = false;
    if (shorted.size === 0 && !options.timeDependent) {
      for (const component of document.components) {
        if (component.type !== 'led' || first.bridged.includes(component.id)) continue;
        const reading = result.readings[component.id];
        if (reading?.led?.state !== 'off') continue;
        const forwardBiased = reading.voltage > LED_FORWARD_VOLTAGE[component.props.color] * 0.3;
        if (forwardBiased) underpowered = true;
        else if (!delivering) continue; // nothing flows anywhere: reported once as an open circuit
        result.diagnostics.push({
          code: forwardBiased ? 'led-low-voltage' : 'led-bypassed',
          severity: 'warning',
          componentId: component.id,
        });
      }
    }

    const hasLoad = document.components.length > sources.length || document.wires.length > 0;
    if (
      sources.length > 0 &&
      hasLoad &&
      !delivering &&
      shorted.size === 0 &&
      !reversedLed &&
      !underpowered &&
      !options.timeDependent
    ) {
      result.diagnostics.push({ code: 'open-circuit', severity: 'info' });
    }
    return result;
  }
}

/**
 * Solves the settled behaviour of a circuit and explains what it found: what a
 * meter shows after everything has stopped changing (capacitors fully charged).
 * Pure and synchronous. To follow a program or a capacitor through time use `SimulationSession`.
 */
export function simulate(
  document: CircuitDocument,
  state: CircuitState = IDLE_STATE,
): SimulationResult {
  const observation = new Observation();
  if (document.components.length > 0) observation.add(solveState(document, state), 1);
  const timeDependent = document.components.some((c) => c.type === 'capacitor');
  return observation.interpret(document, { timeDependent });
}
