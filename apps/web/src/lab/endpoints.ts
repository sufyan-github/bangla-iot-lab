import {
  allHoles,
  esp32GpioNumber,
  isHole,
  parseTerminal,
  stripOf,
  unoPinNumber,
  type CircuitDocument,
} from '@banglalab/shared';

/**
 * What the student is pointing at: every place a lead or wire end can go has a
 * name, and holes are joined to others in the same strip. Kept apart from the
 * canvas so it can be tested without a browser.
 */
export interface EndpointInfo {
  /** The place itself, as printed on the board: "c5", "D13", "+". */
  name: string;
  /** The part and leg plugged in here, e.g. "LED1 +". */
  lead?: string;
  /** True when a leg or a wire end already sits here. */
  used: boolean;
}

/** Short names for legs, as printed on real parts. Legs that are interchangeable have none. */
const LEG_NAMES: Record<string, string> = {
  anode: '+',
  cathode: '−',
  pos: '+',
  neg: '−',
  wiper: 'W',
  collector: 'C',
  base: 'B',
  emitter: 'E',
  coil1: 'COIL',
  coil2: 'COIL',
};

function legName(pin: string): string {
  if (pin === 'a' || pin === 'b') return '';
  return LEG_NAMES[pin] ?? pin.toUpperCase();
}

const PWM_PINS = [3, 5, 6, 9, 10, 11];

function socketName(terminal: string): string {
  if (terminal.startsWith('gnd')) return 'GND';
  if (terminal === '5v') return '5V';
  const pin = unoPinNumber(terminal);
  if (pin === null) return terminal.toUpperCase();
  if (pin >= 14) return `A${pin - 14}`;
  return PWM_PINS.includes(pin) ? `D${pin} PWM` : `D${pin}`;
}

/** An ESP32 pin as printed on the board, with its GPIO number where the print hides it. */
function esp32PinName(terminal: string): string {
  if (terminal.startsWith('gnd')) return 'GND';
  const printed = terminal.toUpperCase();
  const gpio = esp32GpioNumber(terminal);
  return gpio !== null && !/^D\d+$/.test(printed) ? `${printed} (GPIO${gpio})` : printed;
}

/** The motor driver's terminals, as printed on the module. */
export const DRIVER_TERMINAL_NAMES: Record<string, string> = {
  vs: '12V',
  gnd: 'GND',
  '5v': '5V',
  ena: 'ENA',
  in1: 'IN1',
  in2: 'IN2',
  in3: 'IN3',
  in4: 'IN4',
  enb: 'ENB',
  out1: 'OUT1',
  out2: 'OUT2',
  out3: 'OUT3',
  out4: 'OUT4',
};

function holeName(hole: string): string {
  if (hole.startsWith('tp') || hole.startsWith('bp')) return '+';
  if (hole.startsWith('tn') || hole.startsWith('bn')) return '−';
  return hole;
}

export function describeEndpoint(circuit: CircuitDocument, endpoint: string): EndpointInfo | null {
  const wired = circuit.wires.some((wire) => wire.from === endpoint || wire.to === endpoint);
  if (isHole(endpoint)) {
    for (const component of circuit.components) {
      if (!('pins' in component)) continue;
      const leg = Object.entries(component.pins).find(([, hole]) => hole === endpoint);
      if (leg) {
        return {
          name: holeName(endpoint),
          lead: `${component.id} ${legName(leg[0])}`.trim(),
          used: true,
        };
      }
    }
    return { name: holeName(endpoint), used: wired };
  }
  const terminal = parseTerminal(endpoint);
  const owner = circuit.components.find((c) => c.id === terminal?.componentId);
  if (!terminal || !owner) return null;
  if (owner.type === 'battery') {
    return { name: legName(terminal.pin), lead: owner.id, used: wired };
  }
  if (owner.type === 'l298n') {
    return {
      name: DRIVER_TERMINAL_NAMES[terminal.pin] ?? terminal.pin,
      lead: owner.id,
      used: wired,
    };
  }
  if (owner.type === 'uno') return { name: socketName(terminal.pin), used: wired };
  if (owner.type === 'esp32') return { name: esp32PinName(terminal.pin), used: wired };
  return null;
}

const STRIPS = new Map<string, string[]>();
for (const hole of allHoles()) {
  const strip = stripOf(hole);
  STRIPS.set(strip, [...(STRIPS.get(strip) ?? []), hole]);
}

/** Every hole joined to `endpoint` inside the breadboard, itself included. */
export function joinedHoles(endpoint: string): readonly string[] {
  return isHole(endpoint) ? (STRIPS.get(stripOf(endpoint)) ?? []) : [];
}
