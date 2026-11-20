import { UNO_VCC, type PinDrive } from '@banglalab/board-emulators';
import {
  diode,
  resistor,
  theveninSource,
  type Circuit,
  type Device,
} from '@banglalab/circuit-engine';
import {
  UNO_TERMINALS,
  isHole,
  stripOf,
  unoPinNumber,
  type CircuitDocument,
} from '@banglalab/shared';
import {
  BATTERY_INTERNAL_RESISTANCE,
  BUTTON_CLOSED_RESISTANCE,
  PIN_INPUT_RESISTANCE,
  PIN_OUTPUT_RESISTANCE,
  PIN_PULLUP_RESISTANCE,
  SUPPLY_RESISTANCE,
  WIRE_RESISTANCE,
  ledDiodeModel,
} from './library';

/** Everything that changes while a circuit runs, without the circuit itself being edited. */
export interface CircuitState {
  /** Ids of the push buttons being held down. */
  pressed: readonly string[];
  /** What each pin of each board is driving. A board not listed has all pins as inputs. */
  boards: Readonly<Record<string, readonly PinDrive[]>>;
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
  /** Parts whose leads all sit in one strip, so the board shorts them out. */
  bridgedParts: string[];
}

/** The electrical net an endpoint belongs to: a board strip or a terminal. */
function netName(endpoint: string): string {
  if (isHole(endpoint)) return stripOf(endpoint);
  // An UNO's two ground sockets are the same piece of copper.
  return `terminal:${endpoint.replace(/\.gnd2$/, '.gnd')}`;
}

/**
 * Translates what the student built into nodes and devices.
 *
 * Board strips and terminals become nodes. Wires become small resistors rather
 * than merging nodes, so the current in each wire is known. Ground (0 V) is the
 * UNO's GND if there is a board, otherwise the first battery's negative terminal.
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
    document.components.find((c) => c.type === 'uno') ??
    document.components.find((c) => c.type === 'battery');
  if (reference) {
    nodes.set(netName(`${reference.id}.${reference.type === 'uno' ? 'gnd' : 'neg'}`), 0);
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
          add(resistor(id, node(component.pins.a), node(component.pins.b), component.props.resistance)),
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
      case 'button': {
        const a = node(component.pins.a);
        const b = node(component.pins.b);
        if (state.pressed.includes(id)) {
          partDevice.set(id, add(resistor(id, a, b, BUTTON_CLOSED_RESISTANCE)));
        }
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
      case 'uno': {
        const ground = node(`${id}.gnd`);
        const drives = state.boards[id];
        for (const terminal of UNO_TERMINALS) {
          const socket = `${id}.${terminal}`;
          if (!wired.has(netName(socket)) || terminal.startsWith('gnd')) continue;
          const pinNode = node(socket);
          const pin = unoPinNumber(terminal);
          const drive: PinDrive = pin === null ? 'high' : (drives?.[pin] ?? 'input');
          const device =
            pin === null
              ? theveninSource(socket, pinNode, ground, UNO_VCC, SUPPLY_RESISTANCE)
              : drive === 'high'
                ? theveninSource(socket, pinNode, ground, UNO_VCC, PIN_OUTPUT_RESISTANCE)
                : drive === 'pullup'
                  ? theveninSource(socket, pinNode, ground, UNO_VCC, PIN_PULLUP_RESISTANCE)
                  : resistor(
                      socket,
                      pinNode,
                      ground,
                      drive === 'low' ? PIN_OUTPUT_RESISTANCE : PIN_INPUT_RESISTANCE,
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
  };
}
