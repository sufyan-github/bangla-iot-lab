import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../app';
import { loadConfig } from '../config';
import type { Database } from '../db/client';
import { users } from '../db/schema';
import { LocalMailbox } from '../mail';
import { cookieOf, signUpTeacher } from '../test-accounts';
import { freshDatabase } from '../test-database';

/**
 * Schools that apply and wait for an owner, teachers' passwords, and the
 * classroom's limits (D-098), against PostgreSQL 18. Approval is required here,
 * as in production.
 */
const config = loadConfig({
  LOG_LEVEL: 'silent',
  WEB_ORIGIN: 'http://localhost:4174',
  SIGN_INS_PER_MINUTE: '1000',
});
let database: Database;
let app: Awaited<ReturnType<typeof buildApp>>;
const mailbox = new LocalMailbox();
const PASSWORD = 'a long pass phrase';

const post = (url: string, payload: object = {}, cookie?: string) =>
  app.inject({ method: 'POST', url, payload, ...(cookie ? { headers: { cookie } } : {}) });
const get = (url: string, cookie?: string) =>
  app.inject({ method: 'GET', url, ...(cookie ? { headers: { cookie } } : {}) });
const signIn = async (email: string, password = PASSWORD) =>
  cookieOf(await post('/v1/auth/sign-in', { email, password }));

let owner: string;
let admin: string;
let schoolId: string;

beforeAll(async () => {
  database = await freshDatabase('banglalab_test_school_flows');
  app = await buildApp({ config, database, fetch: globalThis.fetch, mailer: mailbox });
  // The owner: an adult on their own, made an owner as the server command does.
  await post('/v1/auth/register', {
    email: 'owner@example.test',
    password: PASSWORD,
    displayName: 'মালিক',
    adult: true,
  });
  const token = /#([\w-]+)/.exec(mailbox.latest('owner@example.test')!.text)![1]!;
  owner = cookieOf(await post('/v1/auth/verify-email', { token }));
  await database.db
    .update(users)
    .set({ platformRole: 'platform_admin' })
    .where(eq(users.email, 'owner@example.test'));
  admin = await signUpTeacher(app, mailbox, {
    email: 'admin@example.test',
    password: PASSWORD,
    displayName: 'প্রধান শিক্ষক',
    schoolName: 'নতুন বিদ্যালয়',
  });
  schoolId = (await get('/v1/me', admin)).json().schools[0].schoolId;
});
afterAll(async () => {
  await app?.close();
  await database?.pool.end();
});

const newClass = (cookie: string, name = 'সপ্তম ক') =>
  post('/v1/classes', { schoolId, name, grade: 7, schoolConsent: true }, cookie);

describe('a school that applies', () => {
  it('waits for the owner: its teacher signs in but cannot make classes or invite yet', async () => {
    const me = (await get('/v1/me', admin)).json();
    expect(me.schools[0]).toMatchObject({ schoolName: 'নতুন বিদ্যালয়', schoolStatus: 'pending' });
    expect((await newClass(admin)).statusCode).toBe(403);
    expect((await post(`/v1/schools/${schoolId}/invites`, {}, admin)).statusCode).toBe(403);
    const waiting = (await get('/v1/owner/schools?status=pending', owner)).json();
    expect(waiting.schools.map((s: { name: string }) => s.name)).toEqual(['নতুন বিদ্যালয়']);
  });

  it('works once the owner approves it', async () => {
    expect((await post(`/v1/owner/schools/${schoolId}/activate`, {}, owner)).statusCode).toBe(200);
    expect((await get('/v1/me', admin)).json().schools[0].schoolStatus).toBe('active');
    expect((await newClass(admin)).statusCode).toBe(201);
  });
});

