import { LESSONS } from '@banglalab/lessons';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useT } from '../i18n';
import { call, useAccount, type ClassSummary, type Learner } from './client';
import { LabPass } from './LabPass';
import { SignedOut } from './SignedOut';
import { Field, Problem, ShownOnce, input, primary, secondary, useSubmit } from './ui';

function Roster({
  classId,
  others,
  onChanged,
}: {
  classId: string;
  /** The teacher's other classes in the same school, where a learner may be moved. */
  others: { id: string; name: string }[];
  onChanged: () => void;
}) {
  const { t, number } = useT();
  const [learners, setLearners] = useState<Learner[] | null>(null);
  const [newKey, setNewKey] = useState<{ pseudonym: string; key: string } | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [confirmingKey, setConfirmingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Calls an action and keeps its error, if any, to show. */
  const act = async <T,>(path: string, body: unknown) => {
    const answer = await call<T>(path, body);
    setError(answer.ok ? null : answer.error);
    return answer;
  };
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
          note={t('account.newKeyNote')}
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
              {others.length > 0 && (
                <select
                  data-testid="move-to"
                  aria-label={t('account.moveTo')}
                  value=""
                  className="field min-h-9 w-auto py-1 text-sm"
                  onChange={async (event) => {
                    const to = event.target.value;
                    if (!to) return;
                    await act(`/v1/classes/${classId}/learners/${learner.enrolment}/move`, { to });
                    await load();
                    onChanged();
                  }}
                >
                  <option value="">{t('account.moveTo')}</option>
                  {others.map((other) => (
                    <option key={other.id} value={other.id}>
                      {other.name}
                    </option>
                  ))}
                </select>
              )}
              {/* A new key stops the old one at once, so it asks first. */}
              {confirmingKey === learner.enrolment ? (
                <button
                  type="button"
                  data-testid="confirm-new-learner-key"
                  className="btn min-h-9 bg-mat px-3 text-sm text-chalk"
                  onClick={async () => {
                    const answer = await act<{ key: string }>(
                      `/v1/classes/${classId}/learners/${learner.enrolment}/key`,
                      {},
                    );
                    setConfirmingKey(null);
                    if (answer.ok)
                      setNewKey({ pseudonym: learner.pseudonym, key: answer.value.key });
                  }}
                >
                  {t('account.confirmNewKeyFor', { name: learner.pseudonym })}
                </button>
              ) : (
                <button
                  type="button"
                  data-testid="new-learner-key-ask"
                  className="btn btn-quiet min-h-9 text-sm"
                  onClick={() => setConfirmingKey(learner.enrolment)}
                >
                  {t('account.newKey')}
                </button>
              )}
              {confirming === learner.enrolment ? (
                <button
                  type="button"
                  data-testid="confirm-remove"
                  className="btn min-h-9 bg-danger px-3 text-sm text-paper"
                  onClick={async () => {
                    await act(`/v1/classes/${classId}/learners/${learner.enrolment}/remove`, {});
                    setConfirming(null);
                    await load();
                  }}
                >
                  {t('account.confirmRemove', { name: learner.pseudonym })}
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-danger min-h-9 text-sm"
                  onClick={() => setConfirming(learner.enrolment)}
                >
                  {t('account.remove')}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <Problem error={error} />
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
                className="btn btn-danger min-h-9 text-sm"
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

interface SchoolTeacher {
  userId: string;
  displayName: string;
  admin: boolean;
}
interface OpenInvite {
  id: string;
  expiresAt: string;
}

/** For a school's admin: its teachers, and codes that invite more. */
function SchoolTeachers({ schoolId, schoolName }: { schoolId: string; schoolName: string }) {
  const { t } = useT();
  const refresh = useAccount((s) => s.refresh);
  // Which teacher's action is waiting for a second press, and which action.
  const [confirming, setConfirming] = useState<{ id: string; what: 'remove' | 'admin' } | null>(
    null,
  );
  const [list, setList] = useState<{ teachers: SchoolTeacher[]; invites: OpenInvite[] } | null>(
    null,
  );
  const [shown, setShown] = useState<string | null>(null);
  const [resetLink, setResetLink] = useState<{ id: string; link: string } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const me = useAccount((s) => s.me);
  const { busy, error, submit } = useSubmit();
  const act = async <T,>(path: string) => {
    const answer = await call<T>(path, {});
    setActionError(answer.ok ? null : answer.error);
    return answer;
  };
  const load = async () => {
    const answer = await call<{ teachers: SchoolTeacher[]; invites: OpenInvite[] }>(
      `/v1/schools/${schoolId}/teachers`,
    );
    if (answer.ok) setList(answer.value);
  };
  // Loads again only when the school changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => void load(), [schoolId]);

  return (
    <section data-testid="school-teachers" className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">{t('account.teachers')}</h2>
        <p className="text-sm text-ink-soft">{schoolName}</p>
      </div>
      {list && (
        <ul className="divide-y divide-line rounded-[var(--radius-card)] border border-line bg-surface">
          {list.teachers.map((teacher) => (
            <li
              key={teacher.userId}
              data-testid="school-teacher"
              className="flex flex-wrap items-center gap-2 px-4 py-2.5"
            >
              <span className="flex-1">{teacher.displayName}</span>
              {teacher.userId !== me?.user.id && (
                <button
                  type="button"
                  data-testid="teacher-reset-link"
                  className="btn btn-quiet min-h-9 text-sm"
                  onClick={async () => {
                    const answer = await act<{ link: string }>(
                      `/v1/schools/${schoolId}/teachers/${teacher.userId}/reset-link`,
                    );
                    if (answer.ok) setResetLink({ id: teacher.userId, link: answer.value.link });
                  }}
                >
                  {t('account.resetLink')}
                </button>
              )}
              {teacher.admin ? (
                <span className="rounded-full bg-mat-soft px-2 py-0.5 text-xs font-medium text-accent">
                  {t('account.admin')}
                </span>
              ) : confirming?.id === teacher.userId ? (
                <button
                  type="button"
                  data-testid={`confirm-${confirming.what === 'admin' ? 'make-admin' : 'remove-teacher'}`}
                  className={`btn min-h-9 px-3 text-sm ${
                    // Light text on the dark green; dark text on red, which is light in dark mode.
                    confirming.what === 'admin' ? 'bg-mat text-chalk' : 'bg-danger text-paper'
                  }`}
                  onClick={async () => {
                    const action = confirming.what === 'admin' ? 'make-admin' : 'remove';
                    await act(`/v1/schools/${schoolId}/teachers/${teacher.userId}/${action}`);
                    setConfirming(null);
                    // Handing on the role ends this page's admin view.
                    if (action === 'make-admin') await refresh();
                    else await load();
                  }}
                >
                  {t(
                    confirming.what === 'admin'
                      ? 'account.confirmMakeAdmin'
                      : 'account.confirmRemoveTeacher',
                    { name: teacher.displayName },
                  )}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    data-testid="make-admin"
                    className="btn btn-quiet min-h-9 text-sm"
                    onClick={() => setConfirming({ id: teacher.userId, what: 'admin' })}
                  >
                    {t('account.makeAdmin')}
                  </button>
                  <button
                    type="button"
                    data-testid="remove-teacher"
                    className="btn btn-danger min-h-9 text-sm"
                    onClick={() => setConfirming({ id: teacher.userId, what: 'remove' })}
                  >
                    {t('account.remove')}
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {resetLink && (
        <LinkToHandOn
          link={resetLink.link}
          about={t('account.resetLinkAbout', {
            name: list?.teachers.find((x) => x.userId === resetLink.id)?.displayName ?? '',
          })}
        />
      )}
      <Problem error={actionError} />
      {shown && (
        <ShownOnce
          label={t('account.inviteShown')}
          value={shown}
          testId="invite-code-shown"
          note={t('account.inviteNote')}
        />
      )}
      {list && list.invites.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-ink-soft">{t('account.openInvites')}</h3>
          <ul className="mt-1 space-y-1">
            {list.invites.map((invite) => (
              <li
                key={invite.id}
                data-testid="open-invite"
                className="flex items-center gap-2 text-sm"
              >
                <span className="flex-1">
                  {t('account.inviteUntil', {
                    date: new Date(invite.expiresAt).toLocaleDateString(),
                  })}
                </span>
                <button
                  type="button"
                  data-testid="invite-withdraw"
                  className="btn btn-quiet min-h-9 text-sm"
                  onClick={async () => {
                    await act(`/v1/schools/${schoolId}/invites/${invite.id}/withdraw`);
                    setShown(null);
                    await load();
                  }}
                >
                  {t('account.withdraw')}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <Problem error={error} />
      <button
        type="button"
        data-testid="invite-teacher"
        disabled={busy}
        className={secondary}
        onClick={async () => {
          const made = await submit<{ code: string }>(`/v1/schools/${schoolId}/invites`, {});
          if (made) {
            setShown(made.code);
            await load();
          }
        }}
      >
        {t('account.inviteTeacher')}
      </button>
    </section>
  );
}

/** A teacher already signed in joins another school with its admin's code. */
function JoinSchool() {
  const { t } = useT();
  const refresh = useAccount((s) => s.refresh);
  const [code, setCode] = useState('');
  const { busy, error, submit } = useSubmit();
  return (
    <form
      data-testid="join-school"
      className="space-y-2"
      onSubmit={async (event) => {
        event.preventDefault();
        if (await submit('/v1/invites/accept', { code })) {
          setCode('');
          await refresh();
        }
      }}
    >
      <h2 className="text-lg font-semibold">{t('account.joinSchool')}</h2>
      <p className="text-sm text-ink-soft">{t('account.joinSchoolAbout')}</p>
      <div className="flex flex-wrap gap-2">
        <input
          data-testid="join-school-code"
          aria-label={t('account.inviteCode')}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          required
          autoComplete="off"
          spellCheck={false}
          maxLength={40}
          className={`${input} max-w-72 flex-1 font-mono uppercase tracking-widest`}
        />
        <button
          type="submit"
          data-testid="join-school-submit"
          disabled={busy}
          className={secondary}
        >
          {t('account.join')}
        </button>
      </div>
      <Problem error={error} />
    </form>
  );
}

function TeacherDashboard() {
  const { t, number } = useT();
  const me = useAccount((s) => s.me)!;
  const teaching = me.schools.filter((s) => s.role === 'teacher');
  const running = me.schools.filter((s) => s.role === 'school_admin');
  const [schoolChoice, setSchoolChoice] = useState<string | null>(null);
  const school = teaching.find((s) => s.schoolId === schoolChoice) ?? teaching[0];
  const [classes, setClasses] = useState<ClassSummary[] | null>(null);
  const [form, setForm] = useState({ name: '', grade: 6, consent: false });
  const [shownCode, setShownCode] = useState<{ classId: string; code: string } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [lessonsOpen, setLessonsOpen] = useState<string | null>(null);
  const [archiving, setArchiving] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [tab, setTab] = useState<'classes' | 'school' | 'account'>('classes');
  const { busy, error, submit } = useSubmit();
  const load = async () => {
    const answer = await call<{ classes: ClassSummary[] }>('/v1/classes');
    setClasses(answer.ok ? answer.value.classes : []);
  };
  useEffect(() => void load(), []);

  const waiting = me.schools.filter(
    (s, i, all) =>
      s.schoolStatus !== 'active' && all.findIndex((o) => o.schoolId === s.schoolId) === i,
  );
  return (
    <div className="space-y-6">
      {waiting.map((s) => (
        <p
          key={s.schoolId}
          role="status"
          data-testid="school-waiting"
          data-status={s.schoolStatus}
          className="rounded-lg border-l-4 border-amber bg-amber-soft px-4 py-3"
        >
          {t(s.schoolStatus === 'pending' ? 'account.schoolPending' : 'account.schoolSuspended', {
            name: s.schoolName,
          })}
        </p>
      ))}
      <div className="flex gap-1 border-b border-line" role="tablist">
        {(['classes', 'school', 'account'] as const).map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            data-testid={`teacher-tab-${name}`}
            aria-selected={tab === name}
            onClick={() => setTab(name)}
            className={`-mb-px min-h-11 border-b-2 px-4 font-medium ${
              tab === name ? 'border-accent text-ink' : 'border-transparent text-ink-soft'
            }`}
          >
            {t(`account.tab.${name}`)}
          </button>
        ))}
      </div>
      {tab === 'account' && <MyAccount />}
      {tab === 'school' && (
        <>
          {running.map((s) => (
            <SchoolTeachers key={s.schoolId} schoolId={s.schoolId} schoolName={s.schoolName} />
          ))}
          <JoinSchool />
        </>
      )}
      {tab === 'classes' && (
        <>
          <section>
            <h2 className="text-lg font-semibold">{t('account.yourClasses')}</h2>
            {teaching.length === 1 && <p className="text-sm text-ink-soft">{school!.schoolName}</p>}
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
                <Problem error={actionError} />
                {classes.map((item) => (
                  <li
                    key={item.id}
                    className="rounded-[var(--radius-card)] border border-line bg-surface p-4"
                    data-testid="class-item"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="flex-1 font-semibold">
                        {item.name} · {t('account.grade', { grade: number(item.grade) })}
                        {teaching.length > 1 && (
                          <span className="block text-sm font-normal text-ink-soft">
                            {teaching.find((s) => s.schoolId === item.schoolId)?.schoolName}
                          </span>
                        )}
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
                          setActionError(answer.ok ? null : answer.error);
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
                          className="btn bg-danger text-paper"
                          onClick={async () => {
                            const answer = await call(`/v1/classes/${item.id}/archive`, {});
                            setActionError(answer.ok ? null : answer.error);
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
                    {item.joinCodeExpiresAt &&
                      (new Date(item.joinCodeExpiresAt).getTime() < Date.now() ? (
                        <p
                          className="mt-1 text-xs font-medium text-amber-deep"
                          data-testid="code-expired"
                        >
                          {t('account.codeExpired')}
                        </p>
                      ) : (
                        <p className="mt-1 text-xs text-ink-soft">
                          {t('account.codeUntil', {
                            date: new Date(item.joinCodeExpiresAt).toLocaleDateString(),
                          })}
                        </p>
                      ))}
                    {lessonsOpen === item.id && (
                      <div className="mt-3">
                        <ClassLessons classId={item.id} />
                      </div>
                    )}
                    {open === item.id && (
                      <div className="mt-3">
                        <Roster
                          classId={item.id}
                          others={(classes ?? []).filter(
                            (other) => other.id !== item.id && other.schoolId === item.schoolId,
                          )}
                          onChanged={() => void load()}
                        />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {school && (
            <form
              className="space-y-3 rounded-[var(--radius-card)] border border-line bg-paper p-4"
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
              {teaching.length > 1 && (
                <Field label={t('account.classSchool')}>
                  <select
                    data-testid="class-school"
                    value={school.schoolId}
                    onChange={(e) => setSchoolChoice(e.target.value)}
                    className={input}
                  >
                    {teaching.map((s) => (
                      <option key={s.schoolId} value={s.schoolId}>
                        {s.schoolName}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
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
        </>
      )}
    </div>
  );
}

/** A link for someone to hand on by hand, with a way to copy it. */
function LinkToHandOn({ link, about }: { link: string; about: string }) {
  const { t } = useT();
  const [copied, setCopied] = useState(false);
  return (
    <div
      className="space-y-2 rounded-[var(--radius-control)] border border-line bg-paper p-3"
      data-testid="reset-link-shown"
    >
      <p className="text-sm">{about}</p>
      <p className="font-mono text-sm break-all" data-testid="reset-link-value">
        {link}
      </p>
      <button
        type="button"
        className="btn btn-secondary min-h-9 text-sm"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(link);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            // The link stays on screen to copy by hand.
          }
        }}
      >
        {copied ? t('account.copied') : t('account.copy')}
      </button>
    </div>
  );
}

/** One's own password, and signing out on every device. */
function MyAccount() {
  const { t } = useT();
  const signOut = useAccount((s) => s.signOut);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [changed, setChanged] = useState(false);
  const change = useSubmit();
  const everywhere = useSubmit();
  return (
    <section className="space-y-6" data-testid="my-account">
      <form
        className="space-y-3"
        onSubmit={async (event) => {
          event.preventDefault();
          setChanged(false);
          if (await change.submit('/v1/me/password', { current, next })) {
            setChanged(true);
            setCurrent('');
            setNext('');
          }
        }}
      >
        <h2 className="text-lg font-semibold">{t('account.changePassword')}</h2>
        <Field label={t('account.currentPassword')}>
          <input
            data-testid="current-password"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            required
            className={input}
          />
        </Field>
        <Field label={t('account.newPassword')}>
          <input
            data-testid="next-password"
            type="password"
            autoComplete="new-password"
            minLength={10}
            value={next}
            onChange={(e) => setNext(e.target.value)}
            required
            className={input}
          />
        </Field>
        <p className="text-sm text-ink-soft">{t('account.passwordRule')}</p>
        <Problem error={change.error} />
        {changed && (
          <p role="status" data-testid="password-changed" className="font-medium text-accent">
            {t('account.passwordChanged')}
          </p>
        )}
        <button
          type="submit"
          data-testid="change-password"
          disabled={change.busy}
          className={primary}
        >
          {t('account.changePassword')}
        </button>
      </form>
      <div className="space-y-2 border-t border-line pt-5">
        <h2 className="text-lg font-semibold">{t('account.signOutEverywhere')}</h2>
        <p className="text-sm text-ink-soft">{t('account.signOutEverywhereAbout')}</p>
        <Problem error={everywhere.error} />
        <button
          type="button"
          data-testid="sign-out-everywhere"
          disabled={everywhere.busy}
          className={secondary}
          onClick={async () => {
            if (await everywhere.submit('/v1/auth/sign-out-everywhere', {})) await signOut();
          }}
        >
          {t('account.signOutEverywhere')}
        </button>
      </div>
      <CloseAccount withPassword />
    </section>
  );
}

/**
 * Closing one's own account, for good. A password, if the account has one,
 * confirms it; a second press says what will happen.
 */
function CloseAccount({ withPassword }: { withPassword: boolean }) {
  const { t } = useT();
  const me = useAccount((s) => s.me)!;
  const refresh = useAccount((s) => s.refresh);
  const [asking, setAsking] = useState(false);
  const [password, setPassword] = useState('');
  const close = useSubmit();
  const teaching = me.schools.some((s) => s.role === 'teacher');
  return (
    <div className="space-y-3 border-t border-line pt-5" data-testid="close-account">
      <h2 className="text-lg font-semibold">{t('account.close.title')}</h2>
      <p className="text-sm text-ink-soft">{t('account.close.about')}</p>
      {teaching && <p className="text-sm text-ink-soft">{t('account.close.teacherNote')}</p>}
      {!asking ? (
        <button
          type="button"
          data-testid="close-account-ask"
          className="btn btn-danger"
          onClick={() => setAsking(true)}
        >
          {t('account.close.ask')}
        </button>
      ) : (
        <form
          className="space-y-3"
          onSubmit={async (event) => {
            event.preventDefault();
            if (await close.submit('/v1/me/close', withPassword ? { password } : {})) {
              await refresh();
            }
          }}
        >
          {withPassword && (
            <Field label={t('account.currentPassword')}>
              <input
                data-testid="close-account-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className={input}
              />
            </Field>
          )}
          <Problem error={close.error} />
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              data-testid="close-account-confirm"
              disabled={close.busy}
              className="btn bg-danger px-4 text-paper"
            >
              {t('account.close.confirm')}
            </button>
            <button type="button" className="btn btn-quiet" onClick={() => setAsking(false)}>
              {t('owner.confirm.no')}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

interface LessonProgressRow {
  lessonId: string;
  steps: number;
  done: boolean;
}

/** A learner's own page: their progress, their classes and what is set there, and their key. */
function LearnerHome() {
  const { t, number, locale } = useT();
  const me = useAccount((s) => s.me)!;
  const refresh = useAccount((s) => s.refresh);
  const [assigned, setAssigned] = useState<
    { id: string; lessonId: string; dueAt: string | null; className: string }[]
  >([]);
  const [progress, setProgress] = useState<LessonProgressRow[] | null>(null);
  const [code, setCode] = useState('');
  const [nickname, setNickname] = useState(me.user.displayName);
  const [joinedClass, setJoinedClass] = useState<string | null>(null);
  const [confirmKey, setConfirmKey] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const join = useSubmit();
  useEffect(() => {
    void call<{ assignments: typeof assigned }>('/v1/assignments').then((answer) => {
      if (answer.ok) setAssigned(answer.value.assignments);
    });
    void call<{ lessons: LessonProgressRow[] }>('/v1/me/progress').then((answer) => {
      setProgress(answer.ok ? answer.value.lessons : []);
    });
  }, [me.classes.length]);
  const title = (lessonId: string) =>
    LESSONS.find((l) => l.id === lessonId)?.title[locale] ?? lessonId;

  return (
    <div className="space-y-8" data-testid="learner-home">
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">
          {t('account.welcome', { name: me.user.displayName })}
        </h2>
        <div className="flex flex-wrap gap-2">
          <Link to="/lessons" className={primary}>
            {t('account.goLessons')}
          </Link>
          <Link to="/" className={secondary}>
            {t('account.goProjects')}
          </Link>
        </div>
      </section>

      <section className="space-y-2" data-testid="my-progress">
        <h2 className="text-lg font-semibold">{t('account.myProgress')}</h2>
        {progress === null ? (
          <p className="text-sm text-ink-soft">{t('account.loading')}</p>
        ) : progress.length === 0 ? (
          <p className="text-sm text-ink-soft">{t('account.noProgress')}</p>
        ) : (
          <ul className="space-y-2">
            {progress.map((row) => {
              const total = LESSONS.find((l) => l.id === row.lessonId)?.steps.length ?? 0;
              const shown = row.done ? total : Math.min(row.steps, total);
              return (
                <li
                  key={row.lessonId}
                  data-testid="progress-lesson"
                  data-lesson={row.lessonId}
                  data-done={row.done}
                  className="rounded-[var(--radius-card)] border border-line bg-surface p-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="flex-1 font-semibold">{title(row.lessonId)}</span>
                    {row.done ? (
                      <span className="rounded-full bg-mat-soft px-2 py-0.5 text-xs font-medium text-accent">
                        {t('account.lessonDone')}
                      </span>
                    ) : (
                      <span className="text-sm text-ink-soft">
                        {t('account.stepsDone', { done: number(shown), total: number(total) })}
                      </span>
                    )}
                    <Link
                      to={`/lessons#${row.lessonId}`}
                      className="font-medium text-accent underline"
                    >
                      {t('account.openLesson')}
                    </Link>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line" aria-hidden>
                    <div
                      className="h-full rounded-full bg-mat"
                      style={{ width: `${total ? (shown / total) * 100 : 0}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {me.classes.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">{t('account.yourClasses')}</h2>
          <ul className="space-y-2">
            {me.classes.map((item) => (
              <li
                key={item.classId}
                className="rounded-[var(--radius-card)] border border-line bg-surface p-4"
              >
                <span className="font-semibold">{item.className}</span> ·{' '}
                {t('account.grade', { grade: number(item.grade) })}
                <p className="text-sm text-ink-soft">
                  {t('account.youAre', { name: item.pseudonym })}
                </p>
              </li>
            ))}
          </ul>
          <h2 className="pt-4 text-lg font-semibold">{t('account.setForYou')}</h2>
          {assigned.length === 0 ? (
            <p className="text-sm text-ink-soft">{t('account.noLessons')}</p>
          ) : (
            <ul className="space-y-2" data-testid="assigned-lessons">
              {assigned.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center gap-2 rounded-[var(--radius-card)] border border-line bg-surface p-4"
                >
                  <span className="flex-1 font-semibold">{title(item.lessonId)}</span>
                  {item.dueAt && (
                    <span className="text-sm text-ink-soft">
                      {t('account.dueBy', { date: new Date(item.dueAt).toLocaleDateString() })}
                    </span>
                  )}
                  <Link
                    to={`/lessons#${item.lessonId}`}
                    className="font-medium text-accent underline"
                  >
                    {t('account.openLesson')}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {me.user.username && (
        <section className="space-y-1" data-testid="own-sign-in">
          <p className="font-medium">{t('account.signInName', { name: me.user.username })}</p>
          <p className="text-sm text-ink-soft">{t('account.ownForgot')}</p>
        </section>
      )}

      {/* Adults on their own have no classes to join: classes are for learners. */}
      {me.user.kind === 'learner' && (
        <form
          data-testid="learner-join-class"
          className="space-y-3 rounded-[var(--radius-card)] border border-line bg-paper p-4"
          onSubmit={async (event) => {
            event.preventDefault();
            const done = await join.submit<{ className: string }>('/v1/join', {
              code,
              pseudonym: nickname,
            });
            if (done) {
              setJoinedClass(done.className);
              setCode('');
              await refresh();
            }
          }}
        >
          <h2 className="text-lg font-semibold">{t('account.joinAClass')}</h2>
          <p className="text-sm text-ink-soft">{t('account.joinAClassAbout')}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('account.classCode')}>
              <input
                data-testid="learner-class-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                autoCapitalize="characters"
                className={`${input} font-mono tracking-widest`}
              />
            </Field>
            <Field label={t('account.pseudonym')}>
              <input
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                required
                minLength={2}
                maxLength={24}
                className={input}
              />
            </Field>
          </div>
          <Problem error={join.error} />
          {joinedClass && (
            <p role="status" className="text-sm font-medium text-accent">
              {t('account.joinedClass', { name: joinedClass })}
            </p>
          )}
          <button
            type="submit"
            data-testid="learner-class-submit"
            disabled={join.busy}
            className={secondary}
          >
            {t('account.join')}
          </button>
        </form>
      )}

      {me.user.account === 'individual' && me.user.kind === 'adult' && <MyAccount />}
      {me.user.username && <MyAccount />}

      {me.user.account === 'class' && <CloseAccount withPassword={false} />}

      {/* A key is how a class learner signs in; others have a password. */}
      {me.user.account === 'class' && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">{t('account.yourKeyTitle')}</h2>
          <p className="text-sm text-ink-soft">{t('account.newOwnKeyAbout')}</p>
          {newKey && (
            <div data-testid="own-new-key">
              <LabPass
                nickname={me.user.displayName}
                className={me.classes[0]?.className}
                passKey={newKey}
              />
            </div>
          )}
          {confirmKey ? (
            <button
              type="button"
              data-testid="confirm-new-key"
              className="btn min-h-9 bg-danger px-3 text-sm text-paper"
              onClick={async () => {
                const answer = await call<{ key: string }>('/v1/me/key', {});
                setConfirmKey(false);
                if (answer.ok) setNewKey(answer.value.key);
              }}
            >
              {t('account.confirmNewKey')}
            </button>
          ) : (
            <button
              type="button"
              data-testid="new-own-key"
              className={secondary}
              onClick={() => setConfirmKey(true)}
            >
              {t('account.makeNewKey')}
            </button>
          )}
        </section>
      )}
    </div>
  );
}

/**
 * Accounts: a teacher signs in and manages classes; a learner joins a class
 * with its code and a nickname; anyone may open an account of their own
 * (D-096). The lab works without signing in.
 */
export function AccountPage() {
  const { t } = useT();
  const { me, refresh, signOut } = useAccount();
  useEffect(() => void refresh(), [refresh]);
  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6" data-testid="account-page">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="flex-1 text-3xl font-bold">{t('account.title')}</h1>
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
        <SignedOut />
      ) : me.user.account === 'staff' ? (
        <TeacherDashboard />
      ) : (
        <LearnerHome />
      )}
    </main>
  );
}
