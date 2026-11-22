import blinkHex from '@banglalab/board-emulators/fixtures/starters/blink.hex?raw';
import blinkSource from '@banglalab/board-emulators/fixtures/starters/blink.ino?raw';
import distanceHex from '@banglalab/board-emulators/fixtures/starters/distance.hex?raw';
import distanceSource from '@banglalab/board-emulators/fixtures/starters/distance.ino?raw';
import lcdHex from '@banglalab/board-emulators/fixtures/starters/lcd.hex?raw';
import lcdSource from '@banglalab/board-emulators/fixtures/starters/lcd.ino?raw';
import servoHex from '@banglalab/board-emulators/fixtures/starters/servo.hex?raw';
import servoSource from '@banglalab/board-emulators/fixtures/starters/servo.ino?raw';
import buttonHex from '@banglalab/board-emulators/fixtures/starters/button.hex?raw';
import buttonSource from '@banglalab/board-emulators/fixtures/starters/button.ino?raw';
import fadeHex from '@banglalab/board-emulators/fixtures/starters/fade.hex?raw';
import fadeSource from '@banglalab/board-emulators/fixtures/starters/fade.ino?raw';
import knobHex from '@banglalab/board-emulators/fixtures/starters/knob.hex?raw';
import knobSource from '@banglalab/board-emulators/fixtures/starters/knob.ino?raw';
import esp32BlinkSource from '@banglalab/board-emulators/fixtures/esp32-starters/blink.ino?raw';
import esp32ButtonSource from '@banglalab/board-emulators/fixtures/esp32-starters/button.ino?raw';
import esp32FadeSource from '@banglalab/board-emulators/fixtures/esp32-starters/fade.ino?raw';
import esp32KnobSource from '@banglalab/board-emulators/fixtures/esp32-starters/knob.ino?raw';
import esp32ServoSource from '@banglalab/board-emulators/fixtures/esp32-starters/servo.ino?raw';
import esp32DistanceSource from '@banglalab/board-emulators/fixtures/esp32-starters/distance.ino?raw';
import esp32DhtSource from '@banglalab/board-emulators/fixtures/esp32-starters/dht.ino?raw';
import esp32LightSource from '@banglalab/board-emulators/fixtures/esp32-starters/light.ino?raw';
import esp32MotionSource from '@banglalab/board-emulators/fixtures/esp32-starters/motion.ino?raw';
import esp32RgbSource from '@banglalab/board-emulators/fixtures/esp32-starters/rgb.ino?raw';
import esp32OledSource from '@banglalab/board-emulators/fixtures/esp32-starters/oled.ino?raw';
import esp32MotorSource from '@banglalab/board-emulators/fixtures/esp32-starters/motor.ino?raw';
import esp32RainSource from '@banglalab/board-emulators/fixtures/esp32-starters/rain.ino?raw';
import esp32SoilSource from '@banglalab/board-emulators/fixtures/esp32-starters/soil.ino?raw';
import esp32GasSource from '@banglalab/board-emulators/fixtures/esp32-starters/gas.ino?raw';
import esp32ObstacleSource from '@banglalab/board-emulators/fixtures/esp32-starters/obstacle.ino?raw';
import esp32BeepSource from '@banglalab/board-emulators/fixtures/esp32-starters/beep.ino?raw';
import esp32StreetlightSource from '@banglalab/board-emulators/fixtures/esp32-starters/streetlight.ino?raw';
import esp32RainalertSource from '@banglalab/board-emulators/fixtures/esp32-starters/rainalert.ino?raw';
import esp32DustbinSource from '@banglalab/board-emulators/fixtures/esp32-starters/dustbin.ino?raw';
import esp32SecuritySource from '@banglalab/board-emulators/fixtures/esp32-starters/security.ino?raw';
import esp32PlantSource from '@banglalab/board-emulators/fixtures/esp32-starters/plant.ino?raw';
import esp32AirqualitySource from '@banglalab/board-emulators/fixtures/esp32-starters/airquality.ino?raw';
import esp32ParkingSource from '@banglalab/board-emulators/fixtures/esp32-starters/parking.ino?raw';
import esp32RobotSource from '@banglalab/board-emulators/fixtures/esp32-starters/robot.ino?raw';
import esp32CounterSource from '@banglalab/board-emulators/fixtures/esp32-starters/counter.ino?raw';
import esp32RelaySource from '@banglalab/board-emulators/fixtures/esp32-starters/relay.ino?raw';
import esp32WateringSource from '@banglalab/board-emulators/fixtures/esp32-starters/watering.ino?raw';
import esp32WaterSource from '@banglalab/board-emulators/fixtures/esp32-starters/water.ino?raw';
import esp32PowerSource from '@banglalab/board-emulators/fixtures/esp32-starters/power.ino?raw';
import esp32WeatherSource from '@banglalab/board-emulators/fixtures/esp32-starters/weather.ino?raw';
import esp32MonitorSource from '@banglalab/board-emulators/fixtures/esp32-starters/monitor.ino?raw';
import type { MessageKey } from '@banglalab/i18n';
import type { ProgrammableType } from '@banglalab/shared';
import type { BoardProgram } from '../storage/projects';

