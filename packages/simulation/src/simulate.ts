import { solveDc, type Device, type NpnTransistor, type Solution } from '@banglalab/circuit-engine';
import type { PhoneMessage } from './uart-devices';
import type { RadioStatus } from './lora';
import {
  CHIP_MODELS,
  chipInputs,
  chipOutputs,
  boardPinNumber,
  boardTerminals,
  isLogicChipPart,
  SEVEN_SEGMENTS,
  type SevenSegment,
  isProgrammable,
  terminalsOf,
  withoutBreadboards,
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
  LOGIC_HIGH_FRACTION,
  LOGIC_LOW_FRACTION,
  LOGIC_MAX_OUTPUT_CURRENT,
  L298N_INPUT_HIGH,
  L298N_INPUT_LOW,
  L298N_LOGIC_MIN,
  L298N_LOGIC_VOLTS,
  L298N_REGULATOR_DROPOUT,
  MIN_SUPPLY,
  ACS712_RANGE_AMPS,
  SIREN_ON_VOLTAGE,
  BME280_MAX_SUPPLY,
  GSM_MAX_SUPPLY,
  LED_RING_MAX_SUPPLY,
  LORA_MAX_SUPPLY,
  INA219_MAX_BUS,
  INA219_MAX_SHUNT_VOLTS,
  CELL_CUTOFF_VOLTS,
  CELL_OVERCHARGE_VOLTS,
  CELL_SHORT_AMPS,
  CHARGER_AMPS,
  CHARGER_MAX_INPUT,
  CHARGER_MIN_INPUT,
  CHARGER_MIN_PASS,
  CHARGER_OFF_PASS,
  CHARGER_TRICKLE_AMPS,
  CHARGER_TRICKLE_BELOW,
  CHARGER_VOLTS,
  PROTECTION_CUTOFF_VOLTS,
  PROTECTION_LOAD_GONE_VOLTS,
  PROTECTION_MAX_AMPS,
  PROTECTION_RELEASE_VOLTS,
  REGULATOR_DROP,
  REGULATOR_EFFICIENCY,
  REGULATOR_MAX_AMPS,
  REGULATOR_MAX_INPUT,
  REGULATOR_OFF,
  REGULATOR_OWN_AMPS,
  VOLTAGE_SENSOR_MAX,
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
  CHARGER_IDLE,
  CHIP_IDLE,
  REGULATOR_IDLE,
  type ChargerState,
  type RegulatorState,
  DRIVER_IDLE,
  IDLE_STATE,
  buildNetlist,
  netName,
  type ChipState,
  type CircuitState,
  type DriverState,
  type Netlist,
} from './netlist';

export type LedState = 'off' | 'on' | 'overcurrent' | 'burned' | 'reversed';

/** Of several LEDs in one case, the state to report: the worst any of them is in. */
function worstLed(each: readonly { state: LedState }[]): LedState {
  return (['burned', 'overcurrent', 'reversed', 'on', 'off'] as const).find((state) =>
    each.some((led) => led.state === state),
  )!;
}

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
  /** How bright each segment of a seven-segment display is, 0 to 1. */
  segments?: Record<SevenSegment, number>;
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
  /** A phone's conversation with a Bluetooth or GSM module. */
  phone?: { connected: boolean; messages: PhoneMessage[] };
  /** What an MP3 player is doing. */
  player?: { track: number; playing: boolean; volume: number; ready: boolean };
  /** A GSM module's network. */
  network?: { registered: boolean; signal: number };
  /**
   * What an OLED display is showing. `pixels` is the picture, 128 × 64, one bit
   * a pixel, row by row from the top with the leftmost pixel in the highest
   * bit, as base64; absent while the panel is dark. `brightness` is 0 to 1.
   */
  oled?: { lit: boolean; brightness: number; pixels?: string };
  /**
   * What an LED ring is showing: each LED's colour as 0xRRGGBB, from the one
   * nearest DIN, and an ESTIMATE of what the lit LEDs draw, in milliamperes.
   */
  ring?: { colours: number[]; milliamps: number };
  /**
   * What a colour display is showing. `pixels` is the picture, 240 × 240, two
   * bytes of RGB 565 a pixel (high byte first), row by row from the top, as
   * base64; absent while the backlight is off or the display has no power.
   */
  tft?: { lit: boolean; pixels?: string };
  /** What a LoRa radio is doing, how many packets it has sent and received, and the last signal. */
  radio?: RadioStatus;
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
  | 'chip-overvoltage'
  | 'chip-output-overcurrent'
  | 'logic-input-floating'
  | 'logic-oscillates'
  | 'voltage-sensor-overrange'
  | 'current-sensor-overrange'
  | 'cell-overcharge'
  | 'cell-overdischarge'
  | 'charger-input-high'
  | 'protection-tripped'
  | 'regulator-input-high'
  | 'regulator-overload'
  | 'regulator-dropout'
  | 'module-overvoltage'
  | 'gsm-overvoltage'
  | 'ring-overvoltage'
  | 'no-common-ground'
  | 'onewire-no-pullup'
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
   * For `voltage-sensor-overrange`: the voltage measured, and the module's rating.
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
  /** Which clock modules have their output HIGH in this state. */
  clocks: Record<string, boolean>;
  /** Each LED of an RGB LED module, keyed "RGB1.r". */
  channels: Record<string, Sample>;
  /** What each motor driver is doing in this state. */
  drivers: Record<string, DriverState>;
  /** What each logic chip is doing in this state. */
  chips: Record<string, ChipState>;
  /** What each sensor that depends on the circuit itself saw in this state. */
  sensing: Record<string, number>;
  /** What each charger module is doing in this state. */
  chargers: Record<string, ChargerState>;
  /** What each step-down regulator is doing in this state. */
  regulators: Record<string, RegulatorState>;
  limiting: Record<string, boolean>;
  /** Logic chip inputs joined to nothing at all, as "U1.p2". */
  floating: string[];
  /** True when the logic chips never settled: a circuit that keeps changing by itself. */
  unsettled: boolean;
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

