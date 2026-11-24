import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useT } from '../i18n';
import { call, useAccount } from './client';
import { Field, Problem, input, primary, useSubmit } from './ui';

/**
 * The pages an email's link opens (D-096): /account/verify (an adult confirms
 * their email), /account/approve (a guardian approves a learner's own account)
 * and /account/reset (a new password). The token comes after # in the link, so
 * it never reaches a server log; the page takes it out of the address bar at
 * once, then asks the API what the link is for before anything is done.
 */
type Purpose = 'verify-email' | 'approve-learner' | 'reset-password';

interface LinkInfo {
  purpose: Purpose;
  displayName: string;
  username: string | null;
}

/** The token from the address, read once and removed from it. */
function useLinkToken(): string {
  const [token] = useState(() => window.location.hash.slice(1));
  useEffect(() => {
    if (window.location.hash) {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }, []);
  return token;
}

export function EmailLinkPage({ expected }: { expected: Purpose }) {
  const { t } = useT();
  const token = useLinkToken();
  const [info, setInfo] = useState<LinkInfo | null | undefined>(undefined);
  useEffect(() => {
    if (!token) {
      setInfo(null);
      return;
    }
    void call<LinkInfo>('/v1/auth/email-link', { token }).then((answer) =>
      setInfo(answer.ok && answer.value.purpose === expected ? answer.value : null),
    );
  }, [token, expected]);

  return (
    <main className="mx-auto w-full max-w-xl space-y-6 px-4 py-6" data-testid="email-link-page">
      <section className="space-y-4 rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-[var(--shadow-raised)]">
        {info === undefined ? (
          <p className="text-ink-soft">{t('link.checking')}</p>
        ) : info === null ? (
          <>
            <Problem error="link-not-working" />
            <Link to="/account" className="btn btn-secondary">
              {t('link.toSignIn')}
            </Link>
          </>
        ) : expected === 'verify-email' ? (
          <Verify token={token} info={info} />
        ) : expected === 'approve-learner' ? (
          <Approve token={token} info={info} />
        ) : (
          <Reset token={token} info={info} />
        )}
      </section>
    </main>
  );
}

function Verify({ token, info }: { token: string; info: LinkInfo }) {
  const { t } = useT();
  const refresh = useAccount((s) => s.refresh);
  const navigate = useNavigate();
  const [keep, setKeep] = useState(false);
  const verify = useSubmit();
  return (
    <form
      className="space-y-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (await verify.submit('/v1/auth/verify-email', { token, keep })) {
          await refresh();
          void navigate('/account');
        }
      }}
    >
      <h1 className="text-2xl font-bold">{t('link.verifyTitle')}</h1>
      <p>{t('link.verifyAbout', { name: info.displayName })}</p>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={keep}
          onChange={(e) => setKeep(e.target.checked)}
          className="mt-1 h-5 w-5 shrink-0 accent-amber"
        />
        <span>{t('account.keep')}</span>
      </label>
      <Problem error={verify.error} />
      <button type="submit" data-testid="verify-submit" disabled={verify.busy} className={primary}>
        {t('link.verify')}
      </button>
    </form>
  );
}

function Approve({ token, info }: { token: string; info: LinkInfo }) {
  const { t } = useT();
  const [confirmed, setConfirmed] = useState(false);
  const [done, setDone] = useState(false);
  const approve = useSubmit();
  if (done) {
    return (
      <p role="status" data-testid="approved" className="text-lg font-semibold text-accent">
        {t('link.approved', { name: info.displayName })}
      </p>
    );
  }
  return (
    <form
      className="space-y-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (await approve.submit('/v1/auth/approve-learner', { token })) setDone(true);
      }}
    >
      <h1 className="text-2xl font-bold">{t('link.approveTitle')}</h1>
      <p>{t('link.approveAbout', { name: info.displayName, username: info.username ?? '' })}</p>
      <p className="text-sm text-ink-soft">{t('link.approveKept')}</p>
      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          data-testid="approve-confirm"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          className="mt-1 h-5 w-5 shrink-0 accent-amber"
        />
        <span>{t('link.approveConfirm')}</span>
      </label>
      <Problem error={approve.error} />
      <button
        type="submit"
        data-testid="approve-submit"
        disabled={approve.busy || !confirmed}
        className={primary}
      >
        {t('link.approve')}
      </button>
      <p className="text-sm text-ink-soft">{t('link.notYou')}</p>
    </form>
  );
}

function Reset({ token, info }: { token: string; info: LinkInfo }) {
  const { t } = useT();
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);
  const reset = useSubmit();
  if (done) {
    return (
      <div className="space-y-4" role="status" data-testid="password-saved">
        <p className="font-semibold text-accent">{t('link.passwordSaved')}</p>
        <Link to="/account" className={primary}>
          {t('link.toSignIn')}
        </Link>
      </div>
    );
  }
  return (
    <form
      className="space-y-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (await reset.submit('/v1/auth/reset-password', { token, password })) setDone(true);
      }}
    >
      <h1 className="text-2xl font-bold">{t('link.resetTitle')}</h1>
      <p className="text-ink-soft">
        {t('link.resetFor', { name: info.username ?? info.displayName })}
      </p>
      {/* The sign-in name, for the browser's password manager to save with the new password. */}
      <input type="text" autoComplete="username" value={info.username ?? ''} readOnly hidden />
      <Field label={t('link.newPassword')}>
        <input
          data-testid="reset-password"
          type="password"
          autoComplete="new-password"
          minLength={10}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className={input}
        />
      </Field>
      <p className="text-sm text-ink-soft">{t('account.passwordRule')}</p>
      <Problem error={reset.error} />
      <button type="submit" data-testid="reset-submit" disabled={reset.busy} className={primary}>
        {t('link.savePassword')}
      </button>
    </form>
  );
}
