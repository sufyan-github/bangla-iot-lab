import type { MessageKey } from '@banglalab/i18n';
import { LESSONS } from '@banglalab/lessons';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useT } from '../i18n';
import { call, useAccount, type ClassSummary, type Learner } from './client';

const input = 'min-h-11 w-full rounded-lg border-2 border-line bg-surface px-3';
const primary =
  'min-h-11 rounded-xl bg-amber px-5 font-semibold text-ink hover:brightness-105 disabled:opacity-60';
const secondary = 'min-h-11 rounded-lg border-2 border-line px-3 font-medium hover:border-ink-soft';

function Field({ label, children }: { label: string; children: ReactNode }) {
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
];

function Problem({ error }: { error: string | null }) {
  const { t } = useT();
  if (!error) return null;
  return (
    <p role="alert" data-testid="account-problem" className="text-sm font-medium text-danger">
      {t(`account.error.${KNOWN_ERRORS.includes(error) ? error : 'other'}` as MessageKey)}
    </p>
  );
}

/** A secret shown once: a join code or a learner's key. */
function ShownOnce({ label, value, testId }: { label: string; value: string; testId: string }) {
  const { t } = useT();
  return (
    <div className="rounded-xl border-2 border-amber bg-amber-soft p-3">
      <p className="text-sm">{label}</p>
      <p data-testid={testId} className="my-1 font-mono text-2xl font-bold tracking-widest">
        {value}
      </p>
      <p className="text-sm text-ink-soft">{t('account.shownOnce')}</p>
    </div>
  );
}

