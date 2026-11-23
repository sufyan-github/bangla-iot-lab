import type { PinDrive } from '@banglalab/board-emulators';
import {
  THERMAL_VOLTAGE,
  capacitor,
  currentSource,
  diode,
  npnTransistor,
  resistor,
  theveninSource,
  type Circuit,
  type Device,
} from '@banglalab/circuit-engine';
import {
  L298N_TERMINALS,
  LOGIC_CHIP_GATES,
  boardPinNumber,
  boardTerminals,
  isHole,
  isProgrammable,
  stripOf,
  type CircuitDocument,
} from '@banglalab/shared';
import { BOARD_MODELS } from './boards';
import {
  BATTERY_INTERNAL_RESISTANCE,
  BUZZER_RESISTANCE,
  CONTACT_RESISTANCE,
  DHT11_PULLUP_RESISTANCE,
  DHT11_SUPPLY_RESISTANCE,
  L298N_INPUT_RESISTANCE,
  L298N_JUMPER_RESISTANCE,
  L298N_JUNCTION,
  L298N_LOGIC_RESISTANCE,
  L298N_REST_RESISTANCE,
  L298N_SINK_RESISTANCE,
  L298N_SOURCE_RESISTANCE,
  LOGIC_INPUT_RESISTANCE,
  LOGIC_OUTPUT_RESISTANCE,
  LOGIC_QUIESCENT_RESISTANCE,
  LDR_MODULE_RESISTANCE,
  MODULE_DO_LOW_RESISTANCE,
  MODULE_DO_PULLUP,
  MOTOR_RESISTANCE,
  MQ135_HEATER_RESISTANCE,
  MQ7_HEATER_RESISTANCE,
  LINE_SENSOR_HIGH_RESISTANCE,
  LINE_SENSOR_LOW_RESISTANCE,
  LINE_SENSOR_SUPPLY_RESISTANCE,
  SIREN_RESISTANCE,
  CELL_RESISTANCE,
  BME280_SUPPLY_RESISTANCE,
  DS18B20_DQ_LEAK,
  GPS_SUPPLY_RESISTANCE,
  BLUETOOTH_SUPPLY_RESISTANCE,
  MP3_SUPPLY_RESISTANCE,
  GSM_SUPPLY_RESISTANCE,
  GSM_TX_VOLTS,
  PMS_SUPPLY_RESISTANCE,
  UART_TX_RESISTANCE,
  UART_TX_VOLTS,
  DS18B20_SUPPLY_RESISTANCE,
  I2C_MODULE_PULLUP,
  INA219_SHUNT,
  INA219_SUPPLY_RESISTANCE,
  CHARGER_OFF_PASS,
  CHARGER_VOLTS,
  PROTECTION_OPEN,
  PROTECTION_RESISTANCE,
  REGULATOR_OFF,
  REGULATOR_OUTPUT_RESISTANCE,
  SOLAR_DIODE,
  SOLAR_LIGHT_AMPS,
  SOLAR_SERIES_RESISTANCE,
  SOLAR_SHUNT_RESISTANCE,
  cellVolts,
  ACS712_OUTPUT_RESISTANCE,
  ACS712_PATH_RESISTANCE,
  ACS712_SUPPLY_RESISTANCE,
  MIN_SUPPLY,
  TDS_OUTPUT_RESISTANCE,
  TDS_SUPPLY_RESISTANCE,
  TURBIDITY_OUTPUT_RESISTANCE,
  TURBIDITY_SUPPLY_RESISTANCE,
  VOLTAGE_SENSOR_LOWER,
  VOLTAGE_SENSOR_UPPER,
  acs712OutputFraction,
  tdsVolts,
  turbidityVolts,
  PIR_OUTPUT_RESISTANCE,
  PIR_OUTPUT_VOLTS,
  PIR_SUPPLY_RESISTANCE,
  RGB_CHANNELS,
  RGB_FORWARD_VOLTAGE,
  NPN_TRANSISTOR,
  MODULE_SUPPLY_RESISTANCE,
  OLED_PULLUP_RESISTANCE,
  OLED_SUPPLY_RESISTANCE,
  LED_RING_OHMS_PER_LED,
  TFT_SUPPLY_RESISTANCE,
  RELAY_COIL_RESISTANCE,
  RELAY_MODULE_COIL_RESISTANCE,
  RELAY_MODULE_IDLE_RESISTANCE,
  RELAY_MODULE_OPTO_FORWARD,
  RELAY_MODULE_OPTO_RESISTANCE,
  SENSOR_RESISTANCE,
  SILICON_DIODE,
  WIRE_RESISTANCE,
  diodeModelFor,
  ldrResistance,
  ledDiodeModel,
  moduleOutputFraction,
  moduleTripped,
  sensorOutputFraction,
} from './library';

/** An ultrasonic module's echo output is a 5 V signal whatever board reads it. */
const ECHO_HIGH_VOLTS = 5;

