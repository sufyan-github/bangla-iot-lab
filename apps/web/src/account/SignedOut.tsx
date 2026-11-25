import { useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useT } from '../i18n';
import { useAccount } from './client';
import { LabPass } from './LabPass';
import { Field, Problem, input, primary, secondary, useSubmit } from './ui';

/**
 * The account page for someone signed out (D-096). One question first, "how
 * will you come in?", then one form at a time:
 *
 * - I have an account: an email (adults, teachers) or a sign-in name (learners
 *   with their own account), and a password;
 * - a new account: 18 or older with an email; under 18 with a guardian's email
 *   to approve; or a teacher, for a school;
 * - a class code or a lab pass: a class learner, who has no email.
 *
 * Every sign-in asks whether to stay signed in on this device; unticked, the
 * session ends when the browser closes, which is right on a shared computer.
 */
type Step =
  | { name: 'entry' }
  | { name: 'sign-in' }
  | { name: 'forgot' }
  | { name: 'new' }
  | { name: 'new-adult' }
  | { name: 'new-learner' }
  | { name: 'new-teacher' }
  | { name: 'class' }
  | { name: 'check-email'; email: string }
  | { name: 'ask-guardian'; email: string; username: string };

export function SignedOut() {
  const { t } = useT();
  const [step, setStep] = useState<Step>({ name: 'entry' });
  const go = (next: Step['name']) => setStep({ name: next } as Step);

  if (step.name === 'entry') {
    return (
      <div className="space-y-4" data-testid="entry">
        <p className="text-ink-soft">{t('account.about')}</p>
        <h2 className="text-xl font-semibold">{t('account.entryTitle')}</h2>
        <div className="space-y-3">
          <Choice
            testId="entry-sign-in"
            icon="key"
            title={t('account.entry.signIn')}
            about={t('account.entry.signInAbout')}
            onClick={() => go('sign-in')}
          />
          <Choice
            testId="entry-new"
            icon="new"
            title={t('account.entry.new')}
            about={t('account.entry.newAbout')}
            onClick={() => go('new')}
          />
          <Choice
            testId="entry-class"
            icon="class"
            title={t('account.entry.class')}
            about={t('account.entry.classAbout')}
            onClick={() => go('class')}
          />
        </div>
        <Link
          to="/account/guardian"
          data-testid="entry-guardian"
          className="btn btn-quiet -ml-2.5 text-sm"
        >
          {t('account.entry.guardian')}
        </Link>
      </div>
    );
  }

  const back = (to: Step['name'] = 'entry') => (
    <button
      type="button"
      data-testid="account-back"
      className="btn btn-quiet -ml-2.5 min-h-9 text-sm"
      onClick={() => go(to)}
    >
      ‹ {t('account.back')}
    </button>
  );

  return (
    <div className="space-y-4">
      {step.name === 'new-adult' || step.name === 'new-learner' || step.name === 'new-teacher'
        ? back('new')
        : back()}
      <Sheet>
        {step.name === 'sign-in' && <SignInForm onForgot={() => go('forgot')} />}
        {step.name === 'forgot' && <ForgotForm />}
        {step.name === 'new' && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">{t('account.newTitle')}</h2>
            <p className="font-medium">{t('account.ageQuestion')}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Choice
                testId="new-adult"
                icon="adult"
                title={t('account.adult')}
                onClick={() => go('new-adult')}
              />
              <Choice
                testId="new-learner"
                icon="learner"
                title={t('account.under18')}
                onClick={() => go('new-learner')}
              />
            </div>
            <button
              type="button"
              data-testid="new-teacher"
              className="btn btn-quiet -ml-2.5 text-sm"
              onClick={() => go('new-teacher')}
            >
              {t('account.teacherChoice')}
            </button>
          </div>
        )}
        {step.name === 'new-adult' && (
          <AdultForm onSent={(email) => setStep({ name: 'check-email', email })} />
        )}
        {step.name === 'new-learner' && (
          <LearnerForm
            onSent={(email, username) => setStep({ name: 'ask-guardian', email, username })}
          />
        )}
        {step.name === 'new-teacher' && (
          <TeacherSignUp onSent={(email) => setStep({ name: 'check-email', email })} />
        )}
        {step.name === 'class' && <ClassEntry />}
        {step.name === 'check-email' && (
          <Sent
            title={t('account.checkEmailTitle')}
            text={t('account.checkEmail', { email: step.email })}
            identifier={step.email}
          />
        )}
        {step.name === 'ask-guardian' && (
          <Sent
            title={t('account.askGuardianTitle')}
            text={t('account.askGuardian', { email: step.email, username: step.username })}
            identifier={step.username}
          />
        )}
      </Sheet>
    </div>
  );
}

