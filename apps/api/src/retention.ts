import type { Database } from './db/client';

/**
 * The retention job (D-101): removes what the lab no longer needs to keep,
 * following the retention table in docs/architecture/database.md. The periods
 * are settings with the proposed values; they wait for the owner's and a
 * lawyer's confirmation.
 *
 * Each rule selects the rows it touches, and then acts on exactly those, so
 * what is reported is what is done. All rules run in one transaction, in the
 * order below: accounts are closed first, then emptied after their waiting
 * period, then the rest is tidied. Without `apply` the transaction is rolled
 * back, so the job only reports.
 *
 * An emptied account keeps its row, as consent records, classes and the audit
 * log point to it; its name, email, sign-in name, password and key are gone.
 */
export interface RetentionPolicy {
  /** Days a closed account waits before its personal data is removed. */
  closedAccountDays: number;
  /** Days before an adult's sign-up that was never confirmed is closed. */
  unconfirmedDays: number;
  /** Days before a learner's sign-up that no guardian approved is closed. */
  unapprovedDays: number;
  /** Days after its last class was archived that a class learner's account is closed. */
  archivedClassDays: number;
  /** Days a deleted project is kept, in case it was deleted by mistake. */
  deletedProjectDays: number;
  /** Versions kept of each project, newest first. */
  projectVersions: number;
  /** Days after which repeated progress events are compacted to one each. */
  progressDays: number;
  /** Days a closed account's consent records are kept, as evidence of consent. */
  consentDays: number;
  /** Days after an email link was used or ran out. */
  emailLinkDays: number;
  /** Days after a session ended. */
  sessionDays: number;
  /** Days the audit log is kept. */
  auditDays: number;
}

/** The proposed periods (docs/architecture/database.md), until confirmed. */
export const PROPOSED_POLICY: RetentionPolicy = {
  closedAccountDays: 30,
  unconfirmedDays: 30,
  unapprovedDays: 30,
  archivedClassDays: 365,
  deletedProjectDays: 30,
  projectVersions: 20,
  progressDays: 730,
  consentDays: 3 * 365,
  emailLinkDays: 30,
  sessionDays: 30,
  auditDays: 730,
};

/** Reads each period from RETENTION_* settings, falling back to the proposed one. */
export function retentionPolicy(env: NodeJS.ProcessEnv = process.env): RetentionPolicy {
  const read = (name: string, fallback: number) => {
    const value = env[name];
    if (value === undefined) return fallback;
    const number = Number(value);
    if (!Number.isInteger(number) || number < 1) {
      throw new Error(`${name} must be a whole number of at least 1, not "${value}".`);
    }
    return number;
  };
  return {
    closedAccountDays: read('RETENTION_CLOSED_ACCOUNT_DAYS', PROPOSED_POLICY.closedAccountDays),
    unconfirmedDays: read('RETENTION_UNCONFIRMED_DAYS', PROPOSED_POLICY.unconfirmedDays),
    unapprovedDays: read('RETENTION_UNAPPROVED_DAYS', PROPOSED_POLICY.unapprovedDays),
    archivedClassDays: read('RETENTION_ARCHIVED_CLASS_DAYS', PROPOSED_POLICY.archivedClassDays),
    deletedProjectDays: read('RETENTION_DELETED_PROJECT_DAYS', PROPOSED_POLICY.deletedProjectDays),
    projectVersions: read('RETENTION_PROJECT_VERSIONS', PROPOSED_POLICY.projectVersions),
    progressDays: read('RETENTION_PROGRESS_DAYS', PROPOSED_POLICY.progressDays),
    consentDays: read('RETENTION_CONSENT_DAYS', PROPOSED_POLICY.consentDays),
    emailLinkDays: read('RETENTION_EMAIL_LINK_DAYS', PROPOSED_POLICY.emailLinkDays),
    sessionDays: read('RETENTION_SESSION_DAYS', PROPOSED_POLICY.sessionDays),
    auditDays: read('RETENTION_AUDIT_DAYS', PROPOSED_POLICY.auditDays),
  };
}

