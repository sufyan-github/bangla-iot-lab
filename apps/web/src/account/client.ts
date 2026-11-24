import { create } from 'zustand';
import { API_URL } from '../api';

/** Who is signed in, as the API describes them. */
export interface Me {
  user: {
    id: string;
    kind: 'adult' | 'learner';
    displayName: string;
    locale: string;
    /** A learner who signed up on their own. */
    ownAccount?: boolean;
  };
  schools: { schoolId: string; schoolName: string; role: string }[];
  classes: { classId: string; className: string; grade: number; pseudonym: string }[];
}

export interface ClassSummary {
  id: string;
  schoolId: string;
  name: string;
  grade: number;
  joinCodeExpiresAt: string | null;
  learners: number;
}

export interface Learner {
  enrolment: string;
  pseudonym: string;
  joinedAt: string;
}

/** An answer from the API: the body, or the error code it gave (or "offline"). */
export type Answer<T> = { ok: true; value: T } | { ok: false; error: string };

/** Calls the API with the session cookie. Never throws. */
export async function call<T>(path: string, body?: unknown): Promise<Answer<T>> {
  try {
    const response = await fetch(`${API_URL}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      credentials: 'include',
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) return { ok: false, error: json.error ?? `status-${response.status}` };
    return { ok: true, value: json as T };
  } catch {
    return { ok: false, error: 'offline' };
  }
}

/** The account, as far as this page knows: undefined while asking, null when signed out. */
export const useAccount = create<{
  me: Me | null | undefined;
  refresh(): Promise<void>;
  signOut(): Promise<void>;
}>((set) => ({
  me: undefined,
  async refresh() {
    const answer = await call<Me>('/v1/me');
    set({ me: answer.ok ? answer.value : null });
    // Progress made while offline goes now.
    if (answer.ok && answer.value.user.kind === 'learner') {
      const { flushProgress } = await import('./outbox');
      void flushProgress();
    }
  },
  async signOut() {
    await call('/v1/auth/sign-out', {});
    set({ me: null });
  },
}));