function Sheet({ children }: { children: ReactNode }) {
  return (
    <section className="rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-[var(--shadow-raised)]">
      {children}
    </section>
  );
}

/** Drawings for the ways in: a key, a person joining, a class. */
const CHOICE_ICONS = {
  key: 'M14.5 9.5a4 4 0 1 1-1.2-2.9M14.5 9.5L20 15m-3-3l2 2m-4 0l2 2',
  new: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM3 20c.8-3.4 3.2-5 6-5s5.2 1.6 6 5M18 8v6M15 11h6',
  class: 'M4 5h16v10H4zM8 19l4-4 4 4M7.5 9h4M7.5 12h7',
  adult: 'M12 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM5 21c.9-4 3.6-6.5 7-6.5s6.1 2.5 7 6.5',
  learner: 'M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM7 20c.7-3 2.6-5 5-5s4.3 2 5 5M8.5 5.5L12 3l3.5 2.5',
} as const;

/** One way in: a whole row to press, with its drawing and a line saying what it is for. */
function Choice({
  title,
  about,
  icon,
  onClick,
  testId,
}: {
  title: string;
  about?: string;
  icon: keyof typeof CHOICE_ICONS;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className="group flex w-full items-center gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-3 text-left shadow-[0_1px_0_rgb(0_0_0/0.04)] transition-colors hover:border-amber sm:p-4"
    >
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[var(--radius-control)] bg-sunk text-ink-soft group-hover:bg-amber-soft group-hover:text-amber-deep">
        <svg
          viewBox="0 0 24 24"
          width="26"
          height="26"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d={CHOICE_ICONS[icon]} />
        </svg>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-lg leading-snug font-semibold">{title}</span>
        {about && <span className="block text-sm text-ink-soft">{about}</span>}
      </span>
      <svg
        viewBox="0 0 24 24"
        width="20"
        height="20"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        className="shrink-0 text-ink-faint group-hover:text-ink"
      >
        <path d="M9.5 6l6 6-6 6" />
      </svg>
    </button>
  );
}

/** "Keep me signed in on this device", unticked by default. */
function KeepSignedIn({
  checked,
  onChange,
  testId,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  testId: string;
}) {
  const { t } = useT();
  return (
    <label className="flex items-start gap-2 text-sm">
      <input
        type="checkbox"
        data-testid={testId}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-5 w-5 shrink-0 accent-amber"
      />
      <span>{t('account.keep')}</span>
    </label>
  );
}

