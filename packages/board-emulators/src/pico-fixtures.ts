import { readFileSync } from 'node:fs';
import { PicoBoard } from './pico';

/**
 * Builds a PicoBoard from the files fetched by `pnpm pico:fetch`. Used by the
 * integration test and the benchmark; the web app will load the same two files
 * as assets once the Pico is added to the lab.
 */
export function createPicoFromVendor(): PicoBoard {
  const read = (name: string) => {
    try {
      return readFileSync(new URL(`../vendor/${name}`, import.meta.url));
    } catch {
      throw new Error(`Missing ${name}. Run: pnpm --filter @banglalab/board-emulators pico:fetch`);
    }
  };
  const rom = read('bootrom-b1.bin');
  const bootrom = new Uint32Array(rom.buffer, rom.byteOffset, rom.byteLength / 4);
  return new PicoBoard(bootrom, read('micropython-pico.uf2'));
}