/**
 * What each logic chip does for the voltages just solved: whether it has power,
 * the level it reads on each input (between the two thresholds an input keeps
 * the level it had), and what each gate's output is then.
 */
export function chipStates(
  document: CircuitDocument,
  solution: StateSolution,
  current: Readonly<Record<string, ChipState>>,
): Record<string, ChipState> {
  const next: Record<string, ChipState> = {};
  for (const component of document.components) {
    if (!isLogicChipPart(component)) continue;
    const before = current[component.id] ?? CHIP_IDLE;
    const model = CHIP_MODELS[component.props.chip];
    const at = (n: number) => solution.nodes[netName(component.pins[`p${n}`]!)] ?? 0;
    const ground = at(model.ground);
    const supply = at(model.supply) - ground;
    const powered = supply >= model.supplyRange[0];
    const inputs: Record<number, boolean> = {};
    for (const input of chipInputs(model)) {
      const volts = at(input) - ground;
      inputs[input] =
        volts > LOGIC_HIGH_FRACTION * supply
          ? true
          : volts < LOGIC_LOW_FRACTION * supply
            ? false
            : (before.inputs[input] ?? false);
    }
    // Without power a chip forgets what it held; it starts afresh when power comes back.
    if (!powered) {
      next[component.id] = { powered, inputs, outputs: {}, memory: [] };
      continue;
    }
    const step = model.step(inputs, before.powered ? before.inputs : {}, before.memory);
    next[component.id] = { powered, inputs, outputs: step.outputs, memory: step.memory };
  }
  return next;
}

/**
 * What each sensor whose output depends on the circuit is seeing in the voltages
 * just solved: the current through a current sensor, the supply of a TDS meter.
 */
export function sensorStates(
  document: CircuitDocument,
  solution: StateSolution,
): Record<string, number> {
  const next: Record<string, number> = {};
  for (const component of document.components) {
    if (component.type === 'acs712')
      next[component.id] = solution.parts[component.id]?.current ?? 0;
    if (component.type === 'tds' || component.type === 'temperature') {
      next[component.id] = solution.parts[component.id]?.supply ?? 0;
    }
  }
  return next;
}

/** Sensing states agree when no sensor's value moved by more than a microampere or microvolt. */
export const sameSensing = (
  a: Readonly<Record<string, number>>,
  b: Readonly<Record<string, number>>,
) => Object.keys(b).every((id) => Math.abs((a[id] ?? 0) - b[id]!) < 1e-6);

/**
 * What each TP4056 does for the voltages just solved. A linear charger: its pass
 * transistor is set to give the charge current, or is fully on when the input
 * cannot give that much; once the cell reaches 4.2 V it holds 4.2 V, drawing what
 * it gives from its input. Its protection cuts off the output below 2.4 V or past
 * about 3 A, and lets go once the cell is above 3.0 V and the load is gone.
 */
