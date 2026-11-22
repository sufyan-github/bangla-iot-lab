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
import esp32BlinkModule from '@banglalab/board-emulators/fixtures/esp32-starters/blink.wasm.base64?raw';
import esp32ButtonSource from '@banglalab/board-emulators/fixtures/esp32-starters/button.ino?raw';
import esp32ButtonModule from '@banglalab/board-emulators/fixtures/esp32-starters/button.wasm.base64?raw';
import esp32FadeSource from '@banglalab/board-emulators/fixtures/esp32-starters/fade.ino?raw';
import esp32FadeModule from '@banglalab/board-emulators/fixtures/esp32-starters/fade.wasm.base64?raw';
import esp32KnobSource from '@banglalab/board-emulators/fixtures/esp32-starters/knob.ino?raw';
import esp32KnobModule from '@banglalab/board-emulators/fixtures/esp32-starters/knob.wasm.base64?raw';
import esp32ServoSource from '@banglalab/board-emulators/fixtures/esp32-starters/servo.ino?raw';
import esp32ServoModule from '@banglalab/board-emulators/fixtures/esp32-starters/servo.wasm.base64?raw';
import esp32DistanceSource from '@banglalab/board-emulators/fixtures/esp32-starters/distance.ino?raw';
import esp32DistanceModule from '@banglalab/board-emulators/fixtures/esp32-starters/distance.wasm.base64?raw';
import esp32DhtSource from '@banglalab/board-emulators/fixtures/esp32-starters/dht.ino?raw';
import esp32DhtModule from '@banglalab/board-emulators/fixtures/esp32-starters/dht.wasm.base64?raw';
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
 * library (experimental). `hex` here is the sketch module in base64.
 */
export const ESP32_STARTERS = {
  blink: { source: esp32BlinkSource, hex: esp32BlinkModule },
  button: { source: esp32ButtonSource, hex: esp32ButtonModule },
  fade: { source: esp32FadeSource, hex: esp32FadeModule },
  knob: { source: esp32KnobSource, hex: esp32KnobModule },
  servo: { source: esp32ServoSource, hex: esp32ServoModule },
  distance: { source: esp32DistanceSource, hex: esp32DistanceModule },
  dht: { source: esp32DhtSource, hex: esp32DhtModule },
} as const;

export type StarterId = keyof typeof STARTERS;
export const STARTER_IDS = Object.keys(STARTERS) as StarterId[];

const BY_BOARD: Record<ProgrammableType, Record<string, { source: string; hex: string }>> = {
  uno: STARTERS,
  esp32: ESP32_STARTERS,
};

/** The ready-made programs a kind of board has, in the order they are offered. */
export function starterIds(board: ProgrammableType): string[] {
  return Object.keys(BY_BOARD[board]);
}

/** The name a ready-made program is listed under. */
export function starterLabel(board: ProgrammableType, id: string): MessageKey {
  return (board === 'uno' ? `code.starter.${id}` : `code.starter.esp32.${id}`) as MessageKey;
}

export function starterProgram(id: string, board: ProgrammableType = 'uno'): BoardProgram {
  const starter = BY_BOARD[board][id];
  if (!starter) throw new Error(`the ${board} board has no ready-made program "${id}"`);
  return { source: starter.source, hex: starter.hex, hexSource: starter.source };
}

/** The starter a program is still identical to, if any. */
export function matchingStarter(
  source: string,
  board: ProgrammableType = 'uno',
): string | undefined {
  return starterIds(board).find((id) => BY_BOARD[board][id]!.source === source);
}
