import type { MessageKey } from '@banglalab/i18n';
import {
  Badge,
  Banner,
  Button,
  ClipboardText,
  Dialog,
  Empty,
  Input,
  LayerCard,
  Loader,
  Pagination,
  Table,
  Tabs,
} from '@cloudflare/kumo';
import {
  ArrowCounterClockwise,
  Buildings,
  ClockCounterClockwise,
  Key,
  MagnifyingGlass,
  Pause,
  Play,
  Prohibit,
  SealCheck,
  Users,
  X,
} from '@phosphor-icons/react';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { call, useAccount } from '../account/client';
import { useT } from '../i18n';
import { useTheme } from '../theme';
import './owner.css';

/**
 * The lab office (D-097, restyled with Cloudflare's Kumo in D-099): the owner's
 * view of every school and every person, and the few things only the owner may
 * do. Lists come a page at a time; each change asks first in a dialog that says
 * exactly what will happen, and is logged by the API. This page and its styles
 * load only when an owner opens it.
 */
type Tab = 'schools' | 'people' | 'activity';
const PAGE = 50;

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
  school: string | null;
}

const KNOWN = ['protected-account', 'class-learner', 'account-closed'];

/** Kumo's dark mode follows the lab's: the device's setting, or the student's choice. */
function useKumoMode() {
  const choice = useTheme((s) => s.choice);
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false,
  );
  useEffect(() => {
    const query = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!query) return;
    const listen = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    query.addEventListener('change', listen);
    return () => query.removeEventListener('change', listen);
  }, []);
  const dark = choice === 'dark' || (choice === 'system' && systemDark);
  useEffect(() => {
    // On the root, so Kumo's dialogs (drawn outside this page) follow it too.
    document.documentElement.dataset.mode = dark ? 'dark' : 'light';
    return () => {
      delete document.documentElement.dataset.mode;
    };
  }, [dark]);
}

