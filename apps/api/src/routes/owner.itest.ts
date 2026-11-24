import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../app';
import { loadConfig } from '../config';
import type { Database } from '../db/client';
import { users } from '../db/schema';
import { LocalMailbox } from '../mail';
import { signUpTeacher } from '../test-accounts';
import { freshDatabase } from '../test-database';

/** The lab owner's panel (D-097), against PostgreSQL 18. */
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

const cookieOf = (response: { headers: Record<string, unknown> }) =>
  String(response.headers['set-cookie']).split(';')[0]!;
const post = (url: string, payload: object = {}, cookie?: string) =>
  app.inject({ method: 'POST', url, payload, ...(cookie ? { headers: { cookie } } : {}) });
const get = (url: string, cookie?: string) =>
  app.inject({ method: 'GET', url, ...(cookie ? { headers: { cookie } } : {}) });
const linkTo = (to: string) =>
  /\/account\/\w+#([\w-]+)/.exec(mailbox.latest(to)?.text ?? '')?.[1] ?? '';
const signIn = async (identifier: string, password = PASSWORD) =>
  cookieOf(await post('/v1/auth/sign-in', { identifier, password }));

/** An adult on their own, email confirmed; returns their id. */
async function adult(email: string, name: string) {
  await post('/v1/auth/register', { email, password: PASSWORD, displayName: name, adult: true });
  await post('/v1/auth/verify-email', { token: linkTo(email) });
  const [row] = await database.db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email));
  return row!.id;
}

let owner: string;
let teacher: string;
let schoolId: string;
let joinCode: string;
let learnerId: string;
let ownerId: string;

beforeAll(async () => {
  database = await freshDatabase('banglalab_test_owner');
  app = await buildApp({ config, database, fetch: globalThis.fetch, mailer: mailbox });

  ownerId = await adult('owner@example.test', 'মালিক');
  await database.db
    .update(users)
    .set({ platformRole: 'platform_admin' })
    .where(eq(users.id, ownerId));
  owner = await signIn('owner@example.test');

  teacher = await signUpTeacher(app, mailbox, {
    email: 'teacher@example.test',
    password: PASSWORD,
    displayName: 'রিনা আপা',
    schoolName: 'নদী উচ্চ বিদ্যালয়',
  });
  schoolId = (await get('/v1/me', teacher)).json().schools[0].schoolId;
  joinCode = (
    await post('/v1/classes', { schoolId, name: 'সপ্তম ক', grade: 7, schoolConsent: true }, teacher)
  ).json().joinCode;
  const joined = await post('/v1/join', { code: joinCode, pseudonym: 'তারা' });
  learnerId = (await get('/v1/me', cookieOf(joined))).json().user.id;

  await adult('rahim@example.test', 'রহিম');
  await post('/v1/auth/register-learner', {
    username: 'megh',
    pseudonym: 'মেঘ',
    password: PASSWORD,
    guardianEmail: 'ma@example.test',
  });
  await post('/v1/auth/approve-learner', { token: linkTo('ma@example.test') });
});
afterAll(async () => {
  await app?.close();
  await database?.pool.end();
});

