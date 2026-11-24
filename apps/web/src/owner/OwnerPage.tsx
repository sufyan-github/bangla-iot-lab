import type { MessageKey } from '@banglalab/i18n';
import { useCallback, useEffect, useState } from 'react';
import { call, useAccount } from '../account/client';
import { useT } from '../i18n';

/**
 * The lab office (D-097): the owner's view of every school and every person,
 * and the few things only the owner may do. Lists come a page at a time; each
 * change asks first, saying exactly what will happen, and is logged by the API.
 */
type Tab = 'schools' | 'people' | 'activity';

interface Overview {
  schools: { pending: number; active: number; suspended: number; closed: number };
  people: {
    staff: number;
    adults: number;
    ownLearners: number;
    classLearners: number;
    suspended: number;
    newThisWeek: number;
  };
}
interface School {
  id: string;
  name: string;
  district: string | null;
  status: 'pending' | 'active' | 'suspended';
  closedAt: string | null;
  createdAt: string;
  teachers: number;
  admins: { name: string; email: string | null }[];
  classes: number;
  learners: number;
}
interface Person {
  id: string;
  kind: 'adult' | 'learner';
  account: 'staff' | 'individual' | 'class';
  displayName: string;
  email: string | null;
  emailVerified: boolean;
  username: string | null;
  platformRole: string | null;
  createdAt: string;
  suspendedAt: string | null;
  closedAt: string | null;
  schools: { school: string; role: string }[];
  classes: number;
  guardian: { email: string; approved: boolean } | null;
}
interface Entry {
  at: string;
  action: string;
  actor: string | null;
  targetType: string | null;
  targetId: string | null;
  school: string | null;
}

const KNOWN = ['protected-account', 'class-learner', 'account-closed'];

export function OwnerPage() {
  const { t } = useT();
  const me = useAccount((s) => s.me);
  const refresh = useAccount((s) => s.refresh);
  const [tab, setTab] = useState<Tab>('schools');
  const [overview, setOverview] = useState<Overview | null>(null);
  const loadOverview = useCallback(async () => {
    const answer = await call<Overview>('/v1/owner/overview');
    if (answer.ok) setOverview(answer.value);
  }, []);
  useEffect(() => void refresh(), [refresh]);
  useEffect(() => {
    if (me?.user.platformRole === 'platform_admin') void loadOverview();
  }, [me, loadOverview]);

  if (me === undefined) return null;
  if (me?.user.platformRole !== 'platform_admin') {
    return (
      <main className="mx-auto w-full max-w-4xl px-4 py-6">
        <p data-testid="owner-only">{t('owner.notOwner')}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6" data-testid="owner-page">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">{t('owner.title')}</h1>
        <p className="max-w-2xl text-ink-soft">{t('owner.about')}</p>
      </header>
      {overview && <Counts overview={overview} />}
      <div className="flex gap-1 border-b border-line" role="tablist">
        {(['schools', 'people', 'activity'] as const).map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            data-testid={`owner-tab-${name}`}
            aria-selected={tab === name}
            onClick={() => setTab(name)}
            className={`-mb-px min-h-11 border-b-2 px-4 font-medium ${
              tab === name ? 'border-accent text-ink' : 'border-transparent text-ink-soft'
            }`}
          >
            {t(`owner.tab.${name}`)}
          </button>
        ))}
      </div>
      {tab === 'schools' && <Schools onChanged={loadOverview} />}
      {tab === 'people' && <People onChanged={loadOverview} />}
      {tab === 'activity' && <Activity />}
    </main>
  );
}