describe('teachers’ passwords', () => {
  let teacher: string;
  let teacherId: string;

  beforeAll(async () => {
    const { code } = (await post(`/v1/schools/${schoolId}/invites`, {}, admin)).json();
    teacher = await signUpTeacher(app, mailbox, {
      email: 'teacher@example.test',
      password: PASSWORD,
      displayName: 'রিনা আপা',
      inviteCode: code,
    });
    teacherId = (await get('/v1/me', teacher)).json().user.id;
  });

  it('the school’s admin gives a teacher a reset link to hand on', async () => {
    const answer = await post(
      `/v1/schools/${schoolId}/teachers/${teacherId}/reset-link`,
      {},
      admin,
    );
    expect(answer.statusCode).toBe(200);
    const token = answer.json().link.split('#')[1];
    expect(
      (await post('/v1/auth/reset-password', { token, password: 'set by the admin' })).statusCode,
    ).toBe(200);
    // Every session of the teacher ended; the new password works.
    expect((await get('/v1/me', teacher)).statusCode).toBe(401);
    teacher = await signIn('teacher@example.test', 'set by the admin');
    expect((await get('/v1/me', teacher)).statusCode).toBe(200);
  });

  it('only the admin, only for their own school’s teachers, and not for themself', async () => {
    expect(
      (await post(`/v1/schools/${schoolId}/teachers/${teacherId}/reset-link`, {}, teacher))
        .statusCode,
    ).toBe(403);
    const adminId = (await get('/v1/me', admin)).json().user.id;
    expect(
      (await post(`/v1/schools/${schoolId}/teachers/${adminId}/reset-link`, {}, admin)).json(),
    ).toEqual({
      error: 'use-change-password',
    });
    const ownerId = (await get('/v1/me', owner)).json().user.id;
    expect(
      (await post(`/v1/schools/${schoolId}/teachers/${ownerId}/reset-link`, {}, admin)).statusCode,
    ).toBe(404);
  });

  it('a teacher changes their own password; other devices are signed out, this one stays', async () => {
    const other = await signIn('teacher@example.test', 'set by the admin');
    expect(
      (
        await post('/v1/me/password', { current: 'wrong one', next: 'my own new phrase' }, teacher)
      ).json(),
    ).toEqual({ error: 'wrong-password' });
    expect(
      (await post('/v1/me/password', { current: 'set by the admin', next: 'short' }, teacher))
        .statusCode,
    ).toBe(400);
    const changed = await post(
      '/v1/me/password',
      { current: 'set by the admin', next: 'my own new phrase' },
      teacher,
    );
    expect(changed.statusCode).toBe(200);
    expect((await get('/v1/me', teacher)).statusCode).toBe(200);
    expect((await get('/v1/me', other)).statusCode).toBe(401);
    expect(
      (
        await post('/v1/auth/sign-in', {
          email: 'teacher@example.test',
          password: 'my own new phrase',
        })
      ).statusCode,
    ).toBe(200);
  });

  it('signs out everywhere, this device too', async () => {
    const second = await signIn('teacher@example.test', 'my own new phrase');
    const out = await post('/v1/auth/sign-out-everywhere', {}, teacher);
    expect(String(out.headers['set-cookie'])).toContain('Max-Age=0');
    expect((await get('/v1/me', teacher)).statusCode).toBe(401);
    expect((await get('/v1/me', second)).statusCode).toBe(401);
  });

  it('a class learner has a key, not a password', async () => {
    const { joinCode } = (await newClass(admin, 'অষ্টম')).json();
    const learner = cookieOf(await post('/v1/join', { code: joinCode, pseudonym: 'তারা' }));
    expect(
      (await post('/v1/me/password', { current: 'x', next: 'a long new phrase' }, learner)).json(),
    ).toEqual({
      error: 'no-password',
    });
  });
});

describe('a whole class at once', () => {
  it('joins and signs in by key far more often than other sign-ins are allowed', async () => {
    const classroom = await buildApp({
      config: { ...config, signInsPerMinute: 2, classJoinsPerMinute: 50 },
      database,
      fetch: globalThis.fetch,
      mailer: mailbox,
    });
    const { joinCode } = (await newClass(admin, 'নবম')).json();
    for (let i = 0; i < 12; i++) {
      const joined = await classroom.inject({
        method: 'POST',
        url: '/v1/join',
        payload: { code: joinCode, pseudonym: `শিক্ষার্থী ${i}` },
      });
      expect(joined.statusCode).toBe(201);
    }
    await classroom.close();
  });
});
