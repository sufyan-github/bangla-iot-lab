import { count, eq, sql, type SQL } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { loadConfig } from './config';
import type { Database } from './db/client';
import {
  auditLogs,
  classEnrollments,
  classes,
  consentRecords,
  emailTokens,
  progressEvents,
  projects,
  projectVersions,
  sessions,
  users,
} from './db/schema';
import { LocalMailbox } from './mail';
import { PROPOSED_POLICY, retentionPolicy, runRetention } from './retention';
import { cookieOf, signUpTeacher, tokenIn } from './test-accounts';
import { freshDatabase } from './test-database';

/**
 * The retention job (D-101), against PostgreSQL 18. Accounts are made through
 * the API as people would make them; then their times are moved back, so that
 * each rule has something just past its period and something just inside it.
 */
const config = loadConfig({
  LOG_LEVEL: 'silent',
  WEB_ORIGIN: 'http://localhost:4174',
  SIGN_INS_PER_MINUTE: '1000',
  SCHOOL_APPROVAL: 'automatic',
});
let database: Database;
let app: Awaited<ReturnType<typeof buildApp>>;
const mailbox = new LocalMailbox();
const PASSWORD = 'a long pass phrase';
const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(Date.now() - days * DAY);

const post = (url: string, payload: object = {}, cookie?: string) =>
  app.inject({ method: 'POST', url, payload, ...(cookie ? { headers: { cookie } } : {}) });

const ids: Record<string, string> = {};
const userId = async (where: SQL) =>
  (await database.db.select({ id: users.id }).from(users).where(where))[0]!.id;
const user = async (id: string) =>
  (await database.db.select().from(users).where(eq(users.id, id)))[0]!;
const rows = async (table: PgTable, where?: SQL) =>
  Number((await database.db.select({ n: count() }).from(table).where(where))[0]!.n);

async function adult(email: string, confirm: boolean) {
  await post('/v1/auth/register', { email, password: PASSWORD, displayName: 'বড়', adult: true });
  const id = await userId(eq(users.email, email));
  if (!confirm) return { id, cookie: '' };
  const cookie = cookieOf(await post('/v1/auth/verify-email', { token: tokenIn(mailbox, email) }));
  return { id, cookie };
}

async function ownLearner(username: string, guardian: string, approve: boolean) {
  await post('/v1/auth/register-learner', {
    username,
    pseudonym: 'মেঘ',
    password: PASSWORD,
    guardianEmail: guardian,
  });
  if (approve) await post('/v1/auth/approve-learner', { token: tokenIn(mailbox, guardian) });
  return userId(eq(users.username, username));
}

/** Everything the rules look at, counted; a report-only run must leave it all as it was. */
async function snapshot() {
  return {
    users: await database.db
      .select({
        id: users.id,
        name: users.displayName,
        deactivatedAt: users.deactivatedAt,
        erasedAt: users.erasedAt,
      })
      .from(users)
      .orderBy(users.id),
    projects: await rows(projects),
    versions: await rows(projectVersions),
    progress: await rows(progressEvents),
    consents: await rows(consentRecords),
    tokens: await rows(emailTokens),
    sessions: await rows(sessions),
    audit: await rows(auditLogs),
    enrolments: await rows(classEnrollments),
  };
}

