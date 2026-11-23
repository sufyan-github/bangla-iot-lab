import { CIRCUIT_SCHEMA_VERSION, FIRST_BREADBOARD, type CircuitDocument } from './circuit';
import { WIRE_COLORS } from './editing';

/**
 * The first circuit every student builds: a 9 V battery, a 330 Ω resistor and a
 * red LED in one loop. Also the reference circuit for the Phase 0 acceptance test.
 */
export function ledCircuitExample(): CircuitDocument {
  return {
    schemaVersion: CIRCUIT_SCHEMA_VERSION,
    components: [
      FIRST_BREADBOARD,
      { id: 'BAT1', type: 'battery', props: { voltage: 9 } },
      {
        id: 'R1',
        type: 'resistor',
        pins: { a: 'BB1.c5', b: 'BB1.c9' },
        props: { resistance: 330 },
      },
      {
        id: 'LED1',
        type: 'led',
        pins: { anode: 'BB1.d9', cathode: 'BB1.d10' },
        props: { color: 'red' },
      },
    ],
    wires: [
      { id: 'W1', from: 'BAT1.pos', to: 'BB1.tp1', color: WIRE_COLORS.red },
      { id: 'W2', from: 'BAT1.neg', to: 'BB1.tn1', color: WIRE_COLORS.black },
      { id: 'W3', from: 'BB1.tp4', to: 'BB1.a5', color: WIRE_COLORS.red },
      { id: 'W4', from: 'BB1.a10', to: 'BB1.tn8', color: WIRE_COLORS.black },
    ],
  };
}

/**
 * An UNO driving an LED from pin 13 through a resistor, with a push button on
 * pin 2 and a potentiometer on A0. The starter programs all run on this circuit.
 */
export function unoCircuitExample(): CircuitDocument {
  return {
    schemaVersion: CIRCUIT_SCHEMA_VERSION,
    components: [
      FIRST_BREADBOARD,
      { id: 'UNO1', type: 'uno', props: {} },
      {
        id: 'R1',
        type: 'resistor',
        pins: { a: 'BB1.c5', b: 'BB1.c9' },
        props: { resistance: 220 },
      },
      {
        id: 'LED1',
        type: 'led',
        pins: { anode: 'BB1.d9', cathode: 'BB1.d10' },
        props: { color: 'red' },
      },
      { id: 'SW1', type: 'button', pins: { a: 'BB1.c14', b: 'BB1.c16' }, props: {} },
      {
        id: 'POT1',
        type: 'potentiometer',
        pins: { a: 'BB1.c20', wiper: 'BB1.c21', b: 'BB1.c22' },
        props: { resistance: 10_000, position: 0.5 },
      },
    ],
    wires: [
      { id: 'W1', from: 'UNO1.gnd', to: 'BB1.tn1', color: WIRE_COLORS.black },
      { id: 'W2', from: 'UNO1.5v', to: 'BB1.tp1', color: WIRE_COLORS.red },
      { id: 'W3', from: 'UNO1.d13', to: 'BB1.a5', color: WIRE_COLORS.yellow },
      { id: 'W4', from: 'BB1.a10', to: 'BB1.tn8', color: WIRE_COLORS.black },
      { id: 'W5', from: 'UNO1.d2', to: 'BB1.a14', color: WIRE_COLORS.blue },
      { id: 'W6', from: 'BB1.a16', to: 'BB1.tn13', color: WIRE_COLORS.black },
      { id: 'W7', from: 'BB1.a20', to: 'BB1.tp17', color: WIRE_COLORS.red },
      { id: 'W8', from: 'UNO1.a0', to: 'BB1.a21', color: WIRE_COLORS.green },
      { id: 'W9', from: 'BB1.a22', to: 'BB1.tn19', color: WIRE_COLORS.black },
    ],
  };
}

/**
 * The same circuit round the ESP32 board: an LED on GPIO2, a push button on
 * GPIO4 and a potentiometer on GPIO34, powered from the board's 3.3 V pin.
 */
export function esp32CircuitExample(): CircuitDocument {
  return {
    schemaVersion: CIRCUIT_SCHEMA_VERSION,
    components: [
      FIRST_BREADBOARD,
      { id: 'ESP1', type: 'esp32', props: {} },
      {
        id: 'R1',
        type: 'resistor',
        pins: { a: 'BB1.c5', b: 'BB1.c9' },
        props: { resistance: 220 },
      },
      {
        id: 'LED1',
        type: 'led',
        pins: { anode: 'BB1.d9', cathode: 'BB1.d10' },
        props: { color: 'red' },
      },
      { id: 'SW1', type: 'button', pins: { a: 'BB1.c14', b: 'BB1.c16' }, props: {} },
      {
        id: 'POT1',
        type: 'potentiometer',
        pins: { a: 'BB1.c20', wiper: 'BB1.c21', b: 'BB1.c22' },
        props: { resistance: 10_000, position: 0.5 },
      },
    ],
    wires: [
      { id: 'W1', from: 'ESP1.gnd1', to: 'BB1.tn1', color: WIRE_COLORS.black },
      { id: 'W2', from: 'ESP1.3v3', to: 'BB1.tp1', color: WIRE_COLORS.red },
      { id: 'W3', from: 'ESP1.d2', to: 'BB1.a5', color: WIRE_COLORS.yellow },
      { id: 'W4', from: 'BB1.a10', to: 'BB1.tn8', color: WIRE_COLORS.black },
      { id: 'W5', from: 'ESP1.d4', to: 'BB1.a14', color: WIRE_COLORS.blue },
      { id: 'W6', from: 'BB1.a16', to: 'BB1.tn13', color: WIRE_COLORS.black },
      { id: 'W7', from: 'BB1.a20', to: 'BB1.tp17', color: WIRE_COLORS.red },
      { id: 'W8', from: 'ESP1.d34', to: 'BB1.a21', color: WIRE_COLORS.green },
      { id: 'W9', from: 'BB1.a22', to: 'BB1.tn19', color: WIRE_COLORS.black },
    ],
  };
}
