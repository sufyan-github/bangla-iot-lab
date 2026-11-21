import { CIRCUIT_SCHEMA_VERSION, type CircuitDocument } from './circuit';
import { WIRE_COLORS } from './editing';

/**
 * The first circuit every student builds: a 9 V battery, a 330 Ω resistor and a
 * red LED in one loop. Also the reference circuit for the Phase 0 acceptance test.
 */
export function ledCircuitExample(): CircuitDocument {
  return {
    schemaVersion: CIRCUIT_SCHEMA_VERSION,
    components: [
      { id: 'BAT1', type: 'battery', props: { voltage: 9 } },
      { id: 'R1', type: 'resistor', pins: { a: 'c5', b: 'c9' }, props: { resistance: 330 } },
      { id: 'LED1', type: 'led', pins: { anode: 'd9', cathode: 'd10' }, props: { color: 'red' } },
    ],
    wires: [
      { id: 'W1', from: 'BAT1.pos', to: 'tp1', color: WIRE_COLORS.red },
      { id: 'W2', from: 'BAT1.neg', to: 'tn1', color: WIRE_COLORS.black },
      { id: 'W3', from: 'tp4', to: 'a5', color: WIRE_COLORS.red },
      { id: 'W4', from: 'a10', to: 'tn8', color: WIRE_COLORS.black },
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
      { id: 'UNO1', type: 'uno', props: {} },
      { id: 'R1', type: 'resistor', pins: { a: 'c5', b: 'c9' }, props: { resistance: 220 } },
      { id: 'LED1', type: 'led', pins: { anode: 'd9', cathode: 'd10' }, props: { color: 'red' } },
      { id: 'SW1', type: 'button', pins: { a: 'c14', b: 'c16' }, props: {} },
      {
        id: 'POT1',
        type: 'potentiometer',
        pins: { a: 'c20', wiper: 'c21', b: 'c22' },
        props: { resistance: 10_000, position: 0.5 },
      },
    ],
    wires: [
      { id: 'W1', from: 'UNO1.gnd', to: 'tn1', color: WIRE_COLORS.black },
      { id: 'W2', from: 'UNO1.5v', to: 'tp1', color: WIRE_COLORS.red },
      { id: 'W3', from: 'UNO1.d13', to: 'a5', color: WIRE_COLORS.yellow },
      { id: 'W4', from: 'a10', to: 'tn8', color: WIRE_COLORS.black },
      { id: 'W5', from: 'UNO1.d2', to: 'a14', color: WIRE_COLORS.blue },
      { id: 'W6', from: 'a16', to: 'tn13', color: WIRE_COLORS.black },
      { id: 'W7', from: 'a20', to: 'tp17', color: WIRE_COLORS.red },
      { id: 'W8', from: 'UNO1.a0', to: 'a21', color: WIRE_COLORS.green },
      { id: 'W9', from: 'a22', to: 'tn19', color: WIRE_COLORS.black },
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
      { id: 'ESP1', type: 'esp32', props: {} },
      { id: 'R1', type: 'resistor', pins: { a: 'c5', b: 'c9' }, props: { resistance: 220 } },
      { id: 'LED1', type: 'led', pins: { anode: 'd9', cathode: 'd10' }, props: { color: 'red' } },
      { id: 'SW1', type: 'button', pins: { a: 'c14', b: 'c16' }, props: {} },
      {
        id: 'POT1',
        type: 'potentiometer',
        pins: { a: 'c20', wiper: 'c21', b: 'c22' },
        props: { resistance: 10_000, position: 0.5 },
      },
    ],
    wires: [
      { id: 'W1', from: 'ESP1.gnd1', to: 'tn1', color: WIRE_COLORS.black },
      { id: 'W2', from: 'ESP1.3v3', to: 'tp1', color: WIRE_COLORS.red },
      { id: 'W3', from: 'ESP1.d2', to: 'a5', color: WIRE_COLORS.yellow },
      { id: 'W4', from: 'a10', to: 'tn8', color: WIRE_COLORS.black },
      { id: 'W5', from: 'ESP1.d4', to: 'a14', color: WIRE_COLORS.blue },
      { id: 'W6', from: 'a16', to: 'tn13', color: WIRE_COLORS.black },
      { id: 'W7', from: 'a20', to: 'tp17', color: WIRE_COLORS.red },
      { id: 'W8', from: 'ESP1.d34', to: 'a21', color: WIRE_COLORS.green },
      { id: 'W9', from: 'a22', to: 'tn19', color: WIRE_COLORS.black },
    ],
  };
}