function SignInForm({ onForgot }: { onForgot: () => void }) {
  const { t } = useT();
  const refresh = useAccount((s) => s.refresh);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [keep, setKeep] = useState(false);
  const signIn = useSubmit();
  const resend = useSubmit();
  const [resent, setResent] = useState(false);
  const waiting = signIn.error === 'email-not-verified' || signIn.error === 'awaiting-guardian';
  const send = async (event: FormEvent) => {
    event.preventDefault();
    setResent(false);
    if (await signIn.submit('/v1/auth/sign-in', { identifier, password, keep })) await refresh();
  };
  return (
    <form onSubmit={send} className="space-y-3" data-testid="sign-in-form">
      <h2 className="text-xl font-semibold">{t('account.signInTitle')}</h2>
      <Field label={t('account.identifier')}>
        <input
          data-testid="signin-identifier"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          required
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          className={input}
        />
      </Field>
      <Field label={t('account.password')}>
        <input
          data-testid="signin-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className={input}
        />
      </Field>
      <KeepSignedIn checked={keep} onChange={setKeep} testId="signin-keep" />
      <Problem error={signIn.error} />
      {waiting && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            data-testid="signin-resend"
            className={secondary}
            disabled={resend.busy}
            onClick={async () => {
              if (await resend.submit('/v1/auth/resend', { identifier })) setResent(true);
            }}
          >
            {t('account.resend')}
          </button>
          {resent && (
            <span role="status" className="text-sm text-accent">
              {t('account.resent')}
            </span>
          )}
          <Problem error={resend.error} />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          data-testid="signin-submit"
          disabled={signIn.busy}
          className={primary}
        >
          {t('account.signIn')}
        </button>
        <button
          type="button"
          data-testid="signin-forgot"
          className="btn btn-quiet min-h-9 text-sm"
          onClick={onForgot}
        >
          {t('account.forgot')}
        </button>
      </div>
    </form>
  );
}

function ForgotForm() {
  const { t } = useT();
  const [identifier, setIdentifier] = useState('');
  const [sent, setSent] = useState(false);
  const ask = useSubmit();
  return (
    <form
      className="space-y-3"
      onSubmit={async (event) => {
        event.preventDefault();
        if (await ask.submit('/v1/auth/forgot-password', { identifier })) setSent(true);
      }}
    >
      <h2 className="text-xl font-semibold">{t('account.forgotTitle')}</h2>
      <p className="text-sm text-ink-soft">{t('account.forgotAbout')}</p>
      <Field label={t('account.identifier')}>
        <input
          data-testid="forgot-identifier"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          required
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          className={input}
        />
      </Field>
      <Problem error={ask.error} />
      {sent ? (
        <p role="status" data-testid="forgot-sent" className="font-medium text-accent">
          {t('account.linkSent')}
        </p>
      ) : (
        <button type="submit" data-testid="forgot-submit" disabled={ask.busy} className={primary}>
          {t('account.sendLink')}
        </button>
      )}
    </form>
  );
}

function AdultForm({ onSent }: { onSent: (email: string) => void }) {
  const { t } = useT();
  const [form, setForm] = useState({ displayName: '', email: '', password: '' });
  const set = (key: keyof typeof form) => (event: { target: { value: string } }) =>
    setForm({ ...form, [key]: event.target.value });
  const made = useSubmit();
  return (
    <form
      className="space-y-3"
      data-testid="adult-form"
      onSubmit={async (event) => {
        event.preventDefault();
        if (await made.submit('/v1/auth/register', { ...form, adult: true })) onSent(form.email);
      }}
    >
      <h2 className="text-xl font-semibold">{t('account.newTitle')}</h2>
      <p className="text-sm text-ink-soft">{t('account.adultAbout')}</p>
      <Field label={t('account.yourName')}>
        <input
          data-testid="adult-name"
          value={form.displayName}
          onChange={set('displayName')}
          required
          maxLength={80}
          autoComplete="nickname"
          className={input}
        />
      </Field>
      <Field label={t('account.email')}>
        <input
          data-testid="adult-email"
          type="email"
          autoComplete="email"
          value={form.email}
          onChange={set('email')}
          required
          className={input}
        />
      </Field>
      <Field label={t('account.password')}>
        <input
          data-testid="adult-password"
          type="password"
          autoComplete="new-password"
          minLength={10}
          value={form.password}
          onChange={set('password')}
          required
          className={input}
        />
      </Field>
      <p className="text-sm text-ink-soft">{t('account.passwordRule')}</p>
      <Problem error={made.error} />
      <button type="submit" data-testid="adult-submit" disabled={made.busy} className={primary}>
        {t('account.create')}
      </button>
    </form>
  );
}

function LearnerForm({ onSent }: { onSent: (email: string, username: string) => void }) {
  const { t } = useT();
  const [form, setForm] = useState({
    username: '',
    pseudonym: '',
    password: '',
    guardianEmail: '',
  });
  const set = (key: keyof typeof form) => (event: { target: { value: string } }) =>
    setForm({ ...form, [key]: event.target.value });
  const made = useSubmit();
  return (
    <form
      className="space-y-3"
      data-testid="learner-form"
      onSubmit={async (event) => {
        event.preventDefault();
        if (await made.submit('/v1/auth/register-learner', form)) {
          onSent(form.guardianEmail, form.username.toLowerCase());
        }
      }}
    >
      <h2 className="text-xl font-semibold">{t('account.newTitle')}</h2>
      <p className="text-sm text-ink-soft">{t('account.learnerAbout')}</p>
      <Field label={t('account.pseudonym')}>
        <input
          data-testid="learner-pseudonym"
          value={form.pseudonym}
          onChange={set('pseudonym')}
          required
          minLength={2}
          maxLength={24}
          className={input}
        />
      </Field>
      <p className="text-sm text-ink-soft">{t('account.nicknameOwnRule')}</p>
      <Field label={t('account.username')}>
        <input
          data-testid="learner-username"
          value={form.username}
          onChange={set('username')}
          required
          pattern="[A-Za-z0-9][A-Za-z0-9._\-]{2,23}"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          className={`${input} font-mono`}
        />
      </Field>
      <p className="text-sm text-ink-soft">{t('account.usernameRule')}</p>
      <Field label={t('account.password')}>
        <input
          data-testid="learner-password"
          type="password"
          autoComplete="new-password"
          minLength={10}
          value={form.password}
          onChange={set('password')}
          required
          className={input}
        />
      </Field>
      <p className="text-sm text-ink-soft">{t('account.passwordRule')}</p>
      <Field label={t('account.guardianEmail')}>
        <input
          data-testid="learner-guardian"
          type="email"
          value={form.guardianEmail}
          onChange={set('guardianEmail')}
          required
          className={input}
        />
      </Field>
      <Problem error={made.error} />
      <button type="submit" data-testid="learner-submit" disabled={made.busy} className={primary}>
        {t('account.create')}
      </button>
    </form>
  );
}

/** After signing up: what to do next, and a way to have the email sent again. */
function Sent({ title, text, identifier }: { title: string; text: string; identifier: string }) {
  const { t } = useT();
  const resend = useSubmit();
  const [resent, setResent] = useState(false);
  return (
    <div className="space-y-3" data-testid="check-email" role="status">
      <h2 className="text-xl font-semibold">{title}</h2>
      <p>{text}</p>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className={secondary}
          disabled={resend.busy}
          onClick={async () => {
            if (await resend.submit('/v1/auth/resend', { identifier })) setResent(true);
          }}
        >
          {t('account.resend')}
        </button>
        {resent && <span className="text-sm text-accent">{t('account.resent')}</span>}
      </div>
      <Problem error={resend.error} />
    </div>
  );
}

/**
 * A teacher's account, for a school: a new school (which waits for the lab's
 * approval) or one whose admin sent an invitation. The email is confirmed by
 * a link before the first sign-in.
 */
function TeacherSignUp({ onSent }: { onSent: (email: string) => void }) {
  const { t } = useT();
  const [invited, setInvited] = useState(false);
  const [form, setForm] = useState({
    inviteCode: '',
    email: '',
    password: '',
    displayName: '',
    schoolName: '',
    district: '',
  });
  const { busy, error, submit } = useSubmit();
  const set = (key: keyof typeof form) => (event: { target: { value: string } }) =>
    setForm({ ...form, [key]: event.target.value });
  const send = async (event: FormEvent) => {
    event.preventDefault();
    const { email, password, displayName, inviteCode, schoolName, district } = form;
    const done = await submit(
      '/v1/auth/sign-up',
      invited
        ? { email, password, displayName, inviteCode }
        : { email, password, displayName, schoolName, district: district || undefined },
    );
    if (done) onSent(email);
  };
  return (
    <form onSubmit={send} className="space-y-3" data-testid="teacher-form">
      <h2 className="text-xl font-semibold">{t('account.teacherSignUp')}</h2>
      <Field label={t('account.displayName')}>
        <input
          data-testid="teacher-name"
          value={form.displayName}
          onChange={set('displayName')}
          required
          maxLength={80}
          className={input}
        />
      </Field>
      <div className="flex flex-wrap gap-2" role="group">
        <button
          type="button"
          className="chip"
          aria-pressed={!invited}
          onClick={() => setInvited(false)}
        >
          {t('account.newSchool')}
        </button>
        <button
          type="button"
          className="chip"
          data-testid="teacher-invited"
          aria-pressed={invited}
          onClick={() => setInvited(true)}
        >
          {t('account.haveInvite')}
        </button>
      </div>
      {invited ? (
        <Field label={t('account.inviteCode')}>
          <input
            data-testid="teacher-invite"
            value={form.inviteCode}
            onChange={set('inviteCode')}
            required
            autoComplete="off"
            spellCheck={false}
            maxLength={40}
            className={`${input} font-mono uppercase tracking-widest`}
          />
        </Field>
      ) : (
        <>
          <Field label={t('account.schoolName')}>
            <input
              data-testid="teacher-school"
              value={form.schoolName}
              onChange={set('schoolName')}
              required
              maxLength={80}
              className={input}
            />
          </Field>
          <Field label={t('account.district')}>
            <input
              value={form.district}
              onChange={set('district')}
              maxLength={60}
              className={input}
            />
          </Field>
        </>
      )}
      <Field label={t('account.email')}>
        <input
          data-testid="teacher-email"
          type="email"
          autoComplete="email"
          value={form.email}
          onChange={set('email')}
          required
          className={input}
        />
      </Field>
      <Field label={t('account.password')}>
        <input
          data-testid="teacher-password"
          type="password"
          autoComplete="new-password"
          minLength={10}
          value={form.password}
          onChange={set('password')}
          required
          className={input}
        />
      </Field>
      <p className="text-sm text-ink-soft">{t('account.passwordRule')}</p>
      <Problem error={error} />
      <button type="submit" data-testid="teacher-submit" disabled={busy} className={primary}>
        {t('account.signUp')}
      </button>
    </form>
  );
}

/** A class learner: join with the class's code, or come back with the key on the lab pass. */
function ClassEntry() {
  const { t } = useT();
  const refresh = useAccount((s) => s.refresh);
  const [code, setCode] = useState('');
  const [pseudonym, setPseudonym] = useState('');
  const [key, setKey] = useState('');
  const [keep, setKeep] = useState(false);
  const [keepKey, setKeepKey] = useState(false);
  const [joined, setJoined] = useState<{ key: string; className: string } | null>(null);
  const join = useSubmit();
  const signIn = useSubmit();
  if (joined) {
    return (
      <div className="space-y-4" data-testid="joined">
        <p className="text-lg font-semibold">{t('account.joined', { name: joined.className })}</p>
        <LabPass nickname={pseudonym} className={joined.className} passKey={joined.key} />
        <button type="button" onClick={() => void refresh()} className={primary}>
          {t('account.continue')}
        </button>
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <form
        className="space-y-3"
        onSubmit={async (event) => {
          event.preventDefault();
          const done = await join.submit<{ key: string; className: string }>('/v1/join', {
            code,
            pseudonym,
            keep,
          });
          if (done) setJoined(done);
        }}
      >
        <h2 className="text-xl font-semibold">{t('account.joinClass')}</h2>
        <Field label={t('account.classCode')}>
          <input
            data-testid="join-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
            maxLength={20}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            className={`${input} font-mono tracking-widest`}
          />
        </Field>
        <Field label={t('account.pseudonym')}>
          <input
            data-testid="join-pseudonym"
            value={pseudonym}
            onChange={(e) => setPseudonym(e.target.value)}
            required
            minLength={2}
            maxLength={24}
            className={input}
          />
        </Field>
        <p className="text-sm text-ink-soft">{t('account.pseudonymRule')}</p>
        <KeepSignedIn checked={keep} onChange={setKeep} testId="join-keep" />
        <Problem error={join.error} />
        <button type="submit" data-testid="join-submit" disabled={join.busy} className={primary}>
          {t('account.join')}
        </button>
      </form>
      <form
        className="space-y-3 border-t border-line pt-5"
        onSubmit={async (event) => {
          event.preventDefault();
          if (await signIn.submit('/v1/auth/key', { key, keep: keepKey })) await refresh();
        }}
      >
        <h2 className="text-lg font-semibold">{t('account.keySignIn')}</h2>
        <Field label={t('account.key')}>
          <input
            data-testid="key-input"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            required
            maxLength={30}
            autoCapitalize="characters"
            autoComplete="current-password"
            spellCheck={false}
            className={`${input} font-mono tracking-widest`}
          />
        </Field>
        <KeepSignedIn checked={keepKey} onChange={setKeepKey} testId="key-keep" />
        <Problem error={signIn.error} />
        <button type="submit" data-testid="key-submit" disabled={signIn.busy} className={secondary}>
          {t('account.signIn')}
        </button>
      </form>
    </div>
  );
}
