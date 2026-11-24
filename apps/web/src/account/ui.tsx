import type { MessageKey } from '@banglalab/i18n';
import { useState, type ReactNode } from 'react';
import { useT } from '../i18n';
import { call } from './client';

/** Pieces the account pages share: fields, errors, codes shown once, form posting. */
export const input = 'field';
export const primary = 'btn btn-primary px-5';
export const secondary = 'btn btn-secondary';

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-ink-soft">{label}</span>
      {children}
    </label>
  );
}

/** Errors the page explains; anything else is "something went wrong". */
const KNOWN_ERRORS = [
  'email-taken',
  'wrong-email-or-password',
  'pseudonym-taken',
  'no-such-code',
  'wrong-key',
  'offline',
  'bad-request',
  'already-set',
  'no-such-invite',
  'already-in-class',
  'email-not-verified',
  'awaiting-guardian',
  'username-taken',
  'too-many-tries',
  'link-not-working',
  'account-suspended',
  'wrong-password',
  'admin-stays',
  'owner-stays',
];

export function Problem({ error }: { error: string | null }) {
  const { t } = useT();
  if (!error) return null;
  return (
    <p role="alert" data-testid="account-problem" className="text-sm font-medium text-danger">
      {t(`account.error.${KNOWN_ERRORS.includes(error) ? error : 'other'}` as MessageKey)}
    </p>
  );
}

/**
 * A secret shown once: a join code or a learner's key, written large in
 * chalk on a slate, so a teacher can copy it onto the classroom's board.
 */
export function ShownOnce({
  label,
  value,
  testId,
  note,
}: {
  label: string;
  value: string;
  testId: string;
  note?: string;
}) {
  const { t } = useT();
  return (
    <div className="rounded-[var(--radius-card)] border-[6px] border-[#8a6a43] bg-[#23332d] p-4 text-chalk shadow-[var(--shadow-raised)]">
      <p className="text-sm text-chalk/75">{label}</p>
      <p
        data-testid={testId}
        className="my-2 font-mono text-3xl font-bold tracking-[0.18em] text-[#f4f1e8] [text-shadow:0_0_1px_rgb(255_255_255/0.6)] sm:text-4xl"
      >
        {value}
      </p>
      <p className="text-sm text-chalk/70">{note ?? t('account.shownOnce')}</p>
    </div>
  );
}

/** A form that posts to the API and reports its error, if any. */
export function useSubmit() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async <T,>(path: string, body: unknown): Promise<T | null> => {
    setBusy(true);
    setError(null);
    const answer = await call<T>(path, body);
    setBusy(false);
    if (!answer.ok) {
      setError(answer.error);
      return null;
    }
    return answer.value;
  };
  return { busy, error, submit };
}