export function chargerStates(
  document: CircuitDocument,
  solution: StateSolution,
  current: Readonly<Record<string, ChargerState>>,
): Record<string, ChargerState> {
  const next: Record<string, ChargerState> = {};
  for (const component of document.components) {
    if (component.type !== 'tp4056') continue;
    const before = current[component.id] ?? CHARGER_IDLE;
    const at = (pin: keyof typeof component.pins) =>
      solution.nodes[netName(component.pins[pin])] ?? 0;
    const input = at('inp') - at('inn');
    const cell = at('bp') - at('bn');
    const charging = solution.parts[component.id]?.current ?? 0;
    const output = solution.channels[`${component.id}.out`];

    let tripped = before.tripped;
    if (!tripped) {
      const overloaded = Math.abs(output?.current ?? 0) > PROTECTION_MAX_AMPS;
      const emptied = cell > 0.5 && cell < PROTECTION_CUTOFF_VOLTS;
      tripped = overloaded || emptied;
    } else if (
      cell >= PROTECTION_RELEASE_VOLTS &&
      Math.abs(output?.voltage ?? 0) < PROTECTION_LOAD_GONE_VOLTS
    ) {
      tripped = false;
    }

    const target = cell < CHARGER_TRICKLE_BELOW ? CHARGER_TRICKLE_AMPS : CHARGER_AMPS;
    const starting = () => ({
      mode: 'pass' as const,
      ohms: Math.max(CHARGER_MIN_PASS, (input - cell) / target),
      amps: 0,
    });
    let state: Omit<ChargerState, 'tripped'>;
    if (before.mode === 'off') {
      state =
        input >= CHARGER_MIN_INPUT && input > cell + 0.05
          ? starting()
          : { mode: 'off', ohms: CHARGER_OFF_PASS, amps: 0 };
    } else if (before.mode === 'pass') {
      if (charging < -1e-6) {
        // The input has gone: the cell would feed it backwards.
        state = { mode: 'off', ohms: CHARGER_OFF_PASS, amps: 0 };
      } else if (cell > CHARGER_VOLTS) {
        state = { mode: 'hold', ohms: CHARGER_OFF_PASS, amps: charging };
      } else {
        const ohms = before.ohms * (Math.max(charging, 1e-9) / target);
        state = {
          mode: 'pass',
          ohms: Math.min(CHARGER_OFF_PASS, Math.max(CHARGER_MIN_PASS, ohms)),
          amps: charging,
        };
      }
    } else if (charging > target * 1.0001) {
      // The cell takes more than the charge current at 4.2 V: back to the current limit.
      state = starting();
    } else if (input < cell + 0.05) {
      // The input cannot keep up: the pass transistor is fully on.
      state =
        input < 1
          ? { mode: 'off', ohms: CHARGER_OFF_PASS, amps: 0 }
          : { mode: 'pass', ohms: CHARGER_MIN_PASS, amps: charging };
    } else {
      state = { mode: 'hold', ohms: CHARGER_OFF_PASS, amps: Math.max(0, charging) };
    }
    next[component.id] = { ...state, tripped };
  }
  return next;
}

export const sameChargers = (
  a: Readonly<Record<string, ChargerState>>,
  b: Readonly<Record<string, ChargerState>>,
) =>
  Object.keys(b).every((id) => {
    const x = a[id] ?? CHARGER_IDLE;
    const y = b[id]!;
    return (
      x.mode === y.mode &&
      x.tripped === y.tripped &&
      Math.abs(x.ohms / y.ohms - 1) < 1e-3 &&
      Math.abs(x.amps - y.amps) < 1e-5
    );
  });

/**
 * What each LM2596 does for the voltages just solved: the output it can make
 * from its input, and how heavy a load that input is for the power it gives.
 */
export function regulatorStates(
  document: CircuitDocument,
  solution: StateSolution,
): Record<string, RegulatorState> {
  const next: Record<string, RegulatorState> = {};
  for (const component of document.components) {
    if (component.type !== 'lm2596') continue;
    const reading = solution.parts[component.id];
    const input = reading?.supply ?? 0;
    const on = input >= MIN_SUPPLY.lm2596!;
    if (!on) {
      next[component.id] = REGULATOR_IDLE;
      continue;
    }
    const delivered = Math.max(0, (reading?.voltage ?? 0) * (reading?.current ?? 0));
    const drawn = delivered / REGULATOR_EFFICIENCY + input * REGULATOR_OWN_AMPS;
    next[component.id] = {
      on,
      volts: Math.max(0, Math.min(component.props.volts, input - REGULATOR_DROP)),
      inputOhms: Math.min(REGULATOR_OFF, Math.max(1, (input * input) / drawn)),
    };
  }
  return next;
}

export const sameRegulators = (
  a: Readonly<Record<string, RegulatorState>>,
  b: Readonly<Record<string, RegulatorState>>,
) =>
  Object.keys(b).every((id) => {
    const x = a[id] ?? REGULATOR_IDLE;
    const y = b[id]!;
    return (
      x.on === y.on &&
      Math.abs(x.volts - y.volts) < 1e-4 &&
      Math.abs(x.inputOhms / y.inputOhms - 1) < 1e-3
    );
  });