export default function OwnerPage() {
  const { t } = useT();
  const me = useAccount((s) => s.me);
  const refresh = useAccount((s) => s.refresh);
  const [tab, setTab] = useState<Tab>('schools');
  const [overview, setOverview] = useState<Overview | null>(null);
  useKumoMode();
  const loadOverview = useCallback(async () => {
    const answer = await call<Overview>('/v1/owner/overview');
    if (answer.ok) setOverview(answer.value);
  }, []);
  useEffect(() => void refresh(), [refresh]);
  useEffect(() => {
    if (me?.user.platformRole === 'platform_admin') void loadOverview();
  }, [me, loadOverview]);

  if (me === undefined) {
    return (
      <main className="grid place-items-center py-16">
        <Loader />
      </main>
    );
  }
  if (me?.user.platformRole !== 'platform_admin') {
    return (
      <main className="mx-auto w-full max-w-4xl px-4 py-6">
        <Banner variant="alert" description={t('owner.notOwner')} data-testid="owner-only" />
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6" data-testid="owner-page">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold">{t('owner.title')}</h1>
        <p className="max-w-2xl text-kumo-subtle">{t('owner.about')}</p>
      </header>
      {overview && <Counts overview={overview} />}
      <Tabs
        variant="underline"
        labels={{ scrollStart: t('owner.tabsBack'), scrollEnd: t('owner.tabsForward') }}
        value={tab}
        onValueChange={(value) => setTab(value as Tab)}
        tabs={[
          { value: 'schools', label: t('owner.tab.schools') },
          { value: 'people', label: t('owner.tab.people') },
          { value: 'activity', label: t('owner.tab.activity') },
        ]}
      />
      {tab === 'schools' && <Schools onChanged={loadOverview} />}
      {tab === 'people' && <People onChanged={loadOverview} />}
      {tab === 'activity' && <Activity />}
    </main>
  );
}

/** The lab at a glance: schools and people, each a card of figures. */
function Counts({ overview }: { overview: Overview }) {
  const { t, number } = useT();
  const figure = (label: MessageKey, value: number, testId?: string, attention?: boolean) => (
    <div key={label} data-testid={testId}>
      <dt className="text-sm text-kumo-subtle">{t(label)}</dt>
      <dd className={`text-2xl font-bold tabular-nums ${attention ? 'text-kumo-warning' : ''}`}>
        {number(value)}
      </dd>
    </div>
  );
  return (
    <div className="grid items-start gap-4 md:grid-cols-[1fr_2fr]" data-testid="owner-counts">
      <LayerCard>
        <LayerCard.Secondary className="flex items-center gap-2">
          <Buildings size={18} aria-hidden /> {t('owner.tab.schools')}
        </LayerCard.Secondary>
        <LayerCard.Primary>
          <dl className="grid grid-cols-3 gap-3">
            {figure('owner.count.schools', overview.schools.active)}
            {figure(
              'owner.count.pending',
              overview.schools.pending,
              'count-pending',
              overview.schools.pending > 0,
            )}
            {figure('owner.count.suspended', overview.schools.suspended)}
          </dl>
        </LayerCard.Primary>
      </LayerCard>
      <LayerCard>
        <LayerCard.Secondary className="flex items-center gap-2">
          <Users size={18} aria-hidden /> {t('owner.tab.people')}
        </LayerCard.Secondary>
        <LayerCard.Primary>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {figure('owner.count.staff', overview.people.staff)}
            {figure('owner.count.adults', overview.people.adults)}
            {figure('owner.count.ownLearners', overview.people.ownLearners)}
            {figure('owner.count.classLearners', overview.people.classLearners)}
            {figure('owner.count.suspended', overview.people.suspended)}
            {figure('owner.count.newThisWeek', overview.people.newThisWeek)}
          </dl>
        </LayerCard.Primary>
      </LayerCard>
    </div>
  );
}

/** A page of rows from the API, with a search box and a filter. */
function useList<T>(path: string, key: string, params: Record<string, string>) {
  const [rows, setRows] = useState<T[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const query = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
  // A new search or filter starts from the first page.
  useEffect(() => setPage(1), [query]);
  const load = useCallback(async () => {
    const answer = await call<Record<string, unknown> & { total: number }>(
      `${path}?${query}${query ? '&' : ''}offset=${(page - 1) * PAGE}`,
    );
    if (!answer.ok) return;
    setRows(answer.value[key] as T[]);
    setTotal(answer.value.total);
  }, [path, key, query, page]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 200);
    return () => clearTimeout(timer);
  }, [load]);
  return { rows, total, page, setPage, reload: load };
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
    <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
      <div className="lg:w-80">
        <Input
          label={t('owner.search')}
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          data-testid="owner-search"
          type="search"
        />
      </div>
      {/* One row: on a phone it scrolls sideways rather than taking several lines. */}
      <div className="-mx-4 overflow-x-auto px-4 pb-1 lg:mx-0 lg:px-0">
        <Tabs
          variant="segmented"
          labels={{ scrollStart: t('owner.tabsBack'), scrollEnd: t('owner.tabsForward') }}
          value={value || 'all'}
          onValueChange={(next) => onChange(next === 'all' ? '' : next)}
          tabs={options.map(([key, label]) => ({ value: key || 'all', label }))}
        />
      </div>
    </div>
  );
}

/**
 * A change that asks first, in a dialog that says what it does. The button that
 * opens it carries `testId`; the dialog's own button, `confirm-yes`.
 */
function Confirm({
  label,
  question,
  danger,
  icon,
  onConfirm,
  testId,
}: {
  label: string;
  question: string;
  danger?: boolean;
  icon?: ReactNode;
  onConfirm: () => Promise<void>;
  testId: string;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger
        render={(props) => (
          <Button
            {...props}
            size="sm"
            variant={danger ? 'secondary-destructive' : 'secondary'}
            icon={icon}
            data-testid={testId}
          >
            {label}
          </Button>
        )}
      />
      <Dialog size="sm" className="p-6">
        <div className="mb-3 flex items-start justify-between gap-4">
          <Dialog.Title className="text-xl font-semibold">{label}</Dialog.Title>
          <Dialog.Close
            aria-label={t('owner.confirm.no')}
            render={(props) => (
              <Button
                {...props}
                variant="ghost"
                shape="square"
                size="sm"
                icon={<X />}
                aria-label={t('owner.confirm.no')}
              />
            )}
          />
        </div>
        <Dialog.Description className="text-kumo-subtle">{question}</Dialog.Description>
        <div className="mt-6 flex justify-end gap-2">
          <Dialog.Close
            render={(props) => (
              <Button {...props} variant="secondary">
                {t('owner.confirm.no')}
              </Button>
            )}
          />
          <Button
            variant={danger ? 'destructive' : 'primary'}
            loading={busy}
            data-testid="confirm-yes"
            onClick={async () => {
              setBusy(true);
              await onConfirm();
              setBusy(false);
              setOpen(false);
            }}
          >
            {t('owner.confirm.yes')}
          </Button>
        </div>
      </Dialog>
    </Dialog.Root>
  );
}