interface Rule {
  name: string;
  /** What the rule does, in a line. */
  what: string;
  /** Days before now that the rule looks back; its cutoff is `$1` in `select`. */
  days: (policy: RetentionPolicy) => number;
  /** Values after the cutoff, as `$2`, `$3`… in `select`. */
  more?: (policy: RetentionPolicy) => unknown[];
  /** The rows it touches: a query returning their `id`s. */
  select: string;
  /** What is done to them; `$1` is the array of ids and `$2`, if used, the run's time. */
  apply: string[];
}

/**
 * Closing an account here does what closing it by hand does (routes/closing.ts):
 * a teacher's classes pass to the school's admin, memberships end, consent is
 * withdrawn, the sign-in key stops working and every session ends.
 */
const CLOSE = [
  `update classes c set teacher_id = m.user_id from school_memberships m
    where c.teacher_id = any($1::uuid[]) and c.archived_at is null
      and m.school_id = c.school_id and m.role = 'school_admin' and m.ended_at is null
      and m.user_id <> c.teacher_id and not (m.user_id = any($1::uuid[]))`,
  `update school_memberships set ended_at = $2::timestamptz where user_id = any($1::uuid[]) and ended_at is null`,
  `update consent_records set revoked_at = $2::timestamptz where learner_id = any($1::uuid[]) and revoked_at is null`,
  `update sessions set revoked_at = $2::timestamptz where user_id = any($1::uuid[]) and revoked_at is null`,
  `update users set deactivated_at = $2::timestamptz, sign_in_key_hash = null where id = any($1::uuid[])`,
];

/** The rules, in the order they run. */
const RULES: Rule[] = [
  {
    name: 'close-unconfirmed',
    what: 'close adult sign-ups whose email was never confirmed',
    days: (p) => p.unconfirmedDays,
    select: `select id from users where kind = 'adult' and email_verified_at is null
      and deactivated_at is null and created_at < $1`,
    apply: CLOSE,
  },
  {
    name: 'close-unapproved',
    what: 'close learners’ own sign-ups that no guardian approved',
    days: (p) => p.unapprovedDays,
    select: `select u.id from users u where u.kind = 'learner' and u.username is not null
      and u.deactivated_at is null and u.created_at < $1
      and not exists (select 1 from guardian_links g where g.learner_id = u.id
        and g.approved_at is not null)`,
    apply: CLOSE,
  },
  {
    name: 'close-class-learners',
    what: 'close class learners whose every class was archived or left long ago',
    days: (p) => p.archivedClassDays,
    // `least` passes over nulls: an enrolment ends when it was revoked or its
    // class archived, whichever came first; one that has not ended keeps the account.
    select: `select u.id from users u where u.kind = 'learner' and u.username is null
      and u.deactivated_at is null
      and exists (select 1 from class_enrollments e where e.learner_id = u.id)
      and not exists (select 1 from class_enrollments e join classes c on c.id = e.class_id
        where e.learner_id = u.id
          and coalesce(least(e.revoked_at, c.archived_at), 'infinity') >= $1)`,
    apply: CLOSE,
  },
  {
    name: 'erase-closed-accounts',
    what: 'remove the personal data of accounts closed for the waiting period',
    days: (p) => p.closedAccountDays,
    select: `select id from users where deactivated_at < $1 and erased_at is null`,
    apply: [
      `delete from projects where owner_id = any($1::uuid[])`,
      `delete from progress_events where learner_id = any($1::uuid[])`,
      `delete from guardian_links where learner_id = any($1::uuid[])`,
      `delete from email_tokens where user_id = any($1::uuid[])`,
      `delete from sessions where user_id = any($1::uuid[])`,
      `delete from class_enrollments where learner_id = any($1::uuid[])`,
      `update users set display_name = '', email = null, username = null, password_hash = null,
        sign_in_key_hash = null, email_verified_at = null, erased_at = $2::timestamptz
        where id = any($1::uuid[])`,
    ],
  },
  {
    name: 'remove-deleted-projects',
    what: 'remove projects deleted longer ago than the grace period',
    days: (p) => p.deletedProjectDays,
    select: `select id from projects where deleted_at < $1`,
    apply: [`delete from projects where id = any($1::uuid[])`],
  },
  {
    name: 'trim-project-versions',
    what: 'keep only the newest versions of each project',
    days: () => 0,
    more: (p) => [p.projectVersions],
    select: `select id from (select id, created_at, row_number() over (partition by project_id
      order by version desc) as n from project_versions) v where v.n > $2 and v.created_at < $1`,
    apply: [`delete from project_versions where id = any($1::uuid[])`],
  },
  {
    name: 'compact-old-progress',
    // The progress pages count distinct steps and learners, ask whether a lesson
    // was finished and show the latest time: keeping the latest of each repeat
    // changes none of them.
    what: 'keep only the latest of each repeated old progress event',
    days: (p) => p.progressDays,
    select: `select id from (select id, occurred_at, row_number() over (partition by learner_id,
      lesson_id, step, outcome order by occurred_at desc, id desc) as n from progress_events) e
      where e.n > 1 and e.occurred_at < $1`,
    apply: [`delete from progress_events where id = any($1::uuid[])`],
  },
  {
    name: 'remove-old-consents',
    what: 'remove the consent records of emptied accounts after the evidence period',
    days: (p) => p.consentDays,
    select: `select r.id from consent_records r join users u on u.id = r.learner_id
      where u.erased_at is not null and u.deactivated_at < $1`,
    apply: [`delete from consent_records where id = any($1::uuid[])`],
  },
  {
    name: 'remove-old-email-links',
    what: 'remove email links used or run out long ago',
    days: (p) => p.emailLinkDays,
    select: `select id from email_tokens where least(used_at, expires_at) < $1`,
    apply: [`delete from email_tokens where id = any($1::uuid[])`],
  },
  {
    name: 'remove-old-sessions',
    what: 'remove sessions that ended long ago',
    days: (p) => p.sessionDays,
    select: `select id from sessions where least(revoked_at, expires_at) < $1`,
    apply: [`delete from sessions where id = any($1::uuid[])`],
  },
  {
    name: 'remove-old-audit',
    what: 'remove audit log entries older than the audit period',
    days: (p) => p.auditDays,
    select: `select id::text from audit_logs where occurred_at < $1`,
    apply: [`delete from audit_logs where id = any($1::bigint[])`],
  },
];

