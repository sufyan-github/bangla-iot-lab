import { call, useAccount } from './client';

/**
 * A learner's lesson progress waiting to reach the server: kept on the device
 * so that work done offline is sent later. Each event has its own id, so one
 * sent twice is counted once, and names whose progress it is, so on a shared
 * device one learner's steps are never sent as another's.
 */
export interface ProgressEvent {
  id: string;
  /** The account that made the progress. Older entries without one are not sent. */
  userId?: string;
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

/** Whether this account's progress is kept: learners and people on their own, not teachers. */
const recorded = () => {
  const me = useAccount.getState().me;
  return me && me.user.account !== 'staff' ? me.user.id : null;
};

let sending = false;
/** Sends what is waiting for the account signed in, if its progress is kept. */
export async function flushProgress(): Promise<void> {
  const userId = recorded();
  if (sending || !userId) return;
  const waiting = read().filter((event) => event.userId === userId);
  if (waiting.length === 0) return;
  sending = true;
  const batch = waiting.slice(0, 200).map(({ userId: _owner, ...event }) => event);
  const answer = await call<{ kept: number }>('/v1/progress', { events: batch });
  sending = false;
  if (answer.ok) {
    const sent = new Set(batch.map((event) => event.id));
    write(read().filter((event) => !sent.has(event.id)));
    if (waiting.length > batch.length) await flushProgress();
  }
}

/** Notes a step or lesson done by the account signed in; nothing is kept for teachers. */
export function recordProgress(event: Omit<ProgressEvent, 'id' | 'at' | 'userId'>): void {
  const userId = recorded();
  if (!userId) return;
  write([...read(), { ...event, userId, id: crypto.randomUUID(), at: new Date().toISOString() }]);
  void flushProgress();
}

/** Before signing out: send what can be sent, then take the rest of this account's off the device. */
export async function forgetProgress(userId: string): Promise<void> {
  await flushProgress();
  write(read().filter((event) => event.userId !== userId));
}

if (typeof window !== 'undefined') window.addEventListener('online', () => void flushProgress());
