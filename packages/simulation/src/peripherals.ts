import {
  boardPinNumber,
  boardTerminals,
  isProgrammable,
  type CircuitDocument,
} from '@banglalab/shared';
import { Hd44780 } from './hd44780';
import {
  SERVO_MAX_PULSE_US,
  SERVO_MIN_PULSE_US,
  ULTRASONIC_ECHO_DELAY_MS,
  ULTRASONIC_MIN_TRIGGER_MS,
  ULTRASONIC_MS_PER_CM,
} from './library';
import { netName } from './netlist';

/** A board pin, as "<boardId>:<pin number>". */
type PinKey = string;
const pinKey = (boardId: string, pin: number): PinKey => `${boardId}:${pin}`;

/** A logic level a sensor will put on a board input at an exact moment. */
export interface ScheduledInput {
  timeMs: number;
  boardId: string;
  pin: number;
  level: boolean;
  /** The sensor producing it. */
  sensorId: string;
}

/**
 * Finds which board pin each endpoint is wired to, following wires and
 * breadboard strips only (not through other parts).
 */
function boardPinFinder(document: CircuitDocument): (endpoint: string) => PinKey | undefined {
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
  const pinOfNet = new Map<string, PinKey>();
  for (const component of document.components) {
    if (!isProgrammable(component)) continue;
    for (const terminal of boardTerminals(component.type)) {
      const pin = boardPinNumber(component.type, terminal);
      if (pin !== null)
        pinOfNet.set(find(netName(`${component.id}.${terminal}`)), pinKey(component.id, pin));
    }
  }
  return (endpoint) => pinOfNet.get(find(netName(endpoint)));
}

/**
 * Parts that talk to a program through timing rather than voltage levels:
 * a servo reads pulse widths, an ultrasonic sensor answers a trigger with an
 * echo pulse, and an LCD receives data clocked in on its E pin. They are fed
 * every pin change with its exact time.
 */
export class Peripherals {
  private servos: { id: string; signal?: PinKey }[] = [];
  private ultrasonics: { id: string; trig?: PinKey; echo?: PinKey; distance: number }[] = [];
  private lcds: { id: string; rs?: PinKey; e?: PinKey; data: (PinKey | undefined)[] }[] = [];

  private readonly angles = new Map<string, number>();
  private readonly displays = new Map<string, Hd44780>();
  private readonly wentHighAt = new Map<PinKey, number>();
  private readonly echoBusyUntil = new Map<string, number>();
  private powered: (id: string) => boolean = () => false;

  /** Board inputs driven by a sensor's timed pulses, which the circuit's voltages must not overwrite. */
  readonly sensorInputs = new Set<PinKey>();

  /** Re-reads the wiring after an edit. What each part was doing is kept. */
  rewire(document: CircuitDocument): void {
    const pinOf = boardPinFinder(document);
    this.servos = [];
    this.ultrasonics = [];
    this.lcds = [];
    this.sensorInputs.clear();
    for (const component of document.components) {
      if (component.type === 'servo') {
        this.servos.push({ id: component.id, signal: pinOf(component.pins.signal) });
      } else if (component.type === 'ultrasonic') {
        const echo = pinOf(component.pins.echo);
        if (echo) this.sensorInputs.add(echo);
        this.ultrasonics.push({
          id: component.id,
          trig: pinOf(component.pins.trig),
          echo,
          distance: component.props.distance,
        });
      } else if (component.type === 'lcd') {
        if (!this.displays.has(component.id)) this.displays.set(component.id, new Hd44780());
        const { pins } = component;
        this.lcds.push({
          id: component.id,
          rs: pinOf(pins.rs),
          e: pinOf(pins.e),
          data: [pins.d4, pins.d5, pins.d6, pins.d7].map(pinOf),
        });
      }
    }
    const present = new Set(document.components.map((c) => c.id));
    for (const map of [this.angles, this.displays, this.echoBusyUntil]) {
      for (const id of map.keys()) if (!present.has(id)) map.delete(id);
    }
  }

  /** True when a part needs pulses timed to a fraction of a millisecond. */
  get needsFineTiming(): boolean {
    return this.ultrasonics.length > 0;
  }

  /** Tells the parts which of them currently have a working supply. */
  setPowered(powered: (id: string) => boolean): void {
    this.powered = powered;
  }

  /**
   * Reports that a board pin started or stopped driving HIGH. `isHigh` reads
   * the board's other pins at this same instant. Returns any input pulses a
   * sensor will send back.
   */
  pinChanged(
    boardId: string,
    pin: number,
    high: boolean,
    timeMs: number,
    isHigh: (pin: number) => boolean,
  ): ScheduledInput[] {
    const key = pinKey(boardId, pin);
    const since = this.wentHighAt.get(key);
    if (high) {
      if (since === undefined) this.wentHighAt.set(key, timeMs);
      return [];
    }
    if (since === undefined) return [];
    this.wentHighAt.delete(key);
    const widthMs = timeMs - since;
    const scheduled: ScheduledInput[] = [];

    for (const servo of this.servos) {
      if (servo.signal !== key || !this.powered(servo.id)) continue;
      const microseconds = widthMs * 1000;
      // Anything far outside a servo pulse (PWM, a blinking pin) is not a position command.
      if (microseconds < 400 || microseconds > 2700) continue;
      const fraction =
        (microseconds - SERVO_MIN_PULSE_US) / (SERVO_MAX_PULSE_US - SERVO_MIN_PULSE_US);
      this.angles.set(servo.id, Math.min(180, Math.max(0, fraction * 180)));
    }

    for (const sensor of this.ultrasonics) {
      if (sensor.trig !== key || !sensor.echo || !this.powered(sensor.id)) continue;
      if (widthMs < ULTRASONIC_MIN_TRIGGER_MS) continue;
      if (timeMs < (this.echoBusyUntil.get(sensor.id) ?? 0)) continue; // still measuring
      const [echoBoard, echoPin] = sensor.echo.split(':') as [string, string];
      const start = timeMs + ULTRASONIC_ECHO_DELAY_MS;
      const end = start + sensor.distance * ULTRASONIC_MS_PER_CM;
      const input = { boardId: echoBoard, pin: Number(echoPin), sensorId: sensor.id };
      scheduled.push(
        { ...input, timeMs: start, level: true },
        { ...input, timeMs: end, level: false },
      );
      this.echoBusyUntil.set(sensor.id, end);
    }

    for (const lcd of this.lcds) {
      if (lcd.e !== key || !this.powered(lcd.id)) continue;
      const read = (wired: PinKey | undefined) =>
        wired !== undefined &&
        wired.startsWith(`${boardId}:`) &&
        isHigh(Number(wired.split(':')[1]));
      const nibble = lcd.data.reduce(
        (value, wired, bit) => value | (read(wired) ? 1 << bit : 0),
        0,
      );
      this.displays.get(lcd.id)!.clock(read(lcd.rs), nibble);
    }
    return scheduled;
  }

  /** What each powered part is showing, to be merged into its reading. */
  status(): Record<string, { angle?: number; lcd?: { lines: [string, string] } }> {
    const status: ReturnType<Peripherals['status']> = {};
    for (const [id, angle] of this.angles) if (this.powered(id)) status[id] = { angle };
    for (const [id, display] of this.displays) {
      if (this.powered(id) && display.displayOn) status[id] = { lcd: { lines: display.lines() } };
    }
    return status;
  }
}
