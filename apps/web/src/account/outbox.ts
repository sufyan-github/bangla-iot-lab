import { call, useAccount } from './client';

/**
 * A learner's lesson progress waiting to reach the server: kept on the device
 * so that work done offline is sent later. Each event has its own id, so one
 * sent twice is counted once.
 */
export interface ProgressEvent {
  id: string;
  lessonId: string;
  step: number;
  outcome: 'step-done' | 'lesson-done';
  at: string;
}

const KEY = 'banglalab.progress-outbox';
/** Never keep more than this many waiting; the oldest go first. */
const MAX_WAITING = 500;

function read(): ProgressEvent[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as ProgressEvent[];
  } catch {
    return [];
  }
}
function write(events: ProgressEvent[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(events.slice(-MAX_WAITING)));
  } catch {
    // Storage may be full or blocked; the progress is still saved with the project.
  }
}

let sending = false;
/** Sends what is waiting, if a learner is signed in. */
export async function flushProgress(): Promise<void> {
  if (sending || useAccount.getState().me?.user.kind !== 'learner') return;
  const waiting = read();
  if (waiting.length === 0) return;
  sending = true;
  const batch = waiting.slice(0, 200);
  const answer = await call<{ kept: number }>('/v1/progress', { events: batch });
  sending = false;
  if (answer.ok) {
    const sent = new Set(batch.map((event) => event.id));
    write(read().filter((event) => !sent.has(event.id)));
    if (waiting.length > batch.length) await flushProgress();
  }
}

/** Notes a learner's step or lesson done; nothing is kept for anyone else. */
export function recordProgress(event: Omit<ProgressEvent, 'id' | 'at'>): void {
  if (useAccount.getState().me?.user.kind !== 'learner') return;
  write([...read(), { ...event, id: crypto.randomUUID(), at: new Date().toISOString() }]);
  void flushProgress();
}

if (typeof window !== 'undefined') window.addEventListener('online', () => void flushProgress());