/** The lab at a glance: one line of figures, in groups. */
function Counts({ overview }: { overview: Overview }) {
  const { t, number } = useT();
  const items: [MessageKey, number, boolean?][] = [
    ['owner.count.schools', overview.schools.active],
    ['owner.count.pending', overview.schools.pending, overview.schools.pending > 0],
    ['owner.count.staff', overview.people.staff],
    ['owner.count.adults', overview.people.adults],
    ['owner.count.ownLearners', overview.people.ownLearners],
    ['owner.count.classLearners', overview.people.classLearners],
    ['owner.count.suspended', overview.people.suspended + overview.schools.suspended],
    ['owner.count.newThisWeek', overview.people.newThisWeek],
  ];
  return (
    <dl
      data-testid="owner-counts"
      className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-card)] border border-line bg-line sm:grid-cols-4"
    >
      {items.map(([label, value, flag]) => (
        <div key={label} className="bg-surface px-3 py-2 sm:px-4 sm:py-3">
          <dt className="text-xs text-ink-soft sm:text-sm">{t(label)}</dt>
          <dd
            className={`text-xl font-bold tabular-nums sm:text-2xl ${flag ? 'text-amber-deep' : ''}`}
          >
            {number(value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** A page of rows from the API, with a search box, a filter and "show more". */
function useList<T>(path: string, key: string, params: Record<string, string>) {
  const [rows, setRows] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const query = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
  const load = useCallback(
    async (offset = 0) => {
      setLoading(true);
      const answer = await call<Record<string, unknown> & { total: number }>(
        `${path}?${query}${query ? '&' : ''}offset=${offset}`,
      );
      setLoading(false);
      if (!answer.ok) return;
      const page = answer.value[key] as T[];
      setRows((old) => (offset === 0 ? page : [...old, ...page]));
      setTotal(answer.value.total);
    },
    [path, key, query],
  );
  useEffect(() => {
    const timer = setTimeout(() => void load(0), 200);
    return () => clearTimeout(timer);
  }, [load]);
  return { rows, total, loading, reload: () => load(0), more: () => load(rows.length) };
}

function Filters({
  search,
  onSearch,
  value,
  onChange,
  options,
}: {
  search: string;
  onSearch: (value: string) => void;
  value: string;
  onChange: (value: string) => void;
  options: [string, string][];
}) {
  const { t } = useT();
  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="w-full sm:w-auto sm:min-w-56 sm:flex-1">
        <span className="mb-1 block text-sm text-ink-soft">{t('owner.search')}</span>
        <input
          type="search"
          data-testid="owner-search"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          className="field"
        />
      </label>
      {/* One row: on a phone it scrolls sideways rather than taking three lines. */}
      <div
        className="-mx-4 flex w-[calc(100%+2rem)] gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:w-auto sm:flex-wrap sm:overflow-visible sm:px-0"
        role="group"
      >
        {options.map(([key, label]) => (
          <button
            key={key || 'all'}
            type="button"
            className="chip shrink-0"
            aria-pressed={value === key}
            data-testid={`owner-filter-${key || 'all'}`}
            onClick={() => onChange(key)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** A change that asks first, in words that say what it does. */
function Confirmable({
  label,
  question,
  danger,
  onConfirm,
  testId,
}: {
  label: string;
  question: string;
  danger?: boolean;
  onConfirm: () => Promise<void>;
  testId: string;
}) {
  const { t } = useT();
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <button
        type="button"
        data-testid={testId}
        className={danger ? 'btn btn-danger min-h-9 text-sm' : 'btn btn-quiet min-h-9 text-sm'}
        onClick={() => setAsking(true)}
      >
        {label}
      </button>
    );
  }
  return (
    <div
      className="w-full space-y-2 rounded-[var(--radius-control)] border border-line bg-paper p-3"
      role="alertdialog"
    >
      <p className="text-sm">{question}</p>
      <div className="flex gap-2">
        <button
          type="button"
          data-testid={`${testId}-yes`}
          className={`btn min-h-9 px-3 text-sm ${danger ? 'bg-danger text-paper' : 'bg-mat text-chalk'}`}
          onClick={async () => {
            await onConfirm();
            setAsking(false);
          }}
        >
          {t('owner.confirm.yes')}
        </button>
        <button
          type="button"
          className="btn btn-quiet min-h-9 text-sm"
          onClick={() => setAsking(false)}
        >
          {t('owner.confirm.no')}
        </button>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: 'pending' | 'active' | 'suspended' | 'closed' }) {
  const { t } = useT();
  const tone = {
    active: 'bg-ok-soft text-ok',
    pending: 'bg-amber-soft text-amber-deep',
    suspended: 'bg-danger-soft text-danger',
    closed: 'bg-line text-ink-soft',
  }[status];
  return (
    <span
      data-testid="owner-status"
      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${tone}`}
    >
      {t(`owner.status.${status}`)}
    </span>
  );
}

function ErrorLine({ error }: { error: string | null }) {
  const { t } = useT();
  if (!error) return null;
  return (
    <p role="alert" className="text-sm font-medium text-danger">
      {t(`owner.error.${KNOWN.includes(error) ? error : 'other'}` as MessageKey)}
    </p>
  );
}

function Schools({ onChanged }: { onChanged: () => void }) {
  const { t, number } = useT();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const list = useList<School>('/v1/owner/schools', 'schools', { q, status });
  const [error, setError] = useState<string | null>(null);
  const act = async (id: string, action: string) => {
    const answer = await call(`/v1/owner/schools/${id}/${action}`, {});
    setError(answer.ok ? null : answer.error);
    list.reload();
    onChanged();
  };
  return (
    <section className="space-y-4" data-testid="owner-schools">
      <Filters
        search={q}
        onSearch={setQ}
        value={status}
        onChange={setStatus}
        options={[
          ['', t('owner.filter.all')],
          ['pending', t('owner.status.pending')],
          ['active', t('owner.status.active')],
          ['suspended', t('owner.status.suspended')],
          ['closed', t('owner.status.closed')],
        ]}
      />
      <ErrorLine error={error} />
      {!list.loading && list.rows.length === 0 && (
        <p className="text-ink-soft">{t('owner.none')}</p>
      )}
      <ul className="divide-y divide-line rounded-[var(--radius-card)] border border-line bg-surface">
        {list.rows.map((school) => {
          const shown = school.closedAt ? 'closed' : school.status;
          const ask = (key: string) =>
            t(`owner.confirm.school.${key}` as MessageKey, { name: school.name });
          return (
            <li key={school.id} data-testid="owner-school" className="space-y-2 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-lg font-semibold">{school.name}</span>
                {school.district && (
                  <span className="text-sm text-ink-soft">{school.district}</span>
                )}
                <StatusBadge status={shown} />
              </div>
              <p className="text-sm text-ink-soft">
                {t('owner.schoolSizes', {
                  teachers: number(school.teachers),
                  classes: number(school.classes),
                  learners: number(school.learners),
                })}
                {' · '}
                {t('owner.since', { date: new Date(school.createdAt).toLocaleDateString() })}
              </p>
              {school.admins.length > 0 && (
                <p className="text-sm">
                  {t('owner.admins', {
                    names: school.admins
                      .map((a) => (a.email ? `${a.name} (${a.email})` : a.name))
                      .join(', '),
                  })}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {shown === 'closed' ? (
                  <Confirmable
                    testId="school-reopen"
                    label={t('owner.act.reopen')}
                    question={ask('reopen')}
                    onConfirm={() => act(school.id, 'reopen')}
                  />
                ) : (
                  <>
                    {shown !== 'active' && (
                      <Confirmable
                        testId="school-activate"
                        label={t('owner.act.activate')}
                        question={ask('activate')}
                        onConfirm={() => act(school.id, 'activate')}
                      />
                    )}
                    {shown === 'active' && (
                      <Confirmable
                        testId="school-suspend"
                        label={t('owner.act.suspend')}
                        question={ask('suspend')}
                        danger
                        onConfirm={() => act(school.id, 'suspend')}
                      />
                    )}
                    <Confirmable
                      testId="school-close"
                      label={t('owner.act.close')}
                      question={ask('close')}
                      danger
                      onConfirm={() => act(school.id, 'close')}
                    />
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <More shown={list.rows.length} total={list.total} onMore={list.more} />
    </section>
  );
}

function People({ onChanged }: { onChanged: () => void }) {
  const { t, number } = useT();
  const me = useAccount((s) => s.me)!;
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('');
  const list = useList<Person>('/v1/owner/people', 'people', {
    q,
    kind: kind === 'suspended' || kind === 'closed' ? '' : kind,
    status: kind === 'suspended' || kind === 'closed' ? kind : '',
  });
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<{ id: string; link: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const act = async (id: string, action: string) => {
    const answer = await call<{ link?: string }>(`/v1/owner/people/${id}/${action}`, {});
    setError(answer.ok ? null : answer.error);
    if (answer.ok && answer.value.link) setLink({ id, link: answer.value.link });
    if (action !== 'reset-link') {
      list.reload();
      onChanged();
    }
  };
  return (
    <section className="space-y-4" data-testid="owner-people">
      <Filters
        search={q}
        onSearch={setQ}
        value={kind}
        onChange={setKind}
        options={[
          ['', t('owner.filter.all')],
          ['staff', t('owner.kind.staff')],
          ['individual', t('owner.kind.individual')],
          ['learner', t('owner.kind.learner')],
          ['class', t('owner.kind.class')],
          ['suspended', t('owner.status.suspended')],
          ['closed', t('owner.status.closed')],
        ]}
      />
      <ErrorLine error={error} />
      {!list.loading && list.rows.length === 0 && (
        <p className="text-ink-soft">{t('owner.none')}</p>
      )}
      <ul className="divide-y divide-line rounded-[var(--radius-card)] border border-line bg-surface">
        {list.rows.map((person) => {
          const protectedOne = person.id === me.user.id || person.platformRole === 'platform_admin';
          const ask = (key: string) =>
            t(`owner.confirm.person.${key}` as MessageKey, { name: person.displayName });
          const kindKey =
            person.account === 'staff'
              ? 'staff'
              : person.account === 'class'
                ? 'class'
                : person.kind === 'learner'
                  ? 'learner'
                  : 'individual';
          return (
            <li key={person.id} data-testid="owner-person" className="space-y-2 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-lg font-semibold">{person.displayName}</span>
                <span className="text-sm text-ink-soft">
                  {t(`owner.kind.${kindKey}` as MessageKey)}
                </span>
                {person.platformRole === 'platform_admin' && (
                  <span className="rounded-full bg-mat-soft px-2 py-0.5 text-xs font-semibold text-accent">
                    {t('owner.isOwner')}
                  </span>
                )}
                {person.closedAt ? (
                  <StatusBadge status="closed" />
                ) : person.suspendedAt ? (
                  <StatusBadge status="suspended" />
                ) : null}
              </div>
              <p className="text-sm text-ink-soft">
                {[
                  person.email,
                  person.email && !person.emailVerified ? t('owner.unverified') : null,
                  person.username ? `@${person.username}` : null,
                  person.guardian
                    ? person.guardian.approved
                      ? t('owner.guardian', { email: person.guardian.email })
                      : t('owner.guardianWaiting')
                    : null,
                  ...person.schools.map(
                    (s) => `${s.school}${s.role === 'school_admin' ? ' (admin)' : ''}`,
                  ),
                  person.classes > 0
                    ? t('owner.inClasses', { count: number(person.classes) })
                    : null,
                  t('owner.since', { date: new Date(person.createdAt).toLocaleDateString() }),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              {!person.closedAt && (
                <div className="flex flex-wrap gap-2">
                  {person.account !== 'class' && (
                    <button
                      type="button"
                      data-testid="person-reset-link"
                      className="btn btn-quiet min-h-9 text-sm"
                      onClick={() => void act(person.id, 'reset-link')}
                    >
                      {t('owner.act.resetLink')}
                    </button>
                  )}
                  {!protectedOne &&
                    (person.suspendedAt ? (
                      <Confirmable
                        testId="person-restore"
                        label={t('owner.act.restore')}
                        question={ask('restore')}
                        onConfirm={() => act(person.id, 'restore')}
                      />
                    ) : (
                      <Confirmable
                        testId="person-suspend"
                        label={t('owner.act.suspend')}
                        question={ask('suspend')}
                        danger
                        onConfirm={() => act(person.id, 'suspend')}
                      />
                    ))}
                  {!protectedOne && (
                    <Confirmable
                      testId="person-close"
                      label={t('owner.act.close')}
                      question={ask('close')}
                      danger
                      onConfirm={() => act(person.id, 'close')}
                    />
                  )}
                </div>
              )}
              {link?.id === person.id && (
                <div
                  className="space-y-2 rounded-[var(--radius-control)] border border-line bg-paper p-3"
                  data-testid="reset-link-shown"
                >
                  <p className="text-sm">{t('owner.resetLinkAbout')}</p>
                  <p className="font-mono text-sm break-all" data-testid="reset-link-value">
                    {link.link}
                  </p>
                  <button
                    type="button"
                    className="btn btn-secondary min-h-9 text-sm"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(link.link);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      } catch {
                        // The link stays on screen to copy by hand.
                      }
                    }}
                  >
                    {copied ? t('owner.copied') : t('owner.copy')}
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <More shown={list.rows.length} total={list.total} onMore={list.more} />
    </section>
  );
}

function More({ shown, total, onMore }: { shown: number; total: number; onMore: () => void }) {
  const { t, number } = useT();
  if (total === 0) return null;
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-ink-soft">
        {t('owner.showing', { shown: number(shown), total: number(total) })}
      </span>
      {shown < total && (
        <button type="button" className="btn btn-secondary min-h-9 text-sm" onClick={onMore}>
          {t('owner.more')}
        </button>
      )}
    </div>
  );
}

function Activity() {
  const { t } = useT();
  const [entries, setEntries] = useState<Entry[] | null>(null);
  useEffect(() => {
    void call<{ entries: Entry[] }>('/v1/owner/activity').then((answer) =>
      setEntries(answer.ok ? answer.value.entries : []),
    );
  }, []);
  return (
    <section className="space-y-3" data-testid="owner-activity">
      <p className="text-sm text-ink-soft">{t('owner.activityAbout')}</p>
      <ol className="divide-y divide-line rounded-[var(--radius-card)] border border-line bg-surface">
        {(entries ?? []).map((entry, i) => (
          <li key={i} className="flex flex-wrap gap-x-3 gap-y-0.5 px-4 py-2 text-sm">
            <time className="w-40 shrink-0 text-ink-soft tabular-nums">
              {new Date(entry.at).toLocaleString()}
            </time>
            <span className="font-mono">{entry.action}</span>
            {entry.actor && <span>{entry.actor}</span>}
            {entry.school && <span className="text-ink-soft">{entry.school}</span>}
          </li>
        ))}
      </ol>
    </section>
  );
}
