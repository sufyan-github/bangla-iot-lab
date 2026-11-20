import {
  diode,
  resistor,
  voltageSource,
  type Circuit,
  type Device,
} from '@banglalab/circuit-engine';
import { isHole, stripOf, type CircuitDocument } from '@banglalab/shared';
import { BATTERY_INTERNAL_RESISTANCE, WIRE_RESISTANCE, ledDiodeModel } from './library';

export interface Netlist {
  circuit: Circuit;
  /** The solver device that carries each part's or wire's current. */
  deviceOf: Map<string, Device>;
  /** Battery id → its ideal source (the part's own device is the internal resistance). */
  sourceOf: Map<string, Device>;
  /** Solver node of every connection point used by the circuit. */
  nodeOf(endpoint: string): number;
  /** Two-pin parts whose leads sit in the same strip, so the board shorts them out. */
  bridgedParts: string[];
}

/** The electrical net an endpoint belongs to: a board strip or a battery terminal. */
function netName(endpoint: string): string {
  return isHole(endpoint) ? stripOf(endpoint) : `terminal:${endpoint}`;
}

/**
 * Translates what the student built into nodes and devices.
 *
 * Board strips and battery terminals become nodes. Wires become small
 * resistors rather than merging nodes, so the current in each wire is known.
 * The negative terminal of the first battery is ground (0 V).
 */
export function buildNetlist(document: CircuitDocument): Netlist {
  const nodes = new Map<string, number>();
  let nodeCount = 1;
  const node = (net: string): number => {
    let index = nodes.get(net);
    if (index === undefined) {
      index = nodeCount++;
      nodes.set(net, index);
    }
    return index;
  };

  const firstBattery = document.components.find((c) => c.type === 'battery');
  if (firstBattery) nodes.set(netName(`${firstBattery.id}.neg`), 0);

  const devices: Device[] = [];
  const deviceOf = new Map<string, Device>();
  const sourceOf = new Map<string, Device>();
  const bridgedParts: string[] = [];

  for (const component of document.components) {
    switch (component.type) {
      case 'battery': {
        const positive = node(netName(`${component.id}.pos`));
        const negative = node(netName(`${component.id}.neg`));
        const internal = node(`internal:${component.id}`);
        const source = voltageSource(`${component.id}:emf`, internal, negative, component.props.voltage);
        const series = resistor(component.id, internal, positive, BATTERY_INTERNAL_RESISTANCE);
        devices.push(source, series);
        sourceOf.set(component.id, source);
        deviceOf.set(component.id, series);
        break;
      }
      case 'resistor': {
        const a = node(netName(component.pins.a));
        const b = node(netName(component.pins.b));
        if (a === b) bridgedParts.push(component.id);
        const device = resistor(component.id, a, b, component.props.resistance);
        devices.push(device);
        deviceOf.set(component.id, device);
        break;
      }
      case 'led': {
        const anode = node(netName(component.pins.anode));
        const cathode = node(netName(component.pins.cathode));
        if (anode === cathode) bridgedParts.push(component.id);
        const device = diode(component.id, anode, cathode, ledDiodeModel(component.props.color));
        devices.push(device);
        deviceOf.set(component.id, device);
        break;
      }
    }
  }

  for (const wire of document.wires) {
    const from = node(netName(wire.from));
    const to = node(netName(wire.to));
    if (from === to) continue; // both ends already joined by the board: carries no current
    const device = resistor(wire.id, from, to, WIRE_RESISTANCE);
    devices.push(device);
    deviceOf.set(wire.id, device);
  }

  return {
    circuit: { nodeCount, devices },
    deviceOf,
    sourceOf,
    bridgedParts,
    nodeOf: (endpoint) => nodes.get(netName(endpoint)) ?? -1,
  };
}