function StatusBadge({ status }: { status: 'pending' | 'active' | 'suspended' | 'closed' }) {
  const { t } = useT();
  const variant = {
    active: 'success',
    pending: 'warning',
    suspended: 'error',
    closed: 'neutral',
  } as const;
  return (
    // Kumo's Badge does not pass test ids on, so its wrapper carries it.
    <span data-testid="owner-status">
      <Badge appearance="dot" variant={variant[status]}>
        {t(`owner.status.${status}`)}
      </Badge>
    </span>
  );
}

function ErrorBanner({ error }: { error: string | null }) {
  const { t } = useT();
  if (!error) return null;
  return (
    <Banner
      variant="error"
      description={t(`owner.error.${KNOWN.includes(error) ? error : 'other'}` as MessageKey)}
    />
  );
}

function Pages({
  page,
  setPage,
  total,
}: {
  page: number;
  setPage: (page: number) => void;
  total: number;
}) {
  const { t, number } = useT();
  if (total <= PAGE) return null;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-sm text-kumo-subtle">
        {t('owner.showing', {
          shown: number(Math.min(page * PAGE, total)),
          total: number(total),
        })}
      </span>
      <Pagination
        page={page}
        setPage={setPage}
        perPage={PAGE}
        totalCount={total}
        labels={{
          navigation: t('owner.page.nav'),
          firstPage: t('owner.page.first'),
          previousPage: t('owner.page.previous'),
          nextPage: t('owner.page.next'),
          lastPage: t('owner.page.last'),
          pageNumber: t('owner.page.number'),
        }}
      >
        <Pagination.Controls />
      </Pagination>
    </div>
  );
}

/** Rows in a table that scrolls sideways on a phone rather than squeezing. */
function Scroll({ children }: { children: ReactNode }) {
  return <div className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:px-0">{children}</div>;
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
    await list.reload();
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
      <ErrorBanner error={error} />
      {list.rows === null ? (
        <Loader />
      ) : list.rows.length === 0 ? (
        <Empty icon={<MagnifyingGlass size={32} />} title={t('owner.none')} size="sm" />
      ) : (
        <Scroll>
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.Head>{t('owner.col.school')}</Table.Head>
                <Table.Head>{t('owner.col.status')}</Table.Head>
                <Table.Head>{t('owner.col.size')}</Table.Head>
                <Table.Head>{t('owner.col.admin')}</Table.Head>
                <Table.Head>{t('owner.col.since')}</Table.Head>
                <Table.Head>
                  <span className="sr-only">{t('owner.col.actions')}</span>
                </Table.Head>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {list.rows.map((school) => {
                const shown = school.closedAt ? 'closed' : school.status;
                const ask = (key: string) =>
                  t(`owner.confirm.school.${key}` as MessageKey, { name: school.name });
                return (
                  <Table.Row key={school.id} data-testid="owner-school">
                    <Table.Cell>
                      <span className="font-semibold">{school.name}</span>
                      {school.district && (
                        <span className="block text-sm text-kumo-subtle">{school.district}</span>
                      )}
                    </Table.Cell>
                    <Table.Cell>
                      <StatusBadge status={shown} />
                    </Table.Cell>
                    <Table.Cell className="whitespace-nowrap text-sm tabular-nums">
                      {t('owner.schoolSizes', {
                        teachers: number(school.teachers),
                        classes: number(school.classes),
                        learners: number(school.learners),
                      })}
                    </Table.Cell>
                    <Table.Cell className="text-sm">
                      {school.admins.map((a) => (
                        <span key={`${a.name}${a.email}`} className="block">
                          {a.name}
                          {a.email && <span className="block text-kumo-subtle">{a.email}</span>}
                        </span>
                      ))}
                    </Table.Cell>
                    <Table.Cell className="whitespace-nowrap text-sm text-kumo-subtle">
                      {new Date(school.createdAt).toLocaleDateString()}
                    </Table.Cell>
                    <Table.Cell>
                      <div className="flex flex-wrap justify-end gap-2">
                        {shown === 'closed' ? (
                          <Confirm
                            testId="school-reopen"
                            label={t('owner.act.reopen')}
                            question={ask('reopen')}
                            icon={<ArrowCounterClockwise />}
                            onConfirm={() => act(school.id, 'reopen')}
                          />
                        ) : (
                          <>
                            {shown !== 'active' && (
                              <Confirm
                                testId="school-activate"
                                label={t(
                                  shown === 'pending' ? 'owner.act.approve' : 'owner.act.activate',
                                )}
                                question={ask(shown === 'pending' ? 'approve' : 'activate')}
                                icon={shown === 'pending' ? <SealCheck /> : <Play />}
                                onConfirm={() => act(school.id, 'activate')}
                              />
                            )}
                            {shown === 'active' && (
                              <Confirm
                                testId="school-suspend"
                                label={t('owner.act.suspend')}
                                question={ask('suspend')}
                                icon={<Pause />}
                                danger
                                onConfirm={() => act(school.id, 'suspend')}
                              />
                            )}
                            <Confirm
                              testId="school-close"
                              label={t('owner.act.close')}
                              question={ask('close')}
                              icon={<Prohibit />}
                              danger
                              onConfirm={() => act(school.id, 'close')}
                            />
                          </>
                        )}
                      </div>
                    </Table.Cell>
                  </Table.Row>
                );
              })}
            </Table.Body>
          </Table>
        </Scroll>
      )}
      <Pages page={list.page} setPage={list.setPage} total={list.total} />
    </section>
  );
}