beforeAll(async () => {
  database = await freshDatabase('banglalab_test_retention');
  app = await buildApp({ config, database, fetch: globalThis.fetch, mailer: mailbox });

  // Adults on their own: one never confirmed for 31 days, one just signed up,
  // one who confirmed and uses the lab, one closed 31 days ago and one closed today.
  ids.unconfirmedOld = (await adult('old@example.test', false)).id;
  ids.unconfirmedNew = (await adult('new@example.test', false)).id;
  const keeper = await adult('keeper@example.test', true);
  ids.keeper = keeper.id;
  const closedOld = await adult('closed-old@example.test', true);
  ids.closedOld = closedOld.id;
  await post('/v1/me/close', { password: PASSWORD }, closedOld.cookie);
  const closedNew = await adult('closed-new@example.test', true);
  ids.closedNew = closedNew.id;
  await post('/v1/me/close', { password: PASSWORD }, closedNew.cookie);
  await database.db
    .update(users)
    .set({ createdAt: ago(31) })
    .where(sql`${users.id} in (${ids.unconfirmedOld}, ${ids.keeper})`);
  await database.db
    .update(users)
    .set({ deactivatedAt: ago(31) })
    .where(eq(users.id, ids.closedOld));

  // Learners with their own accounts: one no guardian approved for 31 days, one
  // approved, and one closed and emptied four years ago, whose consent waited.
  ids.unapproved = await ownLearner('pending', 'pending.guardian@example.test', false);
  ids.approved = await ownLearner('approved', 'approved.guardian@example.test', true);
  ids.longGone = await ownLearner('longgone', 'longgone.guardian@example.test', true);
  await database.db
    .update(users)
    .set({ createdAt: ago(31) })
    .where(sql`${users.id} in (${ids.unapproved}, ${ids.approved})`);
  await database.db
    .update(users)
    .set({ deactivatedAt: ago(4 * 365), erasedAt: ago(4 * 365 - 30) })
    .where(eq(users.id, ids.longGone));

  // A teacher with a class archived 400 days ago and a class still running. One
  // learner was only in the old class; the other is in both.
  const teacher = await signUpTeacher(app, mailbox, {
    email: 'teacher@example.test',
    password: PASSWORD,
    displayName: 'রিনা',
    schoolName: 'বিদ্যালয়',
  });
  const schoolId = (
    await app.inject({ method: 'GET', url: '/v1/me', headers: { cookie: teacher } })
  ).json().schools[0].schoolId;
  const make = async (name: string) =>
    (await post('/v1/classes', { schoolId, name, grade: 7, schoolConsent: true }, teacher)).json();
  const oldClass = await make('পুরোনো');
  const newClass = await make('নতুন');
  const join = async (code: string, pseudonym: string) =>
    (await post('/v1/join', { code, pseudonym })).json();
  const onlyOld = await join(oldClass.joinCode, 'নদী');
  const both = await join(oldClass.joinCode, 'পাহাড়');
  ids.onlyOldKey = onlyOld.key;
  await post('/v1/auth/key', { key: both.key }); // signs in once
  const classLearners = await database.db
    .select({ id: classEnrollments.learnerId, pseudonym: classEnrollments.pseudonym })
    .from(classEnrollments)
    .where(eq(classEnrollments.classId, oldClass.id));
  ids.onlyOld = classLearners.find((l) => l.pseudonym === 'নদী')!.id;
  ids.both = classLearners.find((l) => l.pseudonym === 'পাহাড়')!.id;
  await database.db
    .insert(classEnrollments)
    .values({ classId: newClass.id, learnerId: ids.both, pseudonym: 'পাহাড়' });
  await database.db
    .update(classes)
    .set({ archivedAt: ago(400) })
    .where(eq(classes.id, oldClass.id));

  // Projects: the keeper's one deleted 40 days ago, one deleted 5 days ago and
  // one with 25 versions; the closed adult's one, which goes with the account.
  const project = async (ownerId: string, deletedAt: Date | null, versions: number) => {
    const [made] = await database.db
      .insert(projects)
      .values({ ownerId, title: 'প্রকল্প', deletedAt })
      .returning({ id: projects.id });
    for (let version = 1; version <= versions; version++) {
      await database.db
        .insert(projectVersions)
        .values({ projectId: made!.id, version, schemaVersion: 1, document: { version } });
    }
    return made!.id;
  };
  ids.deletedOld = await project(ids.keeper, ago(40), 2);
  ids.deletedNew = await project(ids.keeper, ago(5), 2);
  ids.manyVersions = await project(ids.keeper, null, 25);
  ids.closedProject = await project(ids.closedOld, null, 1);

  // Progress: the same step done three times long ago and once lately; another
  // step done twice long ago; and the closed adult's, which goes with the account.
  const event = (learnerId: string, step: number, daysAgo: number) =>
    database.db.insert(progressEvents).values({
      learnerId,
      lessonId: 'blink',
      step,
      outcome: 'step-done',
      clientEventId: crypto.randomUUID(),
      occurredAt: ago(daysAgo),
    });
  for (const daysAgo of [900, 800, 760, 10]) await event(ids.both, 1, daysAgo);
  for (const daysAgo of [900, 800]) await event(ids.both, 2, daysAgo);
  await event(ids.closedOld, 1, 5);

  // The keeper's email link was used, and their session ended, 40 days ago.
  await database.db
    .update(emailTokens)
    .set({ usedAt: ago(40) })
    .where(eq(emailTokens.userId, ids.keeper));
  await database.db
    .update(sessions)
    .set({ revokedAt: ago(40) })
    .where(eq(sessions.userId, ids.keeper));
  // An audit entry from 800 days ago.
  await database.db.insert(auditLogs).values({ action: 'test.old', occurredAt: ago(800) });
});

afterAll(async () => {
  await app?.close();
  await database?.pool.end();
});

