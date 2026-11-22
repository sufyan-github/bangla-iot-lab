import {
  boardPinNumber,
  boardTerminals,
  isProgrammable,
  type CircuitDocument,
} from '@banglalab/shared';
import { Hd44780 } from './hd44780';
import type { PinDrive } from '@banglalab/board-emulators';
import {
  DHT11_START_MS,
  DHT11_TIMING_US,
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
  /**
   * True for a level the board is given as it is. Otherwise the session asks
   * the circuit what the pin sees, which matters when a divider is in the way.
   */
  asIs?: boolean;
}

interface PinFinder {
  /** The board pin an endpoint is wired to, following wires and breadboard strips only. */
  direct(endpoint: string): PinKey | undefined;
  /**
   * The same, or failing that the board pin reached through one resistor: a
   * sensor's 5 V output brought down to a 3.3 V pin by a voltage divider.
   */
  throughResistor(endpoint: string): PinKey | undefined;
}

function boardPinFinder(document: CircuitDocument): PinFinder {
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
  const direct = (endpoint: string) => pinOfNet.get(find(netName(endpoint)));
  return {
    direct,
    throughResistor(endpoint) {
      const wired = direct(endpoint);
      if (wired) return wired;
      const net = find(netName(endpoint));
      for (const component of document.components) {
        if (component.type !== 'resistor') continue;
        const [a, b] = [component.pins.a, component.pins.b].map((hole) => find(netName(hole)));
        const far = a === net ? b : b === net ? a : undefined;
        const pin = far === undefined ? undefined : pinOfNet.get(far);
        if (pin) return pin;
      }
      return undefined;
    },
  };
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
  private dhts: { id: string; data?: PinKey; celsius: number; humidity: number }[] = [];
  /** When each board pin started driving LOW: a DHT11 is asked by holding its line LOW. */
  private readonly wentLowAt = new Map<PinKey, number>();
  /** Until when each DHT11 is still sending its answer. */
  private readonly dhtBusyUntil = new Map<string, number>();

  private readonly angles = new Map<string, number>();
  private readonly displays = new Map<string, Hd44780>();
  private readonly wentHighAt = new Map<PinKey, number>();
  private readonly echoBusyUntil = new Map<string, number>();
  private powered: (id: string) => boolean = () => false;

  /**
   * Board inputs driven by a sensor's timed pulses, which the circuit's voltages
   * must not overwrite, with the level each rests at between pulses.
   */
  readonly sensorInputs = new Map<PinKey, boolean>();

  /** Re-reads the wiring after an edit. What each part was doing is kept. */
  rewire(document: CircuitDocument): void {
    const pinOf = boardPinFinder(document);
    this.servos = [];
    this.ultrasonics = [];
    this.lcds = [];
    this.dhts = [];
    this.sensorInputs.clear();
    for (const component of document.components) {
      if (component.type === 'servo') {
        this.servos.push({ id: component.id, signal: pinOf.direct(component.pins.signal) });
      } else if (component.type === 'ultrasonic') {
        // A 5 V echo may reach a 3.3 V board's pin through a divider.
        const echo = pinOf.throughResistor(component.pins.echo);
        if (echo) this.sensorInputs.set(echo, false);
        this.ultrasonics.push({
          id: component.id,
          trig: pinOf.direct(component.pins.trig),
          echo,
          distance: component.props.distance,
        });
      } else if (component.type === 'dht11') {
        const data = pinOf.direct(component.pins.data);
        // Its data line rests HIGH, held there by the module's pull-up.
        if (data) this.sensorInputs.set(data, true);
        this.dhts.push({ id: component.id, data, ...component.props });
      } else if (component.type === 'lcd') {
        if (!this.displays.has(component.id)) this.displays.set(component.id, new Hd44780());
        const { pins } = component;
        this.lcds.push({
          id: component.id,
          rs: pinOf.direct(pins.rs),
          e: pinOf.direct(pins.e),
          data: [pins.d4, pins.d5, pins.d6, pins.d7].map(pinOf.direct),
        });
      }
    }
    const present = new Set(document.components.map((c) => c.id));
    for (const map of [this.angles, this.displays, this.echoBusyUntil, this.dhtBusyUntil]) {
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
    drive: PinDrive,
    timeMs: number,
    isHigh: (pin: number) => boolean,
  ): ScheduledInput[] {
    const key = pinKey(boardId, pin);
    const asked = this.dhtAsked(boardId, pin, key, drive, timeMs);
    if (asked.length > 0) return asked;
    const high = drive === 'high';
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

  /**
   * A DHT11 is asked for a reading by holding its data line LOW for at least
   * 18 ms and letting go. It answers with a LOW and a HIGH of 80 µs each, then
   * 40 bits: humidity, a zero, temperature, a zero, and their sum. Each bit is
   * 50 µs LOW and then HIGH for 27 µs (a nought) or 70 µs (a one).
   */
  private dhtAsked(
    boardId: string,
    pin: number,
    key: PinKey,
    drive: PinDrive,
    timeMs: number,
  ): ScheduledInput[] {
    if (drive === 'low') {
      if (!this.wentLowAt.has(key)) this.wentLowAt.set(key, timeMs);
      return [];
    }
    const since = this.wentLowAt.get(key);
    this.wentLowAt.delete(key);
    if (since === undefined || timeMs - since < DHT11_START_MS) return [];
    const scheduled: ScheduledInput[] = [];
    for (const sensor of this.dhts) {
      if (sensor.data !== key || !this.powered(sensor.id)) continue;
      if (timeMs < (this.dhtBusyUntil.get(sensor.id) ?? 0)) continue; // still answering
      const humidity = Math.round(sensor.humidity);
      const celsius = Math.round(sensor.celsius);
      const bytes = [humidity, 0, celsius, 0, (humidity + celsius) & 0xff];
      const input = { boardId, pin, sensorId: sensor.id, asIs: true };
      let at = timeMs * 1000 + DHT11_TIMING_US.pause;
      const edge = (level: boolean, lastsUs: number) => {
        scheduled.push({ ...input, timeMs: at / 1000, level });
        at += lastsUs;
      };
      edge(false, DHT11_TIMING_US.low);
      edge(true, DHT11_TIMING_US.high);
      for (const byte of bytes) {
        for (let bit = 7; bit >= 0; bit--) {
          edge(false, DHT11_TIMING_US.bitLow);
          edge(true, (byte >> bit) & 1 ? DHT11_TIMING_US.one : DHT11_TIMING_US.zero);
        }
      }
      edge(false, DHT11_TIMING_US.bitLow);
      // The sensor lets go and the pull-up takes the line HIGH again.
      scheduled.push({ ...input, timeMs: at / 1000, level: true });
      this.dhtBusyUntil.set(sensor.id, at / 1000);
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