function People({ onChanged }: { onChanged: () => void }) {
  const { t, number } = useT();
  const me = useAccount((s) => s.me)!;
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('');
  const byStatus = kind === 'suspended' || kind === 'closed';
  const list = useList<Person>('/v1/owner/people', 'people', {
    q,
    kind: byStatus ? '' : kind,
    status: byStatus ? kind : '',
  });
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<{ name: string; link: string } | null>(null);
  const act = async (person: Person, action: string) => {
    const answer = await call<{ link?: string }>(`/v1/owner/people/${person.id}/${action}`, {});
    setError(answer.ok ? null : answer.error);
    if (answer.ok && answer.value.link)
      setLink({ name: person.displayName, link: answer.value.link });
    if (action !== 'reset-link') {
      await list.reload();
      onChanged();
    }
  };
  const kindOf = (person: Person): MessageKey =>
    person.account === 'staff'
      ? 'owner.kind.staff'
      : person.account === 'class'
        ? 'owner.kind.class'
        : person.kind === 'learner'
          ? 'owner.kind.learner'
          : 'owner.kind.individual';
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
      <ErrorBanner error={error} />
      {link && (
        <LayerCard data-testid="reset-link-shown">
          <LayerCard.Secondary className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <Key size={18} aria-hidden /> {t('owner.act.resetLink')}: {link.name}
            </span>
            <Button
              variant="ghost"
              shape="square"
              size="sm"
              icon={<X />}
              aria-label={t('owner.confirm.no')}
              onClick={() => setLink(null)}
            />
          </LayerCard.Secondary>
          <LayerCard.Primary className="space-y-3">
            <p className="text-sm">{t('owner.resetLinkAbout')}</p>
            <div data-testid="reset-link-value" data-link={link.link}>
              <ClipboardText
                text={link.link}
                size="base"
                labels={{ copyAction: t('owner.copyAction') }}
                tooltip={{ text: t('owner.copy'), copiedText: t('owner.copied') }}
              />
            </div>
          </LayerCard.Primary>
        </LayerCard>
      )}
      {list.rows === null ? (
        <Loader />
      ) : list.rows.length === 0 ? (
        <Empty icon={<MagnifyingGlass size={32} />} title={t('owner.none')} size="sm" />
      ) : (
        <Scroll>
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.Head>{t('owner.col.person')}</Table.Head>
                <Table.Head>{t('owner.col.kind')}</Table.Head>
                <Table.Head>{t('owner.col.details')}</Table.Head>
                <Table.Head>{t('owner.col.since')}</Table.Head>
                <Table.Head>
                  <span className="sr-only">{t('owner.col.actions')}</span>
                </Table.Head>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {list.rows.map((person) => {
                const protectedOne =
                  person.id === me.user.id || person.platformRole === 'platform_admin';
                const ask = (key: string) =>
                  t(`owner.confirm.person.${key}` as MessageKey, { name: person.displayName });
                return (
                  <Table.Row key={person.id} data-testid="owner-person">
                    <Table.Cell>
                      <span className="font-semibold">{person.displayName}</span>
                      {person.email && (
                        <span className="block text-sm text-kumo-subtle">{person.email}</span>
                      )}
                      {person.username && (
                        <span className="block font-mono text-sm text-kumo-subtle">
                          @{person.username}
                        </span>
                      )}
                    </Table.Cell>
                    <Table.Cell>
                      <div className="flex flex-wrap gap-1">
                        <Badge variant="neutral">{t(kindOf(person))}</Badge>
                        {person.platformRole === 'platform_admin' && (
                          <Badge variant="teal">{t('owner.isOwner')}</Badge>
                        )}
                        {person.closedAt ? (
                          <StatusBadge status="closed" />
                        ) : person.suspendedAt ? (
                          <StatusBadge status="suspended" />
                        ) : null}
                      </div>
                    </Table.Cell>
                    <Table.Cell className="text-sm">
                      {[
                        person.email && !person.emailVerified ? t('owner.unverified') : null,
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
                      ]
                        .filter(Boolean)
                        .map((line) => (
                          <span key={line} className="block">
                            {line}
                          </span>
                        ))}
                    </Table.Cell>
                    <Table.Cell className="whitespace-nowrap text-sm text-kumo-subtle">
                      {new Date(person.createdAt).toLocaleDateString()}
                    </Table.Cell>
                    <Table.Cell>
                      {!person.closedAt && (
                        <div className="flex flex-wrap justify-end gap-2">
                          {person.account !== 'class' && (
                            <Button
                              size="sm"
                              variant="secondary"
                              icon={<Key />}
                              data-testid="person-reset-link"
                              onClick={() => void act(person, 'reset-link')}
                            >
                              {t('owner.act.resetLink')}
                            </Button>
                          )}
                          {!protectedOne &&
                            (person.suspendedAt ? (
                              <Confirm
                                testId="person-restore"
                                label={t('owner.act.restore')}
                                question={ask('restore')}
                                icon={<Play />}
                                onConfirm={() => act(person, 'restore')}
                              />
                            ) : (
                              <Confirm
                                testId="person-suspend"
                                label={t('owner.act.suspend')}
                                question={ask('suspend')}
                                icon={<Pause />}
                                danger
                                onConfirm={() => act(person, 'suspend')}
                              />
                            ))}
                          {!protectedOne && (
                            <Confirm
                              testId="person-close"
                              label={t('owner.act.close')}
                              question={ask('close')}
                              icon={<Prohibit />}
                              danger
                              onConfirm={() => act(person, 'close')}
                            />
                          )}
                        </div>
                      )}
                    </Table.Cell>
                  </Table.Row>
                );
              })}
            </Table.Body>
          </Table>
        </Scroll>
      )}
      <Pages page={list.page} setPage={list.setPage} total={list.total} />
    </section>
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
      <p className="flex items-center gap-2 text-sm text-kumo-subtle">
        <ClockCounterClockwise size={18} aria-hidden /> {t('owner.activityAbout')}
      </p>
      {entries === null ? (
        <Loader />
      ) : (
        <Scroll>
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.Head>{t('owner.col.when')}</Table.Head>
                <Table.Head>{t('owner.col.action')}</Table.Head>
                <Table.Head>{t('owner.col.who')}</Table.Head>
                <Table.Head>{t('owner.col.school')}</Table.Head>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {entries.map((entry, i) => (
                <Table.Row key={i}>
                  <Table.Cell className="whitespace-nowrap text-sm tabular-nums text-kumo-subtle">
                    {new Date(entry.at).toLocaleString()}
                  </Table.Cell>
                  <Table.Cell className="font-mono text-sm">{entry.action}</Table.Cell>
                  <Table.Cell className="text-sm">{entry.actor ?? '—'}</Table.Cell>
                  <Table.Cell className="text-sm text-kumo-subtle">{entry.school ?? ''}</Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </Scroll>
      )}
    </section>
  );
}