/**
 * Ready-made programs. Each ships with firmware compiled at build time (a test
 * keeps the two in step), so it runs straight away without the compile server.
 */
export const STARTERS = {
  blink: { source: blinkSource, hex: blinkHex },
  button: { source: buttonSource, hex: buttonHex },
  fade: { source: fadeSource, hex: fadeHex },
  knob: { source: knobSource, hex: knobHex },
  servo: { source: servoSource, hex: servoHex },
  distance: { source: distanceSource, hex: distanceHex },
  lcd: { source: lcdSource, hex: lcdHex },
} as const;

/**
 * Ready-made programs for the ESP32 board, built against the lab's own board
 * library (experimental). Only their text is here; each built module (base64)
 * is a file of its own, fetched when the program is chosen, so that the app
 * itself stays small. All of them are kept for working offline.
 */
export const ESP32_STARTERS = {
  blink: { source: esp32BlinkSource },
  button: { source: esp32ButtonSource },
  fade: { source: esp32FadeSource },
  knob: { source: esp32KnobSource },
  servo: { source: esp32ServoSource },
  distance: { source: esp32DistanceSource },
  dht: { source: esp32DhtSource },
  light: { source: esp32LightSource },
  motion: { source: esp32MotionSource },
  rgb: { source: esp32RgbSource },
  oled: { source: esp32OledSource },
  motor: { source: esp32MotorSource },
  rain: { source: esp32RainSource },
  soil: { source: esp32SoilSource },
  gas: { source: esp32GasSource },
  obstacle: { source: esp32ObstacleSource },
  beep: { source: esp32BeepSource },
  streetlight: { source: esp32StreetlightSource },
  rainalert: { source: esp32RainalertSource },
  dustbin: { source: esp32DustbinSource },
  security: { source: esp32SecuritySource },
  plant: { source: esp32PlantSource },
  airquality: { source: esp32AirqualitySource },
  parking: { source: esp32ParkingSource },
  robot: { source: esp32RobotSource },
  counter: { source: esp32CounterSource },
  relay: { source: esp32RelaySource },
  watering: { source: esp32WateringSource },
  water: { source: esp32WaterSource },
  power: { source: esp32PowerSource },
  weather: { source: esp32WeatherSource },
  monitor: { source: esp32MonitorSource },
} as const;

export type StarterId = keyof typeof STARTERS;
export const STARTER_IDS = Object.keys(STARTERS) as StarterId[];

const BY_BOARD: Record<ProgrammableType, Record<string, { source: string }>> = {
  uno: STARTERS,
  esp32: ESP32_STARTERS,
};

const ESP32_FOLDER = '../../../../packages/board-emulators/fixtures/esp32-starters/';
const ESP32_MODULES = import.meta.glob<string>(
  '../../../../packages/board-emulators/fixtures/esp32-starters/*.wasm.base64',
  { query: '?raw', import: 'default' },
);

/** The ready-made programs a kind of board has, in the order they are offered. */
export function starterIds(board: ProgrammableType): string[] {
  return Object.keys(BY_BOARD[board]);
}

/** The name a ready-made program is listed under. */
export function starterLabel(board: ProgrammableType, id: string): MessageKey {
  return (board === 'uno' ? `code.starter.${id}` : `code.starter.esp32.${id}`) as MessageKey;
}

/** A ready-made program, with its built firmware, ready to upload. */
export async function starterProgram(
  id: string,
  board: ProgrammableType = 'uno',
): Promise<BoardProgram> {
  if (board === 'uno') {
    const starter = STARTERS[id as StarterId];
    if (!starter) throw new Error(`the uno board has no ready-made program "${id}"`);
    return { source: starter.source, hex: starter.hex, hexSource: starter.source };
  }
  const starter = ESP32_STARTERS[id as keyof typeof ESP32_STARTERS];
  const load = ESP32_MODULES[`${ESP32_FOLDER}${id}.wasm.base64`];
  if (!starter || !load) throw new Error(`the esp32 board has no ready-made program "${id}"`);
  return { source: starter.source, hex: (await load()).trim(), hexSource: starter.source };
}

/** The starter a program is still identical to, if any. */
export function matchingStarter(
  source: string,
  board: ProgrammableType = 'uno',
): string | undefined {
  return starterIds(board).find((id) => BY_BOARD[board][id]!.source === source);
}
