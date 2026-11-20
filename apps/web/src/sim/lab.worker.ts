import type { CircuitDocument } from '@banglalab/shared';
import { SimulationSession, type SimulationFrame } from '@banglalab/simulation';
import { expose } from 'comlink';

/** Simulated time never runs ahead of real time by more than this per tick. */
const MAX_STEP_MS = 50;
const TICK_MS = 16;

let session: SimulationSession | null = null;
let report: ((frame: SimulationFrame) => void) | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let lastTick = 0;
let tickCount = 0;

function tick() {
  if (!session || !report) return;
  const now = performance.now();
  session.advance(Math.min(now - lastTick, MAX_STEP_MS));
  lastTick = now;
  // Report about 30 times a second; the processor still runs every tick.
  if (++tickCount % 2 === 0) report(session.frame());
  timer = setTimeout(tick, TICK_MS);
}

/** Starts or stops the real-time loop to match whether the circuit changes with time. */
function schedule() {
  clearTimeout(timer);
  timer = undefined;
  if (!session || !report) return;
  if (session.isTimeDependent) {
    lastTick = performance.now();
    timer = setTimeout(tick, TICK_MS);
  } else {
    // Nothing changes over time: one answer per edit is enough.
    report(session.frame());
  }
}

/**
 * Runs the circuit, and any programs on its boards, off the main thread.
 * Returns the ids of boards whose firmware could not be loaded.
 */
const api = {
  start(
    document: CircuitDocument,
    pressed: string[],
    firmware: Record<string, string>,
    onFrame: (frame: SimulationFrame) => void,
  ): string[] {
    session = new SimulationSession(document, pressed);
    report = onFrame;
    const failed: string[] = [];
    for (const [boardId, hex] of Object.entries(firmware)) {
      try {
        session.loadFirmware(boardId, hex);
      } catch {
        failed.push(boardId);
      }
    }
    schedule();
    return failed;
  },

  update(document: CircuitDocument, pressed: string[]): void {
    if (!session) return;
    session.update(document, pressed);
    if (!session.isTimeDependent) schedule();
  },

  /** Uploads new firmware to a board while the circuit keeps running. */
  upload(boardId: string, hex: string): boolean {
    if (!session) return false;
    try {
      session.loadFirmware(boardId, hex);
    } catch {
      return false;
    }
    schedule();
    return true;
  },

  stop(): void {
    clearTimeout(timer);
    timer = undefined;
    session = null;
    report = null;
  },
};

export type LabWorkerApi = typeof api;
expose(api);