export interface RetentionResult {
  applied: boolean;
  rules: { name: string; what: string; rows: number }[];
}

const DAY = 24 * 60 * 60 * 1000;

/**
 * Counts what each rule would touch and, with `apply`, does it. Everything runs
 * in one transaction: a report-only run rolls it back, so later rules count
 * what earlier ones would have left. `now` is the moment periods count back from.
 */
export async function runRetention(
  database: Database,
  options: { policy?: RetentionPolicy; apply?: boolean; now?: Date } = {},
): Promise<RetentionResult> {
  const policy = options.policy ?? PROPOSED_POLICY;
  const now = options.now ?? new Date();
  const apply = options.apply === true;
  const result: RetentionResult = { applied: apply, rules: [] };
  const client = await database.pool.connect();
  try {
    await client.query('begin');
    for (const rule of RULES) {
      const cutoff = new Date(now.getTime() - rule.days(policy) * DAY);
      const { rows } = await client.query<{ id: string }>(rule.select, [
        cutoff,
        ...(rule.more?.(policy) ?? []),
      ]);
      const ids = rows.map((row) => row.id);
      result.rules.push({ name: rule.name, what: rule.what, rows: ids.length });
      // Applied even when only counting, so that the next rule sees what this one leaves.
      if (ids.length > 0) {
        for (const statement of rule.apply) {
          await client.query(statement, statement.includes('$2') ? [ids, now] : [ids]);
        }
      }
    }
    if (apply) {
      await client.query(`insert into audit_logs (action, metadata) values ('retention.run', $1)`, [
        JSON.stringify(Object.fromEntries(result.rules.map((r) => [r.name, r.rows]))),
      ]);
    }
    await client.query(apply ? 'commit' : 'rollback');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
  return result;
}