/** A form that posts to the API and reports its error, if any. */
function useSubmit() {
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

function TeacherSignIn() {
  const { t } = useT();
  const refresh = useAccount((s) => s.refresh);
  const [signUp, setSignUp] = useState(false);
  const [form, setForm] = useState({
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
    const done = signUp
      ? await submit('/v1/auth/sign-up', {
          ...form,
          ...(form.district ? {} : { district: undefined }),
        })
      : await submit('/v1/auth/sign-in', { email: form.email, password: form.password });
    if (done) await refresh();
  };
  return (
    <form onSubmit={send} className="space-y-3" data-testid="teacher-form">
      <h2 className="text-lg font-semibold">
        {t(signUp ? 'account.teacherSignUp' : 'account.teacherSignIn')}
      </h2>
      {signUp && (
        <>
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
          autoComplete={signUp ? 'new-password' : 'current-password'}
          minLength={signUp ? 10 : undefined}
          value={form.password}
          onChange={set('password')}
          required
          className={input}
        />
      </Field>
      {signUp && <p className="text-sm text-ink-soft">{t('account.passwordRule')}</p>}
      <Problem error={error} />
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" data-testid="teacher-submit" disabled={busy} className={primary}>
          {t(signUp ? 'account.signUp' : 'account.signIn')}
        </button>
        <button
          type="button"
          data-testid="teacher-switch"
          onClick={() => setSignUp(!signUp)}
          className="text-sm font-medium text-mat underline"
        >
          {t(signUp ? 'account.haveAccount' : 'account.newTeacher')}
        </button>
      </div>
    </form>
  );
}

function LearnerJoin() {
  const { t } = useT();
  const refresh = useAccount((s) => s.refresh);
  const [code, setCode] = useState('');
  const [pseudonym, setPseudonym] = useState('');
  const [key, setKey] = useState('');
  const [joined, setJoined] = useState<{ key: string; className: string } | null>(null);
  const join = useSubmit();
  const signIn = useSubmit();
  if (joined) {
    return (
      <div className="space-y-3" data-testid="joined">
        <p className="font-semibold">{t('account.joined', { name: joined.className })}</p>
        <ShownOnce label={t('account.yourKey')} value={joined.key} testId="learner-key" />
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
          });
          if (done) setJoined(done);
        }}
      >
        <h2 className="text-lg font-semibold">{t('account.joinClass')}</h2>
        <Field label={t('account.classCode')}>
          <input
            data-testid="join-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
            autoCapitalize="characters"
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
        <Problem error={join.error} />
        <button type="submit" data-testid="join-submit" disabled={join.busy} className={primary}>
          {t('account.join')}
        </button>
      </form>
      <form
        className="space-y-3 border-t border-line pt-4"
        onSubmit={async (event) => {
          event.preventDefault();
          if (await signIn.submit('/v1/auth/key', { key })) await refresh();
        }}
      >
        <h2 className="text-lg font-semibold">{t('account.keySignIn')}</h2>
        <Field label={t('account.key')}>
          <input
            data-testid="key-input"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            required
            autoCapitalize="characters"
            className={`${input} font-mono tracking-widest`}
          />
        </Field>
        <Problem error={signIn.error} />
        <button type="submit" data-testid="key-submit" disabled={signIn.busy} className={secondary}>
          {t('account.signIn')}
        </button>
      </form>
    </div>
  );
}

function Roster({ classId }: { classId: string }) {
  const { t, number } = useT();
  const [learners, setLearners] = useState<Learner[] | null>(null);
  const [newKey, setNewKey] = useState<{ pseudonym: string; key: string } | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const load = async () => {
    const answer = await call<{ learners: Learner[] }>(`/v1/classes/${classId}/learners`);
    setLearners(answer.ok ? answer.value.learners : []);
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId]);
  if (!learners) return <p className="text-sm text-ink-soft">{t('account.loading')}</p>;
  return (
    <div className="space-y-2" data-testid="roster">
      {newKey && (
        <ShownOnce
          label={t('account.newKeyFor', { name: newKey.pseudonym })}
          value={newKey.key}
          testId="new-learner-key"
        />
      )}
      {learners.length === 0 ? (
        <p className="text-sm text-ink-soft">{t('account.noLearners')}</p>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {learners.map((learner) => (
            <li
              key={learner.enrolment}
              className="flex flex-wrap items-center gap-2 px-3 py-2"
              data-testid="roster-learner"
            >
              <span className="flex-1 font-medium">{learner.pseudonym}</span>
              <button
                type="button"
                className="text-sm font-medium text-mat underline"
                onClick={async () => {
                  const answer = await call<{ key: string }>(
                    `/v1/classes/${classId}/learners/${learner.enrolment}/key`,
                    {},
                  );
                  if (answer.ok) setNewKey({ pseudonym: learner.pseudonym, key: answer.value.key });
                }}
              >
                {t('account.newKey')}
              </button>
              {confirming === learner.enrolment ? (
                <button
                  type="button"
                  data-testid="confirm-remove"
                  className="rounded-lg bg-danger px-2 py-1 text-sm font-semibold text-paper"
                  onClick={async () => {
                    await call(`/v1/classes/${classId}/learners/${learner.enrolment}/remove`, {});
                    setConfirming(null);
                    await load();
                  }}
                >
                  {t('account.confirmRemove', { name: learner.pseudonym })}
                </button>
              ) : (
                <button
                  type="button"
                  className="text-sm font-medium text-danger underline"
                  onClick={() => setConfirming(learner.enrolment)}
                >
                  {t('account.remove')}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-ink-soft">
        {t('account.learnerCount', { count: number(learners.length) })}
      </p>
    </div>
  );
}

interface ClassLesson {
  id: string;
  lessonId: string;
  dueAt: string | null;
  started: number;
  finished: number;
}

/** The lessons set for a class, with how many learners started and finished each. */
function ClassLessons({ classId }: { classId: string }) {
  const { t, locale, number } = useT();
  const [summary, setSummary] = useState<{ learners: number; lessons: ClassLesson[] } | null>(null);
  const [choice, setChoice] = useState(LESSONS[0]!.id);
  const [due, setDue] = useState('');
  const { busy, error, submit } = useSubmit();
  const load = async () => {
    const answer = await call<{ learners: number; lessons: ClassLesson[] }>(
      `/v1/classes/${classId}/summary`,
    );
    setSummary(answer.ok ? answer.value : { learners: 0, lessons: [] });
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId]);
  const title = (id: string) => LESSONS.find((lesson) => lesson.id === id)?.title[locale] ?? id;
  if (!summary) return <p className="text-sm text-ink-soft">{t('account.loading')}</p>;
  return (
    <div className="space-y-2" data-testid="class-lessons">
      {summary.lessons.length === 0 ? (
        <p className="text-sm text-ink-soft">{t('account.noLessons')}</p>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {summary.lessons.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-center gap-2 px-3 py-2"
              data-testid="class-lesson"
              data-lesson={item.lessonId}
            >
              <span className="flex-1 font-medium">{title(item.lessonId)}</span>
              <span className="text-sm text-ink-soft" data-testid="lesson-counts">
                {t('account.lessonCounts', {
                  started: number(item.started),
                  finished: number(item.finished),
                  total: number(summary.learners),
                })}
              </span>
              {item.dueAt && (
                <span className="text-sm text-ink-soft">
                  {t('account.dueBy', { date: new Date(item.dueAt).toLocaleDateString() })}
                </span>
              )}
              <button
                type="button"
                className="text-sm font-medium text-danger underline"
                onClick={async () => {
                  await call(`/v1/classes/${classId}/assignments/${item.id}/remove`, {});
                  await load();
                }}
              >
                {t('account.remove')}
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={async (event) => {
          event.preventDefault();
          const done = await submit(`/v1/classes/${classId}/assignments`, {
            lessonId: choice,
            ...(due ? { dueAt: new Date(`${due}T23:59:00`).toISOString() } : {}),
          });
          if (done) await load();
        }}
      >
        <label className="min-w-48 flex-1">
          <span className="mb-1 block text-sm text-ink-soft">{t('account.setLesson')}</span>
          <select
            data-testid="assign-lesson"
            value={choice}
            onChange={(e) => setChoice(e.target.value)}
            className={input}
          >
            {LESSONS.map((lesson) => (
              <option key={lesson.id} value={lesson.id}>
                {number(lesson.order)}. {lesson.title[locale]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="mb-1 block text-sm text-ink-soft">{t('account.due')}</span>
          <input
            type="date"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            className={input}
          />
        </label>
        <button type="submit" data-testid="assign-submit" disabled={busy} className={secondary}>
          {t('account.set')}
        </button>
      </form>
      <Problem error={error} />
      <p className="text-xs text-ink-soft">{t('account.countsOnly')}</p>
    </div>
  );
}

function TeacherDashboard() {
  const { t, number } = useT();
  const me = useAccount((s) => s.me)!;
  const school = me.schools.find((s) => s.role === 'teacher');
  const [classes, setClasses] = useState<ClassSummary[] | null>(null);
  const [form, setForm] = useState({ name: '', grade: 6, consent: false });
  const [shownCode, setShownCode] = useState<{ classId: string; code: string } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [lessonsOpen, setLessonsOpen] = useState<string | null>(null);
  const [archiving, setArchiving] = useState<string | null>(null);
  const { busy, error, submit } = useSubmit();
  const load = async () => {
    const answer = await call<{ classes: ClassSummary[] }>('/v1/classes');
    setClasses(answer.ok ? answer.value.classes : []);
  };
  useEffect(() => void load(), []);

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-lg font-semibold">{t('account.yourClasses')}</h2>
        {school && <p className="text-sm text-ink-soft">{school.schoolName}</p>}
        {shownCode && (
          <div className="mt-3">
            <ShownOnce
              label={t('account.joinCodeFor')}
              value={shownCode.code}
              testId="join-code-shown"
            />
          </div>
        )}
        {classes === null ? (
          <p className="text-sm text-ink-soft">{t('account.loading')}</p>
        ) : classes.length === 0 ? (
          <p className="mt-2 text-sm text-ink-soft">{t('account.noClasses')}</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {classes.map((item) => (
              <li
                key={item.id}
                className="rounded-xl border-2 border-line p-3"
                data-testid="class-item"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex-1 font-semibold">
                    {item.name} · {t('account.grade', { grade: number(item.grade) })}
                  </span>
                  <span className="text-sm text-ink-soft">
                    {t('account.learnerCount', { count: number(item.learners) })}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    data-testid="class-roster"
                    className={secondary}
                    onClick={() => setOpen(open === item.id ? null : item.id)}
                  >
                    {t('account.learners')}
                  </button>
                  <button
                    type="button"
                    data-testid="class-lessons-open"
                    className={secondary}
                    onClick={() => setLessonsOpen(lessonsOpen === item.id ? null : item.id)}
                  >
                    {t('account.lessons')}
                  </button>
                  <button
                    type="button"
                    data-testid="class-new-code"
                    className={secondary}
                    onClick={async () => {
                      const answer = await call<{ joinCode: string }>(
                        `/v1/classes/${item.id}/join-code`,
                        {},
                      );
                      if (answer.ok)
                        setShownCode({ classId: item.id, code: answer.value.joinCode });
                      await load();
                    }}
                  >
                    {t('account.newCode')}
                  </button>
                  {archiving === item.id ? (
                    <button
                      type="button"
                      className="min-h-11 rounded-lg bg-danger px-3 font-semibold text-paper"
                      onClick={async () => {
                        await call(`/v1/classes/${item.id}/archive`, {});
                        setArchiving(null);
                        await load();
                      }}
                    >
                      {t('account.confirmArchive')}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={secondary}
                      onClick={() => setArchiving(item.id)}
                    >
                      {t('account.archive')}
                    </button>
                  )}
                </div>
                {item.joinCodeExpiresAt && (
                  <p className="mt-1 text-xs text-ink-soft">
                    {t('account.codeUntil', {
                      date: new Date(item.joinCodeExpiresAt).toLocaleDateString(),
                    })}
                  </p>
                )}
                {lessonsOpen === item.id && (
                  <div className="mt-3">
                    <ClassLessons classId={item.id} />
                  </div>
                )}
                {open === item.id && (
                  <div className="mt-3">
                    <Roster classId={item.id} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {school && (
        <form
          className="space-y-3 rounded-xl border-2 border-line p-4"
          data-testid="new-class"
          onSubmit={async (event) => {
            event.preventDefault();
            const made = await submit<{ id: string; joinCode: string }>('/v1/classes', {
              schoolId: school.schoolId,
              name: form.name,
              grade: form.grade,
              schoolConsent: form.consent,
            });
            if (made) {
              setShownCode({ classId: made.id, code: made.joinCode });
              setForm({ name: '', grade: form.grade, consent: false });
              await load();
            }
          }}
        >
          <h2 className="text-lg font-semibold">{t('account.newClass')}</h2>
          <Field label={t('account.className')}>
            <input
              data-testid="class-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              maxLength={60}
              className={input}
            />
          </Field>
          <Field label={t('account.gradeLabel')}>
            <select
              data-testid="class-grade"
              value={form.grade}
              onChange={(e) => setForm({ ...form, grade: Number(e.target.value) })}
              className={input}
            >
              {[6, 7, 8, 9, 10, 11, 12].map((grade) => (
                <option key={grade} value={grade}>
                  {t('account.grade', { grade: number(grade) })}
                </option>
              ))}
            </select>
          </Field>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              data-testid="class-consent"
              checked={form.consent}
              onChange={(e) => setForm({ ...form, consent: e.target.checked })}
              className="mt-1 h-5 w-5 accent-amber"
            />
            {t('account.consent')}
          </label>
          <Problem error={error} />
          <button
            type="submit"
            data-testid="class-submit"
            disabled={busy || !form.consent}
            className={primary}
          >
            {t('account.makeClass')}
          </button>
        </form>
      )}
    </div>
  );
}

function LearnerHome() {
  const { t, number, locale } = useT();
  const me = useAccount((s) => s.me)!;
  const [assigned, setAssigned] = useState<
    { id: string; lessonId: string; dueAt: string | null; className: string }[]
  >([]);
  useEffect(() => {
    void call<{ assignments: typeof assigned }>('/v1/assignments').then((answer) => {
      if (answer.ok) setAssigned(answer.value.assignments);
    });
  }, []);
  return (
    <section className="space-y-2" data-testid="learner-home">
      <h2 className="text-lg font-semibold">{t('account.yourClasses')}</h2>
      <ul className="space-y-2">
        {me.classes.map((item) => (
          <li key={item.classId} className="rounded-xl border-2 border-line p-3">
            <span className="font-semibold">{item.className}</span> ·{' '}
            {t('account.grade', { grade: number(item.grade) })}
            <p className="text-sm text-ink-soft">{t('account.youAre', { name: item.pseudonym })}</p>
          </li>
        ))}
      </ul>
      <h2 className="pt-4 text-lg font-semibold">{t('account.setForYou')}</h2>
      {assigned.length === 0 ? (
        <p className="text-sm text-ink-soft">{t('account.noLessons')}</p>
      ) : (
        <ul className="space-y-2" data-testid="assigned-lessons">
          {assigned.map((item) => {
            const lesson = LESSONS.find((l) => l.id === item.lessonId);
            return (
              <li
                key={item.id}
                className="flex flex-wrap items-center gap-2 rounded-xl border-2 border-line p-3"
              >
                <span className="flex-1 font-semibold">
                  {lesson?.title[locale] ?? item.lessonId}
                </span>
                {item.dueAt && (
                  <span className="text-sm text-ink-soft">
                    {t('account.dueBy', { date: new Date(item.dueAt).toLocaleDateString() })}
                  </span>
                )}
                <Link to={`/lessons#${item.lessonId}`} className="font-medium text-mat underline">
                  {t('account.openLesson')}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/**
 * Accounts: a teacher signs in and manages classes; a learner joins a class
 * with its code and a nickname. The lab works without signing in.
 */
export function AccountPage() {
  const { t } = useT();
  const { me, refresh, signOut } = useAccount();
  useEffect(() => void refresh(), [refresh]);
  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6" data-testid="account-page">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="flex-1 text-2xl font-semibold">{t('account.title')}</h1>
        {me && (
          <>
            <span className="text-sm text-ink-soft" data-testid="signed-in-as">
              {t('account.signedInAs', { name: me.user.displayName })}
            </span>
            <button
              type="button"
              data-testid="sign-out"
              onClick={() => void signOut()}
              className={secondary}
            >
              {t('account.signOut')}
            </button>
          </>
        )}
      </div>
      {me === undefined ? (
        <p className="text-ink-soft">{t('account.loading')}</p>
      ) : me === null ? (
        <>
          <p className="text-ink-soft">{t('account.about')}</p>
          <div className="grid gap-6 md:grid-cols-2">
            <section className="rounded-xl border-2 border-line bg-surface p-4">
              <LearnerJoin />
            </section>
            <section className="rounded-xl border-2 border-line bg-surface p-4">
              <TeacherSignIn />
            </section>
          </div>
        </>
      ) : me.user.kind === 'adult' ? (
        <TeacherDashboard />
      ) : (
        <LearnerHome />
      )}
    </main>
  );
}
