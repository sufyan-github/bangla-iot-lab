import type { CircuitDocument } from '@banglalab/shared';
import {
  SimulationSession,
  esp32Emulator,
  parseEsp32Firmware,
  setEsp32Emulator,
  type Probe,
  type SimulationFrame,
} from '@banglalab/simulation';
import { expose } from 'comlink';

/** Simulated time never runs ahead of real time by more than this per tick. */
const MAX_STEP_MS = 50;
const TICK_MS = 16;

let session: SimulationSession | null = null;
let report: ((frame: SimulationFrame) => void) | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let lastTick = 0;
let tickCount = 0;
let probes: Probe[] = [];

/** Real milliseconds one tick may spend simulating, so the page still hears from us often. */
const TICK_BUDGET_MS = 40;
/** Real milliseconds it has lately cost to simulate one millisecond. */
let costPerMs = 0;
/** Simulated and real time since `speed` was last worked out. */
let simulated = 0;
let measuredFrom = 0;
let speed = 1;

function tick() {
  if (!session || !report) return;
  const now = performance.now();
  const wanted = Math.min(now - lastTick, MAX_STEP_MS);
  // A board that cannot keep up with real time (a chip emulator running a busy
  // program) is given less to do each tick: the circuit then runs in slow
  // motion, and says so, instead of the page freezing.
  const step = costPerMs > 0 ? Math.min(wanted, Math.max(1, TICK_BUDGET_MS / costPerMs)) : wanted;
  session.advance(step);
  const cost = performance.now() - now;
  if (step > 0) costPerMs = costPerMs * 0.7 + (cost / step) * 0.3;
  lastTick = now;
  simulated += step;
  const after = performance.now();
  if (after - measuredFrom >= 1000) {
    speed = Math.min(1, simulated / (after - measuredFrom));
    simulated = 0;
    measuredFrom = after;
  }
  // Report about 30 times a second; the processor still runs every tick.
  if (++tickCount % 2 === 0) report({ ...session.frame(), speed });
  timer = setTimeout(tick, TICK_MS);
}

/**
 * Fetches the chip emulator the first time a program needs it: several
 * megabytes that a student who never chooses that engine never downloads.
 */
let emulatorLoading: Promise<void> | undefined;
function ensureEmulator(): Promise<void> {
  if (esp32Emulator()) return Promise.resolve();
  emulatorLoading ??= (async () => {
    const [module, rom] = await Promise.all([
      fetch('/esp32sim/esp32sim.wasm').then((response) => {
        if (!response.ok) throw new Error('the chip emulator is not part of this build');
        return response.arrayBuffer().then((bytes) => WebAssembly.compile(bytes));
      }),
      fetch('/esp32sim/esp32_rev300_rom.elf').then((response) => {
        if (!response.ok) throw new Error('the chip emulator is not part of this build');
        return response.arrayBuffer();
      }),
    ]);
    setEsp32Emulator({ module, rom: new Uint8Array(rom) });
  })();
  emulatorLoading.catch(() => (emulatorLoading = undefined));
  return emulatorLoading;
}

/** Loads a program onto a board, fetching the emulator first if the program is real firmware. */
async function load(boardId: string, program: string): Promise<boolean> {
  try {
    if (parseEsp32Firmware(program)) await ensureEmulator();
    if (!session) return false;
    session.loadFirmware(boardId, program);
    return true;
  } catch {
    return false;
  }
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
  async start(
    document: CircuitDocument,
    pressed: string[],
    firmware: Record<string, string>,
    onFrame: (frame: SimulationFrame) => void,
    settings: Record<string, string> = {},
  ): Promise<string[]> {
    const started = (session = new SimulationSession(document, pressed));
    for (const [boardId, saved] of Object.entries(settings)) session.setSettings(boardId, saved);
    session.setProbes(probes);
    report = onFrame;
    costPerMs = 0;
    simulated = 0;
    measuredFrom = performance.now();
    speed = 1;
    const failed: string[] = [];
    for (const [boardId, program] of Object.entries(firmware)) {
      if (!(await load(boardId, program))) failed.push(boardId);
    }
    // The circuit may have been stopped, or started again, while the emulator was fetched.
    if (session === started) schedule();
    return failed;
  },

  update(document: CircuitDocument, pressed: string[]): void {
    if (!session) return;
    session.update(document, pressed);
    if (!session.isTimeDependent) schedule();
  },

  /** Uploads new firmware to a board while the circuit keeps running. */
  async upload(boardId: string, program: string): Promise<boolean> {
    if (!session) return false;
    const loaded = await load(boardId, program);
    if (loaded) {
      costPerMs = 0;
      schedule();
    }
    return loaded;
  },

  /** Text typed on a module's phone panel: a Bluetooth message or an SMS. */
  phone(partId: string, text: string): void {
    session?.phone(partId, text);
  },

  /** Chooses the signals recorded for the oscilloscope; remembered across runs. */
  setProbes(next: Probe[]): void {
    probes = next;
    session?.setProbes(next);
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