describe('the retention job', () => {
  let expected: Record<string, number>;

  it('reports what it would do, and changes nothing', async () => {
    const consentsOfLongGone = await rows(
      consentRecords,
      eq(consentRecords.learnerId, ids.longGone),
    );
    expect(consentsOfLongGone).toBeGreaterThan(0);
    const keeperTokens = await rows(emailTokens, eq(emailTokens.userId, ids.keeper));
    const keeperSessions = await rows(sessions, eq(sessions.userId, ids.keeper));
    expected = {
      'close-unconfirmed': 1,
      'close-unapproved': 1,
      'close-class-learners': 1,
      'erase-closed-accounts': 1,
      'remove-deleted-projects': 1,
      'trim-project-versions': 5,
      'compact-old-progress': 3 + 1,
      'remove-old-consents': consentsOfLongGone,
      'remove-old-email-links': keeperTokens,
      'remove-old-sessions': keeperSessions,
      'remove-old-audit': 1,
    };

    const before = await snapshot();
    const report = await runRetention(database);
    expect(report.applied).toBe(false);
    expect(Object.fromEntries(report.rules.map((r) => [r.name, r.rows]))).toEqual(expected);
    expect(await snapshot()).toEqual(before);
  });

  it('applied, it does exactly what it reported, and records it', async () => {
    const result = await runRetention(database, { apply: true });
    expect(Object.fromEntries(result.rules.map((r) => [r.name, r.rows]))).toEqual(expected);

    // Closed: the old unconfirmed adult, the unapproved learner, the learner
    // whose only class was archived long ago. The others stay open.
    for (const id of [ids.unconfirmedOld, ids.unapproved, ids.onlyOld]) {
      expect((await user(id)).deactivatedAt).not.toBeNull();
    }
    for (const id of [ids.unconfirmedNew, ids.keeper, ids.approved, ids.both]) {
      expect((await user(id)).deactivatedAt).toBeNull();
    }
    // Closing here is closing in full: the key stops working, consent is withdrawn.
    expect((await post('/v1/auth/key', { key: ids.onlyOldKey })).statusCode).toBe(401);
    const consents = await database.db
      .select({ revokedAt: consentRecords.revokedAt })
      .from(consentRecords)
      .where(eq(consentRecords.learnerId, ids.onlyOld));
    expect(consents.length).toBeGreaterThan(0);
    expect(consents.every((c) => c.revokedAt !== null)).toBe(true);

    // Emptied: the account closed 31 days ago. Its row stays without anything personal.
    const erased = await user(ids.closedOld);
    expect(erased).toMatchObject({
      displayName: '',
      email: null,
      username: null,
      passwordHash: null,
      signInKeyHash: null,
      emailVerifiedAt: null,
    });
    expect(erased.erasedAt).not.toBeNull();
    expect(await rows(projects, eq(projects.ownerId, ids.closedOld))).toBe(0);
    expect(await rows(progressEvents, eq(progressEvents.learnerId, ids.closedOld))).toBe(0);
    expect(await rows(sessions, eq(sessions.userId, ids.closedOld))).toBe(0);
    expect(await rows(emailTokens, eq(emailTokens.userId, ids.closedOld))).toBe(0);
    // The account closed today waits.
    const waiting = await user(ids.closedNew);
    expect(waiting.erasedAt).toBeNull();
    expect(waiting.email).toBe('closed-new@example.test');

    // Projects: the one deleted 40 days ago is gone; the one deleted 5 days ago stays.
    expect(await rows(projects, eq(projects.id, ids.deletedOld))).toBe(0);
    expect(await rows(projects, eq(projects.id, ids.deletedNew))).toBe(1);
    const kept = await database.db
      .select({ version: projectVersions.version })
      .from(projectVersions)
      .where(eq(projectVersions.projectId, ids.manyVersions))
      .orderBy(projectVersions.version);
    expect(kept.map((v) => v.version)).toEqual(Array.from({ length: 20 }, (_, i) => i + 6));

    // Progress: one of each repeat is left, and the learner's progress page reads the same.
    const left = await database.db
      .select({ step: progressEvents.step, at: progressEvents.occurredAt })
      .from(progressEvents)
      .where(eq(progressEvents.learnerId, ids.both))
      .orderBy(progressEvents.step);
    expect(left.map((e) => e.step)).toEqual([1, 2]);
    expect(left[0]!.at.getTime()).toBeGreaterThan(ago(11).getTime());

    // Consent of the account emptied four years ago, old links and sessions, old audit.
    expect(await rows(consentRecords, eq(consentRecords.learnerId, ids.longGone))).toBe(0);
    expect(await rows(emailTokens, eq(emailTokens.userId, ids.keeper))).toBe(0);
    expect(await rows(sessions, eq(sessions.userId, ids.keeper))).toBe(0);
    expect(await rows(auditLogs, eq(auditLogs.action, 'test.old'))).toBe(0);

    // The run is in the audit log, with counts only.
    const [entry] = await database.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'retention.run'));
    expect(entry!.metadata).toEqual(expected);
  });

  it('a second run finds nothing left to do', async () => {
    const again = await runRetention(database, { apply: true });
    expect(again.rules.every((r) => r.rows === 0)).toBe(true);
  });

  it('takes its periods from RETENTION_* settings, and refuses nonsense', () => {
    expect(retentionPolicy({})).toEqual(PROPOSED_POLICY);
    expect(retentionPolicy({ RETENTION_AUDIT_DAYS: '365' }).auditDays).toBe(365);
    expect(() => retentionPolicy({ RETENTION_AUDIT_DAYS: '0' })).toThrow(/RETENTION_AUDIT_DAYS/);
    expect(() => retentionPolicy({ RETENTION_PROJECT_VERSIONS: 'ten' })).toThrow();
  });
});
