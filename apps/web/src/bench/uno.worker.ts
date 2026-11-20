import { UnoBoard } from '@banglalab/board-emulators';
import { expose } from 'comlink';

export interface BenchUpdate {
  /** Simulated time since reset, milliseconds. */
  timeMs: number;
  /** Level of pin 13 (the on-board LED) at the end of this slice. */
  led: boolean;
  /** Serial text sent since the previous update. */
  serial: string;
}

let timer: ReturnType<typeof setTimeout> | undefined;

/** Runs the UNO emulator in real time, off the main thread. */
const api = {
  start(hex: string, onUpdate: (update: BenchUpdate) => void): void {
    api.stop();
    const board = new UnoBoard(hex);
    let serial = '';
    board.onSerial((text) => (serial += text));
    let last = performance.now();

    const tick = () => {
      const now = performance.now();
      // Cap the slice so a throttled background tab does not freeze trying to catch up.
      board.runFor(Math.min(now - last, 100));
      last = now;
      onUpdate({ timeMs: board.timeMs, led: board.digitalRead(13), serial });
      serial = '';
      timer = setTimeout(tick, 16);
    };
    tick();
  },
  stop(): void {
    clearTimeout(timer);
    timer = undefined;
  },
};

export type BenchApi = typeof api;
expose(api);