describe('the owner’s panel', () => {
  it('is for owners only', async () => {
    expect((await get('/v1/owner/overview')).statusCode).toBe(401);
    expect((await get('/v1/owner/overview', teacher)).json()).toEqual({ error: 'owners-only' });
    expect((await get('/v1/me', owner)).json().user.platformRole).toBe('platform_admin');
    expect((await get('/v1/me', teacher)).json().user.platformRole).toBeNull();
  });

  it('counts schools and people of every kind', async () => {
    const overview = (await get('/v1/owner/overview', owner)).json();
    expect(overview.schools).toEqual({ pending: 0, active: 1, suspended: 0, closed: 0 });
    expect(overview.people).toMatchObject({
      staff: 1,
      // The owner and রহিম: adults in no school.
      adults: 2,
      ownLearners: 1,
      classLearners: 1,
      suspended: 0,
    });
  });

  it('lists schools with their admins and sizes', async () => {
    const list = (await get('/v1/owner/schools', owner)).json();
    expect(list.total).toBe(1);
    expect(list.schools[0]).toMatchObject({
      name: 'নদী উচ্চ বিদ্যালয়',
      status: 'active',
      teachers: 1,
      admins: [{ name: 'রিনা আপা', email: 'teacher@example.test' }],
      classes: 1,
      learners: 1,
    });
    expect((await get('/v1/owner/schools?q=নদী', owner)).json().total).toBe(1);
    expect((await get('/v1/owner/schools?q=xyz', owner)).json().total).toBe(0);
  });

  it('a suspended school cannot be joined, and its staff cannot act for it, until restarted', async () => {
    expect((await post(`/v1/owner/schools/${schoolId}/suspend`, {}, owner)).statusCode).toBe(200);
    const join = await post('/v1/join', { code: joinCode, pseudonym: 'নতুন' });
    expect(join.json()).toEqual({ error: 'no-such-code' });
    const made = await post(
      '/v1/classes',
      { schoolId, name: 'অষ্টম', grade: 8, schoolConsent: true },
      teacher,
    );
    expect(made.statusCode).toBe(403);
    // The teacher can still sign in and see the school.
    expect((await get('/v1/me', teacher)).statusCode).toBe(200);
    expect((await get('/v1/owner/schools?status=suspended', owner)).json().total).toBe(1);

    await post(`/v1/owner/schools/${schoolId}/activate`, {}, owner);
    expect((await post('/v1/join', { code: joinCode, pseudonym: 'নতুন' })).statusCode).toBe(201);
  });

  it('lists people by kind, showing a learner only what running the lab needs', async () => {
    const own = (await get('/v1/owner/people?kind=learner', owner)).json();
    expect(own.people).toHaveLength(1);
    expect(own.people[0]).toMatchObject({
      displayName: 'মেঘ',
      username: 'megh',
      email: null,
      account: 'individual',
      // The guardian's email, only in part.
      guardian: { email: 'm…@example.test', approved: true },
    });
    const inClass = (await get('/v1/owner/people?kind=class', owner)).json();
    expect(inClass.people.map((p: { displayName: string }) => p.displayName).sort()).toEqual([
      'তারা',
      'নতুন',
    ]);
    expect(inClass.people[0]).toMatchObject({ email: null, username: null, classes: 1 });
    const staff = (await get('/v1/owner/people?kind=staff', owner)).json();
    expect(staff.people[0]).toMatchObject({
      displayName: 'রিনা আপা',
      account: 'staff',
      schools: expect.arrayContaining([{ school: 'নদী উচ্চ বিদ্যালয়', role: 'school_admin' }]),
    });
    expect((await get('/v1/owner/people?q=rahim', owner)).json().people[0].displayName).toBe(
      'রহিম',
    );
  });

  it('suspends an account at once, and restores it', async () => {
    const rahim = (await get('/v1/owner/people?q=rahim', owner)).json().people[0].id;
    const session = await signIn('rahim@example.test');
    await post(`/v1/owner/people/${rahim}/suspend`, {}, owner);
    expect((await get('/v1/me', session)).statusCode).toBe(401);
    const blocked = await post('/v1/auth/sign-in', {
      identifier: 'rahim@example.test',
      password: PASSWORD,
    });
    expect(blocked.json()).toEqual({ error: 'account-suspended' });
    expect((await get('/v1/owner/people?status=suspended', owner)).json().total).toBe(1);

    await post(`/v1/owner/people/${rahim}/restore`, {}, owner);
    expect(
      (await post('/v1/auth/sign-in', { identifier: 'rahim@example.test', password: PASSWORD }))
        .statusCode,
    ).toBe(200);
  });

  it('a suspended class learner cannot come back with their key', async () => {
    const key = (
      await post(
        '/v1/me/key',
        {},
        cookieOf(await post('/v1/join', { code: joinCode, pseudonym: 'বাতাস' })),
      )
    ).json().key;
    const [row] = await database.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.displayName, 'বাতাস'));
    await post(`/v1/owner/people/${row!.id}/suspend`, {}, owner);
    expect((await post('/v1/auth/key', { key })).json()).toEqual({ error: 'account-suspended' });
  });

  it('never suspends or closes the owner’s own account, or another owner’s', async () => {
    expect((await post(`/v1/owner/people/${ownerId}/suspend`, {}, owner)).json()).toEqual({
      error: 'protected-account',
    });
    expect((await post(`/v1/owner/people/${ownerId}/close`, {}, owner)).statusCode).toBe(409);
  });

  it('gives a reset link to hand on, for adults and learners with their own account', async () => {
    const megh = (await get('/v1/owner/people?kind=learner', owner)).json().people[0].id;
    const answer = (await post(`/v1/owner/people/${megh}/reset-link`, {}, owner)).json();
    expect(answer.link).toMatch(/^http:\/\/localhost:4174\/account\/reset#[\w-]+$/);
    const token = answer.link.split('#')[1];
    expect(
      (await post('/v1/auth/reset-password', { token, password: 'set by the owner' })).statusCode,
    ).toBe(200);
    expect(
      (await post('/v1/auth/sign-in', { identifier: 'megh', password: 'set by the owner' }))
        .statusCode,
    ).toBe(200);
    // A class learner has no password: their teacher gives a new key.
    expect((await post(`/v1/owner/people/${learnerId}/reset-link`, {}, owner)).json()).toEqual({
      error: 'class-learner',
    });
  });

  it('closes an account for good', async () => {
    const rahim = (await get('/v1/owner/people?q=rahim', owner)).json().people[0].id;
    await post(`/v1/owner/people/${rahim}/close`, {}, owner);
    expect(
      (await post('/v1/auth/sign-in', { identifier: 'rahim@example.test', password: PASSWORD }))
        .statusCode,
    ).toBe(401);
    expect((await get('/v1/owner/people?q=rahim', owner)).json().total).toBe(0);
    expect((await get('/v1/owner/people?q=rahim&status=closed', owner)).json().total).toBe(1);
    expect((await post(`/v1/owner/people/${rahim}/restore`, {}, owner)).json()).toEqual({
      error: 'account-closed',
    });
  });

  it('shows what was done, newest first, by whom', async () => {
    const { entries } = (await get('/v1/owner/activity', owner)).json();
    expect(entries[0]).toMatchObject({ action: 'owner.close', actor: 'মালিক', targetType: 'user' });
    expect(entries.map((e: { action: string }) => e.action)).toEqual(
      expect.arrayContaining(['owner.school-suspend', 'owner.school-activate', 'owner.reset-link']),
    );
  });
});
