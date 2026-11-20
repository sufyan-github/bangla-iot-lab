import blinkHex from '@banglalab/board-emulators/fixtures/starters/blink.hex?raw';
import blinkSource from '@banglalab/board-emulators/fixtures/starters/blink.ino?raw';
import buttonHex from '@banglalab/board-emulators/fixtures/starters/button.hex?raw';
import buttonSource from '@banglalab/board-emulators/fixtures/starters/button.ino?raw';
import fadeHex from '@banglalab/board-emulators/fixtures/starters/fade.hex?raw';
import fadeSource from '@banglalab/board-emulators/fixtures/starters/fade.ino?raw';
import knobHex from '@banglalab/board-emulators/fixtures/starters/knob.hex?raw';
import knobSource from '@banglalab/board-emulators/fixtures/starters/knob.ino?raw';
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
} as const;

export type StarterId = keyof typeof STARTERS;
export const STARTER_IDS = Object.keys(STARTERS) as StarterId[];

export function starterProgram(id: StarterId): BoardProgram {
  const { source, hex } = STARTERS[id];
  return { source, hex, hexSource: source };
}

/** The starter a program is still identical to, if any. */
export function matchingStarter(source: string): StarterId | undefined {
  return STARTER_IDS.find((id) => STARTERS[id].source === source);
}