export function sameChips(
  a: Readonly<Record<string, ChipState>>,
  b: Readonly<Record<string, ChipState>>,
): boolean {
  return Object.entries(b).every(([id, state]) => {
    const other = a[id];
    if (!other || other.powered !== state.powered) return false;
    if (other.memory.join() !== state.memory.join()) return false;
    // A chip that remembers reads its inputs again until they settle too: the levels it
    // last read are what it compares with to see a clock's edge next time.
    if (
      state.memory.length &&
      !Object.entries(state.inputs).every(([pin, level]) => other.inputs[Number(pin)] === level)
    ) {
      return false;
    }
    return Object.entries(state.outputs).every(
      ([pin, level]) => other.outputs[Number(pin)] === level,
    );
  });
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
  let chips = state.chips ?? {};
  let sensing = state.sensing ?? {};
  let chargers = state.chargers ?? {};
  let regulators = state.regulators ?? {};
  let limiting = state.limiting ?? {};
  const supplies = document.components.filter(
    (c): c is Extract<typeof c, { type: 'battery' }> =>
      c.type === 'battery' && c.props.source === 'supply',
  );
  const hasCharger = document.components.some((c) => c.type === 'tp4056');
  const hasRegulator = document.components.some((c) => c.type === 'lm2596');
  // Parts whose output depends on something just solved: a current sensor's current, the
  // supply a TDS meter or a TMP36 has (they give nothing until it is enough).
  const hasSensor = document.components.some(
    (c) => c.type === 'acs712' || c.type === 'tds' || c.type === 'temperature',
  );
  const hasDriver = document.components.some((c) => c.type === 'l298n');
  const hasChip = document.components.some(isLogicChipPart);
  let solution: StateSolution | null = null;
  // A motor driver needs a few more rounds: its regulator, then its logic, then its outputs.
  // Logic chips need one round for each gate a signal passes through.
  // A charger or regulator finds its operating point over a few rounds too.
  const rounds =
    hasChip || hasCharger || hasRegulator ? 24 : hasDriver ? 12 : supplies.length > 0 ? 8 : 4;
  let settled = false;
  for (let round = 0; round < rounds; round++) {
    const netlist = buildNetlist(document, {
      ...state,
      relays,
      motion,
      drivers,
      chips,
      sensing,
      chargers,
      regulators,
      limiting,
    });
    const dc = solveDc(netlist.circuit);
    if (!dc.ok) return null;
    solution = readSolution(document, netlist, dc.solution, dc.iterations);
    const next = relayStates(document, solution, relays);
    // Whether a motion sensor is powered is only known once the circuit is solved.
    const moving = state.motion ?? motionOutputs(document, solution);
    const driving = hasDriver ? driverStates(document, solution, drivers) : drivers;
    const logic = hasChip ? chipStates(document, solution, chips) : chips;
    const seen = hasSensor ? sensorStates(document, solution) : sensing;
    const charging = hasCharger ? chargerStates(document, solution, chargers) : chargers;
    const regulating = hasRegulator ? regulatorStates(document, solution) : regulators;
    // A supply goes to its limit when its load would take more, and back when its
    // voltage would rise above the one it is set to.
    const limited: Record<string, boolean> = {};
    for (const supply of supplies) {
      const part = solution.parts[supply.id];
      const was = limiting[supply.id] ?? false;
      limited[supply.id] = was
        ? (part?.voltage ?? 0) < supply.props.voltage
        : (part?.current ?? 0) > (supply.props.limit ?? 1) * (1 + 1e-6);
    }
    solution.relays = next;
    solution.motion = moving;
    solution.clocks = { ...(state.clocks ?? {}) };
    solution.drivers = drivers;
    solution.chips = chips;
    solution.sensing = sensing;
    solution.chargers = chargers;
    solution.regulators = regulators;
    solution.limiting = limiting;
    if (
      sameStates(relays, next) &&
      sameStates(motion, moving) &&
      sameDrivers(drivers, driving) &&
      sameChips(chips, logic) &&
      sameSensing(sensing, seen) &&
      sameChargers(chargers, charging) &&
      sameRegulators(regulators, regulating) &&
      sameStates(limiting, limited)
    ) {
      settled = true;
      break;
    }
    relays = next;
    motion = moving;
    drivers = driving;
    chips = logic;
    sensing = seen;
    chargers = charging;
    regulators = regulating;
    limiting = limited;
  }
  // Gates that keep changing each other (a NOT gate fed its own output) never settle.
  if (solution && hasChip && !settled) solution.unsettled = true;
  return solution;
}

/**
 * Which net each place is on once wires are counted as joins: two places that
 * map to the same name are joined by wires and breadboard strips alone.
 */
