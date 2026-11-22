import type { PinDrive } from '@banglalab/board-emulators';
import {
  capacitor,
  diode,
  npnTransistor,
  resistor,
  theveninSource,
  type Circuit,
  type Device,
} from '@banglalab/circuit-engine';
import {
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
  LDR_MODULE_RESISTANCE,
  MODULE_DO_LOW_RESISTANCE,
  MODULE_DO_PULLUP,
  MOTOR_RESISTANCE,
  MQ135_HEATER_RESISTANCE,
  PIR_OUTPUT_RESISTANCE,
  PIR_OUTPUT_VOLTS,
  PIR_SUPPLY_RESISTANCE,
  RGB_CHANNELS,
  RGB_FORWARD_VOLTAGE,
  NPN_TRANSISTOR,
  MODULE_SUPPLY_RESISTANCE,
  OLED_PULLUP_RESISTANCE,
  OLED_SUPPLY_RESISTANCE,
  RELAY_COIL_RESISTANCE,
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
        if (component.type === 'ultrasonic') {
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
      case 'ldrmodule':
      case 'rain':
      case 'mq135': {
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
        // What the gas sensor draws is nearly all its heater.
        partDevice.set(
          id,
          component.type === 'mq135'
            ? add(resistor(`${id}:heater`, supply, ground, MQ135_HEATER_RESISTANCE))
            : divider,
        );
        const out = node(component.pins.do);
        add(resistor(`${id}:pullup`, supply, out, MODULE_DO_PULLUP));
        if (moduleTripped(component)) {
          add(resistor(`${id}:do`, out, ground, MODULE_DO_LOW_RESISTANCE));
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