/** Everything that changes while a circuit runs, without the circuit itself being edited. */
export interface CircuitState {
  /** Ids of the push buttons being held down. */
  pressed: readonly string[];
  /** What each pin of each board is driving. A board not listed has all pins as inputs. */
  boards: Readonly<Record<string, readonly PinDrive[]>>;
  /** Voltage each capacitor currently holds; a capacitor not listed is discharged. */
  stored?: Readonly<Record<string, number>>;
  /** Relays whose contact is closed at the moment. */
  relays?: Readonly<Record<string, boolean>>;
  /** Ultrasonic sensors whose echo output is HIGH at the moment. */
  echo?: Readonly<Record<string, boolean>>;
  /**
   * Motion sensors whose output is HIGH at the moment. A running session keeps
   * this, because the output stays HIGH for a while after the movement. When it
   * is absent the output simply follows the movement, on a powered sensor.
   */
  motion?: Readonly<Record<string, boolean>>;
  /**
   * What each motor driver is doing. It follows from the circuit's own voltages
   * (the driver's supply and the levels on its inputs), so whoever solves the
   * circuit works it out, starting from here.
   */
  drivers?: Readonly<Record<string, DriverState>>;
  /** What each logic chip is doing: like a driver, worked out from the circuit's own voltages. */
  chips?: Readonly<Record<string, ChipState>>;
  /**
   * What a sensor whose output depends on the circuit itself is seeing: for a
   * current sensor the current through it in amperes, for a TDS meter its supply
   * in volts. Worked out from the circuit's own voltages, like a driver's state.
   */
  sensing?: Readonly<Record<string, number>>;
  /** What each charger module is doing; worked out from the circuit's own voltages. */
  chargers?: Readonly<Record<string, ChargerState>>;
  /** What each step-down regulator is doing; worked out likewise. */
  regulators?: Readonly<Record<string, RegulatorState>>;
}

/**
 * A TP4056 at one instant. `pass` charging through its pass transistor, of
 * `ohms`; `hold` holding the cell at 4.2 V while the input supplies `amps`.
 * `tripped` is its protection, which has cut off the output.
 */
export interface ChargerState {
  mode: 'off' | 'pass' | 'hold';
  ohms: number;
  amps: number;
  tripped: boolean;
}
export const CHARGER_IDLE: ChargerState = {
  mode: 'off',
  ohms: CHARGER_OFF_PASS,
  amps: 0,
  tripped: false,
};

/** An LM2596 at one instant: the output it can make, and the load its input is. */
export interface RegulatorState {
  on: boolean;
  volts: number;
  inputOhms: number;
}
export const REGULATOR_IDLE: RegulatorState = { on: false, volts: 0, inputOhms: REGULATOR_OFF };

/** A logic chip at one instant: whether it has power, and the level of each pin it reads or drives. */
export interface ChipState {
  powered: boolean;
  /** The level last read on each input pin, by pin number. */
  inputs: Readonly<Record<number, boolean>>;
  /** The level each output pin drives, by pin number. */
  outputs: Readonly<Record<number, boolean>>;
}

export const CHIP_IDLE: ChipState = { powered: false, inputs: {}, outputs: {} };

/** A motor driver module at one instant. */
export interface DriverState {
  /** The voltage its regulator is aiming its 5 V output at; less when the supply is too low. */
  rail: number;
  /** True when its logic has enough voltage to work at all. */
  awake: boolean;
  /** The levels it sees on IN1 to IN4 and on the two enable pins. */
  inputs: Readonly<Record<'in1' | 'in2' | 'in3' | 'in4' | 'ena' | 'enb', boolean>>;
}

export const DRIVER_IDLE: DriverState = {
  rail: 0,
  awake: false,
  inputs: { in1: false, in2: false, in3: false, in4: false, ena: false, enb: false },
};

/** How far the regulator's reference sits above its output: the pass transistor's base drop. */
const REGULATOR_BASE_DROP = 0.745;

/** A device that only reports a voltage and a current worked out from other devices. */
function meter(
  id: string,
  positive: number,
  negative: number,
  current: (solution: Parameters<Device['current']>[0]) => number,
): Device {
  return {
    id,
    kind: 'resistor',
    nodes: [positive, negative],
    branchCount: 0,
    branch: -1,
    reset() {},
    stamp: () => false,
    voltage: (s) => s.voltage(positive) - s.voltage(negative),
    current,
  };
}

export const IDLE_STATE: CircuitState = { pressed: [], boards: {} };

export interface Netlist {
  circuit: Circuit;
  /** The solver device that carries each part's current (for a potentiometer: lead a to wiper). */
  partDevice: Map<string, Device>;
  wireDevice: Map<string, Device>;
  /** Board sockets that have something plugged in, keyed "UNO1.d13". */
  socketDevice: Map<string, Device>;
  /** Solver node of a hole or terminal, or -1 if nothing in the circuit touches it. */
  nodeOf(endpoint: string): number;
  /** Every node by the name of its net (see `netName`); ground is node 0. */
  nodeNames: ReadonlyMap<string, number>;
  /** Parts whose leads all sit in one strip, so the board shorts them out. */
  bridgedParts: string[];
}