function joinedByWires(document: CircuitDocument): (endpoint: string) => string {
  const parent = new Map<string, string>();
  const find = (key: string): string => {
    const up = parent.get(key) ?? key;
    if (up === key) return key;
    const root = find(up);
    parent.set(key, root);
    return root;
  };
  for (const wire of document.wires) {
    parent.set(find(netName(wire.from)), find(netName(wire.to)));
  }
  return (endpoint) => find(netName(endpoint));
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
    clocks: {},
    channels: {},
    drivers: {},
    chips: {},
    sensing: {},
    chargers: {},
    regulators: {},
    limiting: {},
    floating: [],
    unsettled: false,
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
      case 'soilmodule':
      case 'mq135':
      case 'mq7':
      case 'ph':
        result.parts[id] = {
          voltage: volts(component.pins.ao) - volts(component.pins.gnd),
          current: device?.current(solution) ?? 0,
          supply: volts(component.pins.vcc) - volts(component.pins.gnd),
        };
        break;
      case 'tds':
      case 'turbidity':
        result.parts[id] = {
          voltage: volts(component.pins.out) - volts(component.pins.gnd),
          current: device?.current(solution) ?? 0,
          supply: volts(component.pins.vcc) - volts(component.pins.gnd),
        };
        break;
      case 'cell': {
        // Its voltage, and the current into its + terminal: positive while it charges.
        result.parts[id] = {
          voltage: volts(component.pins.pos) - volts(component.pins.neg),
          current: device?.current(solution) ?? 0,
        };
        // Whether a charger looks after it: its + joined by wires to a charger's B+.
        const joined = joinedByWires(document);
        const pos = joined(component.pins.pos);
        const managed = document.components.some(
          (c) => c.type === 'tp4056' && joined(c.pins.bp) === pos,
        );
        result.channels[`${id}.charger`] = { voltage: managed ? 1 : 0, current: 0 };
        break;
      }
      case 'solar':
        // What it gives: its voltage and the current out of its + wire.
        result.parts[id] = {
          voltage: volts(component.pins.pos) - volts(component.pins.neg),
          current: device?.current(solution) ?? 0,
        };
        break;
      case 'tp4056': {
        // The cell's voltage, the charge current going into it, and the input.
        const holding = device?.kind === 'thevenin-source';
        const through = device?.current(solution) ?? 0;
        result.parts[id] = {
          voltage: volts(component.pins.bp) - volts(component.pins.bn),
          current: holding ? -through : through,
          supply: volts(component.pins.inp) - volts(component.pins.inn),
        };
        // Its protected output: the gap across the protection, and the current through it.
        const protect = netlist.circuit.devices.find((d) => d.id === `${id}:protect`);
        result.channels[`${id}.out`] = {
          voltage: volts(component.pins.outn) - volts(component.pins.bn),
          current: protect?.current(solution) ?? 0,
        };
        break;
      }
      case 'lm2596': {
        // Its output and the current it gives, and its input.
        const regulating = device?.kind === 'thevenin-source';
        result.parts[id] = {
          voltage: volts(component.pins.outp) - volts(component.pins.outn),
          current: regulating ? -(device?.current(solution) ?? 0) : 0,
          supply: volts(component.pins.inp) - volts(component.pins.inn),
        };
        break;
      }
      case 'ds18b20': {
        // Its supply decides whether it works; its DQ line shows whether it has a pull-up.
        const supply = volts(component.pins.vdd) - volts(component.pins.gnd);
        result.parts[id] = { voltage: supply, current: device?.current(solution) ?? 0, supply };
        result.channels[`${id}.dq`] = {
          voltage: volts(component.pins.dq) - volts(component.pins.gnd),
          current: 0,
        };
        break;
      }
      case 'bme280':
        // What decides whether it works: its supply.
        result.parts[id] = {
          voltage: volts(component.pins.vcc) - volts(component.pins.gnd),
          current: device?.current(solution) ?? 0,
          supply: volts(component.pins.vcc) - volts(component.pins.gnd),
        };
        break;
      case 'ina219': {
        // Its supply, the current through its shunt, and what its chip measures.
        const supply = volts(component.pins.vcc) - volts(component.pins.gnd);
        result.parts[id] = { voltage: supply, current: device?.current(solution) ?? 0, supply };
        result.channels[`${id}.shunt`] = {
          voltage: volts(component.pins.vinp) - volts(component.pins.vinm),
          current: device?.current(solution) ?? 0,
        };
        result.channels[`${id}.bus`] = {
          voltage: volts(component.pins.vinm) - volts(component.pins.gnd),
          current: 0,
        };
        break;
      }
      case 'voltagesensor':
        // What it measures, and its output: a fifth of that.
        result.parts[id] = {
          voltage: volts(component.pins.s) - volts(component.pins.gnd),
          current: device?.current(solution) ?? 0,
          supply: volts(component.pins.vin) - volts(component.pins.gnd),
        };
        break;
      case 'acs712':
        // Its output, the current it senses, and its supply.
        result.parts[id] = {
          voltage: volts(component.pins.out) - volts(component.pins.gnd),
          current: device?.current(solution) ?? 0,
          supply: volts(component.pins.vcc) - volts(component.pins.gnd),
        };
        break;
      case 'sevenseg': {
        let total = 0;
        let highest = 0;
        for (const segment of SEVEN_SEGMENTS) {
          const led = netlist.circuit.devices.find((d) => d.id === `${id}:${segment}`);
          const sample = {
            voltage: led?.voltage(solution) ?? 0,
            current: led?.current(solution) ?? 0,
          };
          result.channels[`${id}.${segment}`] = sample;
          total += sample.current;
          highest = Math.max(highest, sample.voltage);
        }
        result.parts[id] = { voltage: highest, current: total };
        break;
      }
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
          supply: volts(component.pins.vcc) - volts(component.pins.gnd),
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
  // A logic chip's reading is its supply and what it takes from it; each output's current is kept,
  // and an input joined to nothing at all is noted.
  for (const component of document.components) {
    if (!isLogicChipPart(component)) continue;
    const { id } = component;
    const pin = (n: number) => component.pins[`p${n}`]!;
    const model = CHIP_MODELS[component.props.chip];
    result.parts[id] = {
      voltage: volts(pin(model.supply)) - volts(pin(model.ground)),
      current: result.legs[`${id}.p${model.supply}`] ?? 0,
    };
    for (const gate of model.units) {
      for (const out of gate.outputs) {
        const output = netlist.circuit.devices.find((d) => d.id === `${id}:p${out}`);
        result.channels[`${id}.p${out}`] = {
          voltage: volts(pin(out)) - volts(pin(model.ground)),
          current: output?.current(solution) ?? 0,
        };
      }
      const touches = (n: number) => {
        const node = netlist.nodeOf(pin(n));
        return netlist.circuit.devices.filter(
          (d) => d.id !== `${id}:p${n}` && d.nodes.includes(node),
        ).length;
      };
      // Only for a gate that is in use: one of its pins is joined to something.
      const used = [...gate.inputs, ...gate.outputs].some((n) => touches(n) > 0);
      if (!used) continue;
      for (const input of gate.inputs) {
        if (touches(input) === 0) result.floating.push(`${id}.p${input}`);
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

    // Anything that can drive a current: a battery, a board, a cell or a solar panel.
    const sources = document.components.filter(
      (c) => c.type === 'battery' || c.type === 'cell' || c.type === 'solar' || isProgrammable(c),
    );
    if (sources.length === 0) result.diagnostics.push({ code: 'no-battery', severity: 'info' });
    for (const componentId of boardsWithoutCommonGround(document)) {
      result.diagnostics.push({ code: 'no-common-ground', severity: 'warning', componentId });
    }

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
      if (
        component.type === 'led' ||
        component.type === 'rgbled' ||
        component.type === 'sevenseg'
      ) {
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
        } else if (component.type === 'sevenseg') {
          // Eight LEDs: each is judged alone, and the worst one is reported.
          const each = SEVEN_SEGMENTS.map((segment) =>
            judge((s) => s.channels[`${id}.${segment}`]!),
          );
          reading.led = {
            state: worstLed(each),
            brightness: Math.max(...each.map((led) => led.brightness)),
          };
          reading.segments = Object.fromEntries(
            SEVEN_SEGMENTS.map((segment, i) => [segment, each[i]!.brightness]),
          ) as Record<SevenSegment, number>;
        } else {
          // Three LEDs in one case: each is judged alone, and the worst one is reported.
          const each = RGB_CHANNELS.map((channel) => judge((s) => s.channels[`${id}.${channel}`]!));
          reading.led = {
            state: worstLed(each),
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
      // A power supply at its current limit shows CC, as a bench supply's light does.
      if (component.type === 'battery' && component.props.source === 'supply') {
        reading.activity = average((s) => (s.limiting?.[id] ? 1 : 0)) >= 0.5 ? 1 : 0;
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
      } else if (component.type === 'clock') {
        // Its light follows its output, while it has power.
        const powered = reading.voltage >= MIN_SUPPLY.clock!;
        reading.activity = powered && average((s) => (s.clocks[id] ? 1 : 0)) >= 0.5 ? 1 : 0;
      } else if (
        component.type === 'ldrmodule' ||
        component.type === 'rain' ||
        component.type === 'soilmodule' ||
        component.type === 'mq135' ||
        component.type === 'mq7' ||
        component.type === 'ph'
      ) {
        // The module's second LED: lit while its comparator holds DO LOW.
        const supply = average((s) => s.parts[id]!.supply ?? 0);
        reading.activity =
          moduleTripped(component) && supply >= MODULE_COMPARATOR_MIN_SUPPLY ? 1 : 0;
      } else if (component.type === 'tp4056') {
        // Red while charging, blue once the current has fallen below a tenth: full.
        const input = average((s) => s.parts[id]!.supply ?? 0);
        const charging = average((s) => s.parts[id]!.current);
        reading.activity = input < CHARGER_MIN_INPUT ? 0 : charging >= CHARGER_AMPS / 10 ? 1 : 2;
      } else if (component.type === 'lm2596') {
        // Its power light.
        reading.activity = average((s) => s.parts[id]!.supply ?? 0) >= MIN_SUPPLY.lm2596! ? 1 : 0;
      } else if (component.type === 'siren') {
        // It sounds only with enough voltage the right way round.
        reading.activity = reading.voltage >= SIREN_ON_VOLTAGE ? 1 : 0;
      } else if (component.type === 'buzzer' || component.type === 'buzzermodule') {
        reading.activity = reading.voltage >= BUZZER_ON_VOLTAGE ? 1 : 0;
      } else if (component.type === 'motor') {
        const turning = Math.abs(reading.voltage) >= MOTOR_START_VOLTAGE;
        reading.activity = turning
          ? Math.max(-1, Math.min(1, reading.voltage / MOTOR_RATED_VOLTAGE))
          : 0;
      }
      if (isLogicChipPart(component)) {
        // A chip above its highest supply (6 V for a 74HC chip), or an output asked for more
        // than 25 mA, is being damaged.
        const supply = extreme((s) => s.parts[id]!.voltage, Math.max);
        const limit = CHIP_MODELS[component.props.chip].supplyRange[1];
        if (supply > limit) {
          result.diagnostics.push({
            code: 'chip-overvoltage',
            severity: 'error',
            componentId: id,
            volts: supply,
            limit,
          });
        }
        for (const out of chipOutputs(CHIP_MODELS[component.props.chip])) {
          const key = `${id}.p${out}`;
          const peak = extreme((s) => Math.abs(s.channels[key]?.current ?? 0), Math.max);
          if (peak > LOGIC_MAX_OUTPUT_CURRENT) {
            result.diagnostics.push({
              code: 'chip-output-overcurrent',
              severity: 'error',
              componentId: id,
              socket: `p${out}`,
            });
          }
        }
        const floating = new Set(states.flatMap(([s]) => s.floating));
        for (const leg of floating) {
          if (!leg.startsWith(`${id}.`)) continue;
          result.diagnostics.push({
            code: 'logic-input-floating',
            severity: 'warning',
            componentId: id,
            socket: leg.slice(id.length + 1),
          });
        }
      }
      if (component.type === 'voltagesensor') {
        const measured = extreme((s) => s.parts[id]!.supply ?? 0, Math.max);
        if (measured > VOLTAGE_SENSOR_MAX) {
          result.diagnostics.push({
            code: 'voltage-sensor-overrange',
            severity: 'warning',
            componentId: id,
            volts: measured,
            limit: VOLTAGE_SENSOR_MAX,
          });
        }
      }
      if (component.type === 'cell') {
        const highest = extreme((s) => s.parts[id]!.voltage, Math.max);
        const lowest = extreme((s) => s.parts[id]!.voltage, Math.min);
        const charging = extreme((s) => s.parts[id]!.current, Math.max);
        const delivering = extreme((s) => s.parts[id]!.current, Math.min);
        const peak = extreme((s) => Math.abs(s.parts[id]!.current), Math.max);
        if (peak > CELL_SHORT_AMPS) {
          result.diagnostics.push({ code: 'short-circuit', severity: 'error', componentId: id });
        } else if (
          charging > 0.01 &&
          (highest > CELL_OVERCHARGE_VOLTS ||
            // Charged by something with nothing to stop it at 4.2 V: it will be overcharged.
            (charging > 0.05 && !states.every(([s]) => s.channels[`${id}.charger`]?.voltage)))
        ) {
          result.diagnostics.push({
            code: 'cell-overcharge',
            severity: 'error',
            componentId: id,
            volts: highest,
            limit: CHARGER_VOLTS,
          });
        } else if (lowest < CELL_CUTOFF_VOLTS && delivering < -0.01) {
          result.diagnostics.push({
            code: 'cell-overdischarge',
            severity: 'warning',
            componentId: id,
            volts: lowest,
            limit: CELL_CUTOFF_VOLTS,
          });
        }
      }
      if (component.type === 'tp4056') {
        const input = extreme((s) => s.parts[id]!.supply ?? 0, Math.max);
        if (input > CHARGER_MAX_INPUT) {
          result.diagnostics.push({
            code: 'charger-input-high',
            severity: 'error',
            componentId: id,
            volts: input,
            limit: CHARGER_MAX_INPUT,
          });
        }
        if (states.some(([s]) => s.chargers[id]?.tripped)) {
          result.diagnostics.push({
            code: 'protection-tripped',
            severity: 'warning',
            componentId: id,
          });
        }
      }
      if (component.type === 'lm2596') {
        const input = extreme((s) => s.parts[id]!.supply ?? 0, Math.max);
        const lowest = extreme((s) => s.parts[id]!.supply ?? 0, Math.min);
        const load = extreme((s) => s.parts[id]!.current, Math.max);
        if (input > REGULATOR_MAX_INPUT) {
          result.diagnostics.push({
            code: 'regulator-input-high',
            severity: 'error',
            componentId: id,
            volts: input,
            limit: REGULATOR_MAX_INPUT,
          });
        }
        if (load > REGULATOR_MAX_AMPS) {
          result.diagnostics.push({
            code: 'regulator-overload',
            severity: 'warning',
            componentId: id,
          });
        }
        if (
          lowest >= MIN_SUPPLY.lm2596! &&
          lowest - REGULATOR_DROP < component.props.volts - 0.01
        ) {
          result.diagnostics.push({
            code: 'regulator-dropout',
            severity: 'warning',
            componentId: id,
            volts: lowest,
            limit: component.props.volts + REGULATOR_DROP,
          });
        }
      }
      if (component.type === 'ds18b20') {
        // Powered, joined to a board pin, and its line never HIGH: no pull-up.
        const supply = average((s) => s.parts[id]!.supply ?? 0);
        const line = extreme((s) => s.channels[`${id}.dq`]?.voltage ?? 0, Math.max);
        const onBoard = joinedByWires(document)(component.pins.dq);
        const toPin = document.components.some(
          (c) =>
            isProgrammable(c) &&
            boardTerminals(c.type).some((t) => joinedByWires(document)(`${c.id}.${t}`) === onBoard),
        );
        if (supply >= MIN_SUPPLY.ds18b20! && toPin && line < supply / 2) {
          result.diagnostics.push({
            code: 'onewire-no-pullup',
            severity: 'warning',
            componentId: id,
          });
        }
      }
      if (component.type === 'bme280') {
        const supply = extreme((s) => s.parts[id]!.supply ?? 0, Math.max);
        if (supply > BME280_MAX_SUPPLY) {
          result.diagnostics.push({
            code: 'module-overvoltage',
            severity: 'error',
            componentId: id,
            volts: supply,
            limit: BME280_MAX_SUPPLY,
          });
        }
      }
      if (component.type === 'gsm') {
        // The SIM800L runs from a lithium cell's voltage: 5 V harms it (SIMCom's limit is 4.4 V).
        // Its part is its supply load, so its voltage is its supply.
        const supply = extreme((s) => s.parts[id]!.voltage, Math.max);
        if (supply > GSM_MAX_SUPPLY) {
          result.diagnostics.push({
            code: 'gsm-overvoltage',
            severity: 'error',
            componentId: id,
            volts: supply,
            limit: GSM_MAX_SUPPLY,
          });
        }
      }
      if (component.type === 'lora') {
        // Ai-Thinker gives 3.7 V as the most the Ra-02 takes: 5 V harms it.
        const supply = extreme((s) => s.parts[id]!.voltage, Math.max);
        if (supply > LORA_MAX_SUPPLY) {
          result.diagnostics.push({
            code: 'module-overvoltage',
            severity: 'error',
            componentId: id,
            volts: supply,
            limit: LORA_MAX_SUPPLY,
          });
        }
      }
      if (component.type === 'ledring') {
        // The WS2812B's datasheet gives 5.3 V as the most it takes.
        const supply = extreme((s) => s.parts[id]!.voltage, Math.max);
        if (supply > LED_RING_MAX_SUPPLY) {
          result.diagnostics.push({
            code: 'ring-overvoltage',
            severity: 'error',
            componentId: id,
            volts: supply,
            limit: LED_RING_MAX_SUPPLY,
          });
        }
      }
      if (component.type === 'ina219') {
        const shunt = extreme((s) => Math.abs(s.channels[`${id}.shunt`]?.voltage ?? 0), Math.max);
        const bus = extreme((s) => s.channels[`${id}.bus`]?.voltage ?? 0, Math.max);
        if (shunt > INA219_MAX_SHUNT_VOLTS) {
          result.diagnostics.push({
            code: 'current-sensor-overrange',
            severity: 'warning',
            componentId: id,
          });
        }
        if (bus > INA219_MAX_BUS) {
          result.diagnostics.push({
            code: 'voltage-sensor-overrange',
            severity: 'warning',
            componentId: id,
            volts: bus,
            limit: INA219_MAX_BUS,
          });
        }
      }
      if (component.type === 'acs712') {
        const amps = extreme((s) => Math.abs(s.parts[id]!.current), Math.max);
        if (amps > ACS712_RANGE_AMPS[component.props.range]) {
          result.diagnostics.push({
            code: 'current-sensor-overrange',
            severity: 'warning',
            componentId: id,
          });
        }
      }
      // A module wired to a supply that is too low for it: it looks connected and does nothing.
      // The voltage sensor's "supply" is what it measures, so it has no least supply.
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

    if (states.some(([s]) => s.unsettled)) {
      const chip = document.components.find(isLogicChipPart);
      result.diagnostics.push({
        code: 'logic-oscillates',
        severity: 'warning',
        componentId: chip?.id,
      });
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
 * Boards joined by a wire between their pins whose grounds are not joined. A
 * signal from one board means nothing to the other without a shared ground:
 * on real boards it works by chance, or not at all. Returns the second board
 * of each such pair.
 */
function boardsWithoutCommonGround(document: CircuitDocument): string[] {
  const boards = document.components.filter(isProgrammable);
  if (boards.length < 2) return [];
  const parent = new Map<string, string>();
  const find = (net: string): string => {
    let root = net;
    while (parent.has(root)) root = parent.get(root)!;
    return root;
  };
  for (const wire of document.wires) {
    const a = find(netName(wire.from));
    const b = find(netName(wire.to));
    if (a !== b) parent.set(a, b);
  }
  const netOf = (endpoint: string) => find(netName(endpoint));
  const signalNets = (board: (typeof boards)[number]) =>
    new Set(
      boardTerminals(board.type)
        .filter((pin) => boardPinNumber(board.type, pin) !== null)
        .map((pin) => netOf(`${board.id}.${pin}`)),
    );
  const flagged: string[] = [];
  for (let i = 0; i < boards.length; i++) {
    for (let j = i + 1; j < boards.length; j++) {
      const [a, b] = [boards[i]!, boards[j]!];
      if (netOf(`${a.id}.gnd`) === netOf(`${b.id}.gnd`)) continue;
      const fromA = signalNets(a);
      if ([...signalNets(b)].some((net) => fromA.has(net))) flagged.push(b.id);
    }
  }
  return flagged;
}

/**
 * Solves the settled behaviour of a circuit and explains what it found: what a
 * meter shows after everything has stopped changing (capacitors fully charged).
 * Pure and synchronous. To follow a program or a capacitor through time use `SimulationSession`.
 */
export function simulate(
  circuit: CircuitDocument,
  state: CircuitState = IDLE_STATE,
): SimulationResult {
  const document = withoutBreadboards(circuit);
  const observation = new Observation();
  if (document.components.length > 0) observation.add(solveState(document, state), 1);
  const timeDependent = document.components.some((c) => c.type === 'capacitor');
  return observation.interpret(document, { timeDependent });
}