/** The electrical net an endpoint belongs to: a board strip or a terminal. */
/** Each serial module's supply load. */
const SERIAL_SUPPLY_RESISTANCE = {
  gps: GPS_SUPPLY_RESISTANCE,
  pms5003: PMS_SUPPLY_RESISTANCE,
  bluetooth: BLUETOOTH_SUPPLY_RESISTANCE,
  mp3: MP3_SUPPLY_RESISTANCE,
  gsm: GSM_SUPPLY_RESISTANCE,
} as const;

export function netName(endpoint: string): string {
  if (isHole(endpoint)) return stripOf(endpoint);
  // A board's ground sockets are the same piece of copper.
  return `terminal:${endpoint.replace(/\.gnd[12]$/, '.gnd')}`;
}

/**
 * Translates what the student built into nodes and devices.
 *
 * Board strips and terminals become nodes. Wires become small resistors rather
 * than merging nodes, so the current in each wire is known. Ground (0 V) is the
 * board's GND if there is a board, otherwise the first battery's negative terminal.
 */
export function buildNetlist(document: CircuitDocument, state: CircuitState = IDLE_STATE): Netlist {
  const nodes = new Map<string, number>();
  let nodeCount = 1;
  const node = (endpoint: string): number => {
    const net = netName(endpoint);
    let index = nodes.get(net);
    if (index === undefined) {
      index = nodeCount++;
      nodes.set(net, index);
    }
    return index;
  };

  const reference =
    document.components.find(isProgrammable) ??
    document.components.find((c) => c.type === 'battery');
  if (reference) {
    nodes.set(netName(`${reference.id}.${reference.type === 'battery' ? 'neg' : 'gnd'}`), 0);
  }
  // A part of the circuit not joined to the reference is solved against the lowest-numbered
  // node it has. Numbering every board's ground, then every battery's negative, first makes
  // that node the second board's GND (or its battery's −), so its voltages read as they would
  // on a meter held against its own ground.
  for (const component of document.components) {
    if (isProgrammable(component)) node(`${component.id}.gnd`);
  }
  for (const component of document.components) {
    if (component.type === 'battery') node(`${component.id}.neg`);
  }

  const wired = new Set(document.wires.flatMap((w) => [w.from, w.to]).map(netName));
  const devices: Device[] = [];
  const partDevice = new Map<string, Device>();
  const wireDevice = new Map<string, Device>();
  const socketDevice = new Map<string, Device>();
  const bridgedParts: string[] = [];
  const add = <D extends Device>(device: D): D => {
    devices.push(device);
    return device;
  };

  for (const component of document.components) {
    const { id } = component;
    if ('pins' in component) {
      const pinNodes = Object.values(component.pins).map(node);
      if (new Set(pinNodes).size === 1) bridgedParts.push(id);
    }
    switch (component.type) {
      case 'battery':
        partDevice.set(
          id,
          add(
            theveninSource(
              id,
              node(`${id}.pos`),
              node(`${id}.neg`),
              component.props.voltage,
              BATTERY_INTERNAL_RESISTANCE,
            ),
          ),
        );
        break;
      case 'resistor':
        partDevice.set(
          id,
          add(
            resistor(
              id,
              node(component.pins.a),
              node(component.pins.b),
              component.props.resistance,
            ),
          ),
        );
        break;
      case 'led':
        partDevice.set(
          id,
          add(
            diode(
              id,
              node(component.pins.anode),
              node(component.pins.cathode),
              ledDiodeModel(component.props.color),
            ),
          ),
        );
        break;
      case 'capacitor':
        partDevice.set(
          id,
          add(
            capacitor(
              id,
              node(component.pins.a),
              node(component.pins.b),
              component.props.capacitance,
              state.stored?.[id] ?? 0,
            ),
          ),
        );
        break;
      case 'button':
      case 'switch': {
        const a = node(component.pins.a);
        const b = node(component.pins.b);
        const closed =
          component.type === 'switch' ? component.props.closed : state.pressed.includes(id);
        if (closed) partDevice.set(id, add(resistor(id, a, b, CONTACT_RESISTANCE)));
        break;
      }
      case 'diode':
        partDevice.set(
          id,
          add(diode(id, node(component.pins.anode), node(component.pins.cathode), SILICON_DIODE)),
        );
        break;
      case 'ldr':
        partDevice.set(
          id,
          add(
            resistor(
              id,
              node(component.pins.a),
              node(component.pins.b),
              ldrResistance(component.props.light),
            ),
          ),
        );
        break;
      case 'siren':
        partDevice.set(
          id,
          add(resistor(id, node(component.pins.pos), node(component.pins.neg), SIREN_RESISTANCE)),
        );
        break;
      case 'linesensor': {
        // Its supply current, and each output driven HIGH over black, LOW over white.
        const supply = node(component.pins.vcc);
        const ground = node(component.pins.gnd);
        partDevice.set(id, add(resistor(id, supply, ground, LINE_SENSOR_SUPPLY_RESISTANCE)));
        (['s1', 's2', 's3', 's4', 's5'] as const).forEach((pin, i) => {
          const out = node(component.pins[pin]);
          add(
            component.props.black[i]
              ? resistor(`${id}:${pin}`, supply, out, LINE_SENSOR_HIGH_RESISTANCE)
              : resistor(`${id}:${pin}`, out, ground, LINE_SENSOR_LOW_RESISTANCE),
          );
        });
        break;
      }
      case 'buzzer':
        partDevice.set(
          id,
          add(resistor(id, node(component.pins.pos), node(component.pins.neg), BUZZER_RESISTANCE)),
        );
        break;
      case 'motor':
        partDevice.set(
          id,
          add(resistor(id, node(component.pins.a), node(component.pins.b), MOTOR_RESISTANCE)),
        );
        break;
      case 'transistor':
        partDevice.set(
          id,
          add(
            npnTransistor(
              id,
              node(component.pins.collector),
              node(component.pins.base),
              node(component.pins.emitter),
              NPN_TRANSISTOR,
            ),
          ),
        );
        break;
      case 'servo':
      case 'ultrasonic':
      case 'jsnsr04t':
      case 'lcd': {
        // Electrically these modules are a supply load; their signal pins are read by the
        // peripheral models in the session rather than by the circuit solver.
        const [supply, ground] =
          component.type === 'lcd'
            ? [component.pins.vdd, component.pins.vss]
            : [component.pins.vcc, component.pins.gnd];
        partDevice.set(
          id,
          add(resistor(id, node(supply), node(ground), MODULE_SUPPLY_RESISTANCE[component.type])),
        );
        if (component.type === 'ultrasonic' || component.type === 'jsnsr04t') {
          const echo = node(component.pins.echo);
          add(
            state.echo?.[id]
              ? theveninSource(`${id}:echo`, echo, node(ground), ECHO_HIGH_VOLTS, 100)
              : resistor(`${id}:echo`, echo, node(ground), 100),
          );
        }
        break;
      }
      case 'relay':
        partDevice.set(
          id,
          add(
            resistor(
              id,
              node(component.pins.coil1),
              node(component.pins.coil2),
              RELAY_COIL_RESISTANCE,
            ),
          ),
        );
        if (state.relays?.[id]) {
          add(
            resistor(
              `${id}:contact`,
              node(component.pins.com),
              node(component.pins.no),
              CONTACT_RESISTANCE,
            ),
          );
        }
        break;
      case 'dht11': {
        // A supply load, and the module's pull-up on the data line. What the sensor
        // sends on that line is timed pulses, delivered to the board by the session.
        const supply = node(component.pins.vcc);
        partDevice.set(
          id,
          add(resistor(id, supply, node(component.pins.gnd), DHT11_SUPPLY_RESISTANCE)),
        );
        add(resistor(`${id}:pullup`, supply, node(component.pins.data), DHT11_PULLUP_RESISTANCE));
        break;
      }
      case 'l298n': {
        const driver = state.drivers?.[id] ?? DRIVER_IDLE;
        const terminal = Object.fromEntries(
          L298N_TERMINALS.map((name) => [name, node(`${id}.${name}`)]),
        ) as Record<(typeof L298N_TERMINALS)[number], number>;
        const { vs, gnd } = terminal;
        const logic = terminal['5v'];
        // What the module takes at rest. It is also the device its supply is read from.
        partDevice.set(id, add(resistor(id, vs, gnd, L298N_REST_RESISTANCE)));
        add(resistor(`${id}:logic`, logic, gnd, L298N_LOGIC_RESISTANCE));
        // The regulator: a pass transistor from the motor supply, held to a reference,
        // so that what the 5 V terminal gives is taken from the supply and not from nowhere.
        if (driver.rail > 0) {
          const reference = node(`${id}:reference`);
          add(
            theveninSource(
              `${id}:reference`,
              reference,
              gnd,
              driver.rail + REGULATOR_BASE_DROP,
              10,
            ),
          );
          add(npnTransistor(`${id}:regulator`, vs, reference, logic, NPN_TRANSISTOR));
        }
        const channels = [
          { enable: 'ena', jumper: component.props.enaJumper, halves: ['1', '2'] },
          { enable: 'enb', jumper: component.props.enbJumper, halves: ['3', '4'] },
        ] as const;
        for (const channel of channels) {
          const enable = terminal[channel.enable];
          // The jumper joins the enable pin to the module's 5 V; without it the pin is an input.
          add(
            channel.jumper
              ? resistor(`${id}:${channel.enable}`, enable, logic, L298N_JUMPER_RESISTANCE)
              : resistor(`${id}:${channel.enable}`, enable, gnd, L298N_INPUT_RESISTANCE),
          );
          const on = driver.awake && driver.inputs[channel.enable];
          for (const half of channel.halves) {
            const input = terminal[`in${half}`];
            const output = terminal[`out${half}`];
            add(resistor(`${id}:in${half}`, input, gnd, L298N_INPUT_RESISTANCE));
            if (!on) {
              // Switched off, an output is let go: only a trace of leakage holds it.
              add(resistor(`${id}:out${half}`, output, gnd, 10_000_000));
            } else if (driver.inputs[`in${half}`]) {
              // Joined to the motor supply: it can give current, never take it.
              const inner = node(`${id}:high${half}`);
              add(diode(`${id}:out${half}`, vs, inner, L298N_JUNCTION));
              add(resistor(`${id}:high${half}`, inner, output, L298N_SOURCE_RESISTANCE));
            } else {
              // Joined to ground: it can take current, never give it.
              const inner = node(`${id}:low${half}`);
              add(diode(`${id}:out${half}`, output, inner, L298N_JUNCTION));
              add(resistor(`${id}:low${half}`, inner, gnd, L298N_SINK_RESISTANCE));
            }
          }
        }
        break;
      }
      case 'logic': {
        // Inputs take almost nothing; a powered chip's outputs are its supply or its
        // ground through a small resistance, so what they give is taken from its supply.
        const chip = state.chips?.[id] ?? CHIP_IDLE;
        const pin = (n: number) => node(component.pins[`p${n}`]!);
        const supply = pin(14);
        const ground = pin(7);
        partDevice.set(id, add(resistor(id, supply, ground, LOGIC_QUIESCENT_RESISTANCE)));
        for (const gate of LOGIC_CHIP_GATES[component.props.chip].gates) {
          for (const input of gate.inputs) {
            add(resistor(`${id}:p${input}`, pin(input), ground, LOGIC_INPUT_RESISTANCE));
          }
          const out = gate.output;
          if (chip.powered && out in chip.outputs) {
            add(
              resistor(
                `${id}:p${out}`,
                pin(out),
                chip.outputs[out] ? supply : ground,
                LOGIC_OUTPUT_RESISTANCE,
              ),
            );
          } else {
            // An unpowered chip's outputs are let go.
            add(resistor(`${id}:p${out}`, pin(out), ground, LOGIC_INPUT_RESISTANCE));
          }
        }
        break;
      }
      case 'relaymodule': {
        // The module's own load, its coil while it is energised, the optocoupler's
        // LED on the input side of the jumper, and the contact.
        const supply = node(component.pins.vcc);
        const ground = node(component.pins.gnd);
        const input = node(component.pins.in);
        const energised = state.relays?.[id] ?? false;
        partDevice.set(id, add(resistor(id, supply, ground, RELAY_MODULE_IDLE_RESISTANCE)));
        if (energised) {
          add(resistor(`${id}:coil`, supply, ground, RELAY_MODULE_COIL_RESISTANCE));
        }
        const middle = node(`${id}:opto`);
        const led = diodeModelFor(RELAY_MODULE_OPTO_FORWARD);
        if (component.props.trigger === 'low') {
          // IN pulled LOW lets current flow from VCC through the LED into the pin.
          add(resistor(`${id}:optoR`, supply, middle, RELAY_MODULE_OPTO_RESISTANCE));
          add(diode(`${id}:opto`, middle, input, led));
        } else {
          // IN HIGH sends current through the LED to ground.
          add(resistor(`${id}:optoR`, input, middle, RELAY_MODULE_OPTO_RESISTANCE));
          add(diode(`${id}:opto`, middle, ground, led));
        }
        add(
          resistor(
            `${id}:contact`,
            node(component.pins.com),
            node(energised ? component.pins.no : component.pins.nc),
            CONTACT_RESISTANCE,
          ),
        );
        break;
      }
      case 'oled': {
        // A supply load, and the module's pull-ups on the two bus lines. What travels on
        // the bus is handed to the display by the session, an exchange at a time.
        const supply = node(component.pins.vcc);
        partDevice.set(
          id,
          add(resistor(id, supply, node(component.pins.gnd), OLED_SUPPLY_RESISTANCE)),
        );
        add(resistor(`${id}:scl`, supply, node(component.pins.scl), OLED_PULLUP_RESISTANCE));
        add(resistor(`${id}:sda`, supply, node(component.pins.sda), OLED_PULLUP_RESISTANCE));
        break;
      }
      case 'ledring':
        // A supply load, about 1 mA an LED. The colours travel from the board in the
        // session, as bytes; the data lines are left to themselves.
        partDevice.set(
          id,
          add(
            resistor(
              id,
              node(component.pins.vcc),
              node(component.pins.gnd),
              LED_RING_OHMS_PER_LED / component.props.leds,
            ),
          ),
        );
        break;
      case 'tft':
        // A supply load, mostly its backlight. What travels on the bus is handed to the
        // display by the session, an exchange at a time.
        partDevice.set(
          id,
          add(
            resistor(id, node(component.pins.vcc), node(component.pins.gnd), TFT_SUPPLY_RESISTANCE),
          ),
        );
        break;
      case 'ldrmodule':
      case 'rain':
      case 'mq135':
      case 'mq7':
      case 'ph': {
        // The sensing divider with AO at its tap, and the comparator's output on DO:
        // held HIGH by a resistor, pulled LOW when the module trips.
        const supply = node(component.pins.vcc);
        const ground = node(component.pins.gnd);
        const tap = node(component.pins.ao);
        const [upper, lower] =
          component.type === 'ldrmodule'
            ? [LDR_MODULE_RESISTANCE, ldrResistance(component.props.light)]
            : (() => {
                const fraction = moduleOutputFraction(component);
                return [SENSOR_RESISTANCE * (1 - fraction), SENSOR_RESISTANCE * fraction];
              })();
        const divider = add(resistor(`${id}:upper`, supply, tap, Math.max(10, upper)));
        add(resistor(`${id}:lower`, tap, ground, Math.max(10, lower)));
        // What a gas sensor draws is nearly all its heater.
        const heater =
          component.type === 'mq135'
            ? MQ135_HEATER_RESISTANCE
            : component.type === 'mq7'
              ? MQ7_HEATER_RESISTANCE
              : null;
        partDevice.set(
          id,
          heater === null ? divider : add(resistor(`${id}:heater`, supply, ground, heater)),
        );
        const out = node(component.pins.do);
        add(resistor(`${id}:pullup`, supply, out, MODULE_DO_PULLUP));
        if (moduleTripped(component)) {
          add(resistor(`${id}:do`, out, ground, MODULE_DO_LOW_RESISTANCE));
        }
        break;
      }
      case 'voltagesensor': {
        // Two resistors, and S at their tap.
        const tap = node(component.pins.s);
        partDevice.set(id, add(resistor(id, node(component.pins.vin), tap, VOLTAGE_SENSOR_UPPER)));
        add(resistor(`${id}:lower`, tap, node(component.pins.gnd), VOLTAGE_SENSOR_LOWER));
        break;
      }
      case 'acs712': {
        // The current path, and OUT as a share of the supply that moves with the current
        // through it, as solved a moment ago: the path does not feel what OUT does.
        partDevice.set(
          id,
          add(
            resistor(
              id,
              node(component.pins.ip1),
              node(component.pins.ip2),
              ACS712_PATH_RESISTANCE,
            ),
          ),
        );
        const supply = node(component.pins.vcc);
        const ground = node(component.pins.gnd);
        const out = node(component.pins.out);
        const fraction = acs712OutputFraction(component.props.range, state.sensing?.[id] ?? 0);
        add(resistor(`${id}:supply`, supply, ground, ACS712_SUPPLY_RESISTANCE));
        add(resistor(`${id}:upper`, supply, out, ACS712_OUTPUT_RESISTANCE / fraction));
        add(resistor(`${id}:lower`, out, ground, ACS712_OUTPUT_RESISTANCE / (1 - fraction)));
        break;
      }
      case 'tds': {
        // Its output does not follow the supply, but needs one: off until the supply is enough.
        const ground = node(component.pins.gnd);
        const out = node(component.pins.out);
        partDevice.set(
          id,
          add(resistor(id, node(component.pins.vcc), ground, TDS_SUPPLY_RESISTANCE)),
        );
        const powered = (state.sensing?.[id] ?? 0) >= MIN_SUPPLY.tds!;
        add(
          powered
            ? theveninSource(
                `${id}:out`,
                out,
                ground,
                tdsVolts(component.props.ppm),
                TDS_OUTPUT_RESISTANCE,
              )
            : resistor(`${id}:out`, out, ground, TDS_OUTPUT_RESISTANCE),
        );
        break;
      }
      case 'turbidity': {
        // A share of the supply at the output, and the module's own supply current.
        const supply = node(component.pins.vcc);
        const ground = node(component.pins.gnd);
        const out = node(component.pins.out);
        const fraction = turbidityVolts(component.props.ntu) / 5;
        partDevice.set(id, add(resistor(id, supply, ground, TURBIDITY_SUPPLY_RESISTANCE)));
        add(resistor(`${id}:upper`, supply, out, TURBIDITY_OUTPUT_RESISTANCE / fraction));
        add(resistor(`${id}:lower`, out, ground, TURBIDITY_OUTPUT_RESISTANCE / (1 - fraction)));
        break;
      }
      case 'cell':
        // Its resting voltage for how full it is, behind its own resistance.
        partDevice.set(
          id,
          add(
            theveninSource(
              id,
              node(component.pins.pos),
              node(component.pins.neg),
              cellVolts(component.props.charge),
              CELL_RESISTANCE,
            ),
          ),
        );
        break;
      case 'solar': {
        // Light current, beside the cells' junctions and a leak across them, then the
        // resistance of its wiring in series.
        const cells = node(`${id}:cells`);
        const negative = node(component.pins.neg);
        add(
          currentSource(`${id}:light`, cells, negative, SOLAR_LIGHT_AMPS * component.props.light),
        );
        add(diode(`${id}:cells`, cells, negative, SOLAR_DIODE));
        add(resistor(`${id}:shunt`, cells, negative, SOLAR_SHUNT_RESISTANCE));
        partDevice.set(
          id,
          add(resistor(id, cells, node(component.pins.pos), SOLAR_SERIES_RESISTANCE)),
        );
        break;
      }
      case 'tp4056': {
        // IN− and B− are the same copper; OUT+ is B+; OUT− reaches B− through the
        // protection's transistors. The charger itself is between IN+ and B+.
        const charger = state.chargers?.[id] ?? CHARGER_IDLE;
        const inn = node(component.pins.inn);
        const bp = node(component.pins.bp);
        const bn = node(component.pins.bn);
        add(resistor(`${id}:common`, inn, bn, WIRE_RESISTANCE));
        add(resistor(`${id}:out`, bp, node(component.pins.outp), WIRE_RESISTANCE));
        add(
          resistor(
            `${id}:protect`,
            node(component.pins.outn),
            bn,
            charger.tripped ? PROTECTION_OPEN : PROTECTION_RESISTANCE,
          ),
        );
        const inp = node(component.pins.inp);
        if (charger.mode === 'hold') {
          // Holding 4.2 V on the cell, and drawing what it gives from the input.
          partDevice.set(id, add(theveninSource(id, bp, bn, CHARGER_VOLTS, 0.05)));
          add(currentSource(`${id}:in`, inn, inp, charger.amps));
          add(resistor(`${id}:pass`, inp, bp, CHARGER_OFF_PASS));
        } else {
          partDevice.set(
            id,
            add(resistor(id, inp, bp, charger.mode === 'pass' ? charger.ohms : CHARGER_OFF_PASS)),
          );
        }
        break;
      }
      case 'lm2596': {
        // IN− and OUT− are one ground. The input is a load that takes the power the
        // output gives, and some; the output holds what the regulator can make.
        const regulator = state.regulators?.[id] ?? REGULATOR_IDLE;
        const inn = node(component.pins.inn);
        const outn = node(component.pins.outn);
        add(resistor(`${id}:common`, inn, outn, WIRE_RESISTANCE));
        add(resistor(`${id}:in`, node(component.pins.inp), inn, regulator.inputOhms));
        const outp = node(component.pins.outp);
        partDevice.set(
          id,
          add(
            regulator.on
              ? theveninSource(id, outp, outn, regulator.volts, REGULATOR_OUTPUT_RESISTANCE)
              : resistor(id, outp, outn, REGULATOR_OFF),
          ),
        );
        break;
      }
      case 'gps':
      case 'pms5003':
      case 'bluetooth':
      case 'mp3':
      case 'gsm': {
        // A supply load, and a TX line held HIGH between bytes; the bytes themselves
        // travel between the module and the board in the session, not here.
        const ground = node(component.pins.gnd);
        partDevice.set(
          id,
          add(
            resistor(
              id,
              node(component.pins.vcc),
              ground,
              SERIAL_SUPPLY_RESISTANCE[component.type],
            ),
          ),
        );
        add(
          theveninSource(
            `${id}:tx`,
            node(component.pins.tx),
            ground,
            component.type === 'gsm' ? GSM_TX_VOLTS : UART_TX_VOLTS,
            UART_TX_RESISTANCE,
          ),
        );
        break;
      }
      case 'ds18b20': {
        // Its supply current, and the small current its DQ pin draws: with no
        // pull-up, nothing holds the line HIGH.
        const ground = node(component.pins.gnd);
        partDevice.set(
          id,
          add(resistor(id, node(component.pins.vdd), ground, DS18B20_SUPPLY_RESISTANCE)),
        );
        add(resistor(`${id}:dq`, node(component.pins.dq), ground, DS18B20_DQ_LEAK));
        break;
      }
      case 'bme280':
      case 'ina219': {
        // Its supply current, and the module's pull-ups on the two bus lines. What
        // travels on the bus is answered by the session, an exchange at a time.
        const supply = node(component.pins.vcc);
        const ground = node(component.pins.gnd);
        const own =
          component.type === 'bme280' ? BME280_SUPPLY_RESISTANCE : INA219_SUPPLY_RESISTANCE;
        const draw = add(resistor(`${id}:supply`, supply, ground, own));
        add(resistor(`${id}:scl`, supply, node(component.pins.scl), I2C_MODULE_PULLUP));
        add(resistor(`${id}:sda`, supply, node(component.pins.sda), I2C_MODULE_PULLUP));
        if (component.type === 'ina219') {
          // The current to measure goes through its shunt, from VIN+ to VIN−.
          partDevice.set(
            id,
            add(resistor(id, node(component.pins.vinp), node(component.pins.vinm), INA219_SHUNT)),
          );
        } else {
          partDevice.set(id, draw);
        }
        break;
      }
      case 'pir': {
        const ground = node(component.pins.gnd);
        const out = node(component.pins.out);
        partDevice.set(
          id,
          add(resistor(id, node(component.pins.vcc), ground, PIR_SUPPLY_RESISTANCE)),
        );
        add(
          state.motion?.[id]
            ? theveninSource(`${id}:out`, out, ground, PIR_OUTPUT_VOLTS, PIR_OUTPUT_RESISTANCE)
            : resistor(`${id}:out`, out, ground, PIR_OUTPUT_RESISTANCE),
        );
        break;
      }
      case 'rgbled': {
        // Three LEDs that share their negative leg.
        const ground = node(component.pins.gnd);
        for (const channel of RGB_CHANNELS) {
          const device = add(
            diode(
              `${id}:${channel}`,
              node(component.pins[channel]),
              ground,
              diodeModelFor(RGB_FORWARD_VOLTAGE[channel]),
            ),
          );
          if (channel === 'r') partDevice.set(id, device);
        }
        break;
      }
      case 'temperature':
      case 'soil':
      case 'ir': {
        // A divider from supply to ground with the output at the tap.
        const fraction = Math.min(1, Math.max(0, sensorOutputFraction(component)));
        const out = node(component.pins.out);
        const upper = Math.max(10, SENSOR_RESISTANCE * (1 - fraction));
        const lower = Math.max(10, SENSOR_RESISTANCE * fraction);
        partDevice.set(id, add(resistor(id, node(component.pins.vcc), out, upper)));
        add(resistor(`${id}:lower`, out, node(component.pins.gnd), lower));
        break;
      }
      case 'potentiometer': {
        // Two resistors that always add up to the full value; never quite zero.
        const { resistance, position } = component.props;
        const upper = Math.max(1, resistance * position);
        const lower = Math.max(1, resistance * (1 - position));
        const wiper = node(component.pins.wiper);
        partDevice.set(id, add(resistor(id, node(component.pins.a), wiper, upper)));
        add(resistor(`${id}:lower`, wiper, node(component.pins.b), lower));
        break;
      }
      case 'uno':
      case 'esp32': {
        const model = BOARD_MODELS[component.type];
        const ground = node(`${id}.gnd`);
        const drives = state.boards[id];
        for (const terminal of boardTerminals(component.type)) {
          const socket = `${id}.${terminal}`;
          if (!wired.has(netName(socket)) || model.grounds.includes(terminal)) continue;
          const pinNode = node(socket);
          const supply = model.supplies.find((s) => s.terminal === terminal);
          if (supply?.behindDiode) {
            // The pin's source, a diode, and what the board itself takes from the pin's
            // side of the diode. Fed from outside at a higher voltage, the diode shuts
            // and the outside supply carries the board.
            const { sourceVolts, drop, dropAt, ownLoad } = supply.behindDiode;
            const source = node(`${socket}:source`);
            add(theveninSource(`${socket}:source`, source, ground, sourceVolts, supply.resistance));
            const emission = 1.05;
            const pass = add(
              diode(`${socket}:diode`, source, pinNode, {
                saturationCurrent: dropAt / Math.expm1(drop / (emission * THERMAL_VOLTAGE)),
                emissionCoefficient: emission,
              }),
            );
            const own = add(resistor(`${socket}:own`, pinNode, ground, ownLoad));
            // As for the other pin models: current into the board counts as positive.
            socketDevice.set(
              socket,
              meter(socket, pinNode, ground, (s) => own.current(s) - pass.current(s)),
            );
            continue;
          }
          if (supply) {
            socketDevice.set(
              socket,
              add(theveninSource(socket, pinNode, ground, supply.volts, supply.resistance)),
            );
            continue;
          }
          const pin = boardPinNumber(component.type, terminal);
          // A pin with no number (the ESP32's EN) and a pin that cannot drive are inputs.
          const asked: PinDrive = pin === null ? 'input' : (drives?.[pin] ?? 'input');
          const drive: PinDrive = pin !== null && model.canDrive(pin) ? asked : 'input';
          const device =
            drive === 'high'
              ? theveninSource(socket, pinNode, ground, model.vcc, model.sourceResistance)
              : drive === 'pullup'
                ? theveninSource(socket, pinNode, ground, model.vcc, model.pullResistance)
                : resistor(
                    socket,
                    pinNode,
                    ground,
                    drive === 'low'
                      ? model.sinkResistance
                      : drive === 'pulldown'
                        ? model.pullResistance
                        : model.inputResistance,
                  );
          socketDevice.set(socket, add(device));
        }
        break;
      }
    }
  }

  for (const wire of document.wires) {
    const from = node(wire.from);
    const to = node(wire.to);
    if (from === to) continue; // both ends already joined by the board: carries no current
    wireDevice.set(wire.id, add(resistor(wire.id, from, to, WIRE_RESISTANCE)));
  }

  return {
    circuit: { nodeCount, devices },
    partDevice,
    wireDevice,
    socketDevice,
    bridgedParts,
    nodeOf: (endpoint) => nodes.get(netName(endpoint)) ?? -1,
    nodeNames: nodes,
  };
}
