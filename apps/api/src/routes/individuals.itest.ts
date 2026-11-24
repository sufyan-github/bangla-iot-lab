import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../app';
import { loadConfig } from '../config';
import type { Database } from '../db/client';
import { consentRecords, guardianLinks, users } from '../db/schema';
import { LocalMailbox } from '../mail';
import { freshDatabase } from '../test-database';

/**
 * People on their own, outside any school (D-096): adults with a confirmed
 * email, and learners under 18 whose guardian approved the account by email.
 * Against PostgreSQL 18, with the local mailbox standing in for email.
 */
// Many sign-ins from one test address: the limit itself is tested on its own.
const config = loadConfig({
  LOG_LEVEL: 'silent',
  WEB_ORIGIN: 'http://localhost:4174',
  SIGN_INS_PER_MINUTE: '1000',
});
let database: Database;
let app: Awaited<ReturnType<typeof buildApp>>;
const mailbox = new LocalMailbox();

const cookieOf = (response: { headers: Record<string, unknown> }) =>
  String(response.headers['set-cookie']).split(';')[0]!;
const as = (cookie: string) => ({ headers: { cookie } });
const post = (url: string, payload: object, cookie?: string) =>
  app.inject({ method: 'POST', url, payload, ...(cookie ? as(cookie) : {}) });
/** The token in the newest email to an address: the part after # in its link. */
const linkTo = (to: string) => {
  const text = mailbox.latest(to)?.text ?? '';
  return /\/account\/\w+#([\w-]+)/.exec(text)?.[1] ?? '';
};
const PASSWORD = 'a long pass phrase';

/** A learner with their own account, approved by a guardian, signed in. */
async function newLearner(pseudonym: string, username: string) {
  const guardian = `${username}.guardian@example.test`;
  await post('/v1/auth/register-learner', {
    username,
    pseudonym,
    password: PASSWORD,
    guardianEmail: guardian,
  });
  await post('/v1/auth/approve-learner', { token: linkTo(guardian) });
  return cookieOf(await post('/v1/auth/sign-in', { identifier: username, password: PASSWORD }));
}

beforeAll(async () => {
  database = await freshDatabase('banglalab_test_individuals');
  app = await buildApp({ config, database, fetch: globalThis.fetch, mailer: mailbox });
});
afterAll(async () => {
  await app?.close();
  await database?.pool.end();
});

describe('adults on their own', () => {
  it('sign up, confirm the email from the link, and only then sign in', async () => {
    const email = 'rahim@example.test';
    const made = await post('/v1/auth/register', {
      email: 'Rahim@Example.test',
      password: PASSWORD,
      displayName: 'রহিম',
      adult: true,
    });
    expect(made.statusCode).toBe(202);
    expect(made.headers['set-cookie']).toBeUndefined();
    expect(mailbox.latest(email)!.subject).toMatch(/Confirm your email/);
    // Not yet: the email is not confirmed.
    const early = await post('/v1/auth/sign-in', { identifier: email, password: PASSWORD });
    expect(early.json()).toEqual({ error: 'email-not-verified' });
    // The link says what it is for, without using it up.
    const token = linkTo(email);
    expect((await post('/v1/auth/email-link', { token })).json()).toEqual({
      purpose: 'verify-email',
      displayName: 'রহিম',
      username: null,
    });
    const verified = await post('/v1/auth/verify-email', { token });
    expect(verified.statusCode).toBe(200);
    // Signed in by the link, for this browser session only.
    expect(String(verified.headers['set-cookie'])).not.toMatch(/Max-Age/);
    const me = await app.inject({ method: 'GET', url: '/v1/me', ...as(cookieOf(verified)) });
    expect(me.json().user).toMatchObject({ kind: 'adult', account: 'individual' });
    // A link works once.
    expect((await post('/v1/auth/verify-email', { token })).statusCode).toBe(404);
    // Now sign-in works; "keep me signed in" makes a 30-day cookie.
    const kept = await post('/v1/auth/sign-in', {
      identifier: email,
      password: PASSWORD,
      keep: true,
    });
    expect(String(kept.headers['set-cookie'])).toMatch(/Max-Age=2592000/);
  });

  it('answers the same whether or not the email already has an account', async () => {
    const again = await post('/v1/auth/register', {
      email: 'rahim@example.test',
      password: 'another long phrase',
      displayName: 'কেউ',
      adult: true,
    });
    expect(again.statusCode).toBe(202);
    // The owner of the address is told instead, and the password did not change.
    expect(mailbox.latest('rahim@example.test')!.subject).toMatch(/already have an account/);
    const old = await post('/v1/auth/sign-in', {
      identifier: 'rahim@example.test',
      password: PASSWORD,
    });
    expect(old.statusCode).toBe(200);
  });

  it('resets a forgotten password by email, which ends every session', async () => {
    const email = 'rahim@example.test';
    const before = cookieOf(
      await post('/v1/auth/sign-in', { identifier: email, password: PASSWORD }),
    );
    const asked = await post('/v1/auth/forgot-password', { identifier: email });
    expect(asked.statusCode).toBe(202);
    // The same answer for an address with no account, and no email is sent.
    const sent = mailbox.sent.length;
    expect(
      (await post('/v1/auth/forgot-password', { identifier: 'nobody@example.test' })).statusCode,
    ).toBe(202);
    expect(mailbox.sent.length).toBe(sent);

    const token = linkTo(email);
    expect((await post('/v1/auth/reset-password', { token, password: 'short' })).statusCode).toBe(
      400,
    );
    const reset = await post('/v1/auth/reset-password', { token, password: 'a new long phrase' });
    expect(reset.statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/v1/me', ...as(before) })).statusCode).toBe(
      401,
    );
    expect(
      (await post('/v1/auth/sign-in', { identifier: email, password: PASSWORD })).statusCode,
    ).toBe(401);
    expect(
      (await post('/v1/auth/sign-in', { identifier: email, password: 'a new long phrase' }))
        .statusCode,
    ).toBe(200);
    expect(
      (await post('/v1/auth/reset-password', { token, password: 'yet another phrase' })).statusCode,
    ).toBe(404);
  });

  it('records the progress of an adult on their own', async () => {
    const cookie = cookieOf(
      await post('/v1/auth/sign-in', {
        identifier: 'rahim@example.test',
        password: 'a new long phrase',
      }),
    );
    const at = new Date().toISOString();
    const sent = await post(
      '/v1/progress',
      {
        events: [{ id: randomUUID(), lessonId: 'led-resistor', step: 0, outcome: 'step-done', at }],
      },
      cookie,
    );
    expect(sent.json()).toEqual({ kept: 1 });
  });
});

describe('learners on their own', () => {
  it('sign up without any email of theirs; the guardian approves by email', async () => {
    const guardian = 'ma@example.test';
    const made = await post('/v1/auth/register-learner', {
      username: 'Megh_7',
      pseudonym: 'মেঘ',
      password: PASSWORD,
      guardianEmail: guardian,
    });
    expect(made.statusCode).toBe(202);
    expect(made.headers['set-cookie']).toBeUndefined();
    const [row] = await database.db.select().from(users).where(eq(users.username, 'megh_7'));
    expect(row).toMatchObject({ kind: 'learner', email: null, displayName: 'মেঘ' });
    // The name is taken now, however it is written.
    const taken = await post('/v1/auth/register-learner', {
      username: 'MEGH_7',
      pseudonym: 'অন্য',
      password: PASSWORD,
      guardianEmail: guardian,
    });
    expect(taken.json()).toEqual({ error: 'username-taken' });
    // An email-like or too-short sign-in name is refused.
    expect(
      (
        await post('/v1/auth/register-learner', {
          username: 'a@b',
          pseudonym: 'ক',
          password: PASSWORD,
          guardianEmail: guardian,
        })
      ).statusCode,
    ).toBe(400);

    // Not yet: the guardian has not approved.
    const early = await post('/v1/auth/sign-in', { identifier: 'megh_7', password: PASSWORD });
    expect(early.json()).toEqual({ error: 'awaiting-guardian' });
    const mail = mailbox.latest(guardian)!;
    expect(mail.text).toContain('মেঘ');
    expect(mail.text).toContain('megh_7');
    // The guardian's page shows whose account it is before they approve.
    const token = linkTo(guardian);
    expect((await post('/v1/auth/email-link', { token })).json()).toEqual({
      purpose: 'approve-learner',
      displayName: 'মেঘ',
      username: 'megh_7',
    });
    const approved = await post('/v1/auth/approve-learner', { token });
    expect(approved.statusCode).toBe(200);
    // Approving signs no one in on the guardian's device.
    expect(approved.headers['set-cookie']).toBeUndefined();
    const [consent] = await database.db
      .select()
      .from(consentRecords)
      .where(eq(consentRecords.learnerId, row!.id));
    expect(consent).toMatchObject({
      grantedBy: 'guardian',
      schoolId: null,
      scope: 'platform_use',
      policyVersion: 'individual-learner-2026-11',
    });
    const [link] = await database.db
      .select()
      .from(guardianLinks)
      .where(eq(guardianLinks.learnerId, row!.id));
    expect(link!.email).toBe(guardian);
    expect(link!.approvedAt).not.toBeNull();

    const signedIn = await post('/v1/auth/sign-in', { identifier: 'MEGH_7', password: PASSWORD });
    expect(signedIn.statusCode).toBe(200);
    const me = await app.inject({ method: 'GET', url: '/v1/me', ...as(cookieOf(signedIn)) });
    expect(me.json().user).toMatchObject({
      kind: 'learner',
      displayName: 'মেঘ',
      ownAccount: true,
      account: 'individual',
      username: 'megh_7',
    });
  });

  it('sends the approval again on request, and the newest link replaces the old one', async () => {
    await post('/v1/auth/register-learner', {
      username: 'tara',
      pseudonym: 'তারা',
      password: PASSWORD,
      guardianEmail: 'baba@example.test',
    });
    const first = linkTo('baba@example.test');
    expect((await post('/v1/auth/resend', { identifier: 'tara' })).statusCode).toBe(202);
    const second = linkTo('baba@example.test');
    expect(second).not.toBe(first);
    expect((await post('/v1/auth/approve-learner', { token: first })).statusCode).toBe(404);
    expect((await post('/v1/auth/approve-learner', { token: second })).statusCode).toBe(200);
  });

  it('a forgotten password: the reset link goes to the guardian', async () => {
    const asked = await post('/v1/auth/forgot-password', { identifier: 'megh_7' });
    expect(asked.statusCode).toBe(202);
    const mail = mailbox.latest('ma@example.test')!;
    expect(mail.subject).toMatch(/new password/);
    expect(mail.text).toContain('মেঘ');
    const reset = await post('/v1/auth/reset-password', {
      token: linkTo('ma@example.test'),
      password: 'the guardian chose this',
    });
    expect(reset.statusCode).toBe(200);
    expect(
      (
        await post('/v1/auth/sign-in', {
          identifier: 'megh_7',
          password: 'the guardian chose this',
        })
      ).statusCode,
    ).toBe(200);
  });

  it('keeps projects and progress, and sees its own progress', async () => {
    const cookie = await newLearner('তারা', 'tara2');
    const at = new Date().toISOString();
    const sent = await post(
      '/v1/progress',
      {
        events: [
          { id: randomUUID(), lessonId: 'led-resistor', step: 0, outcome: 'step-done', at },
          { id: randomUUID(), lessonId: 'led-resistor', step: 1, outcome: 'step-done', at },
          { id: randomUUID(), lessonId: 'led-resistor', step: 1, outcome: 'lesson-done', at },
          { id: randomUUID(), lessonId: 'push-button', step: 0, outcome: 'step-done', at },
        ],
      },
      cookie,
    );
    expect(sent.json()).toEqual({ kept: 4 });
    const progress = await app.inject({ method: 'GET', url: '/v1/me/progress', ...as(cookie) });
    const byLesson = Object.fromEntries(
      progress
        .json()
        .lessons.map((l: { lessonId: string; steps: number; done: boolean }) => [
          l.lessonId,
          [l.steps, l.done],
        ]),
    );
    expect(byLesson).toEqual({ 'led-resistor': [2, true], 'push-button': [1, false] });
  });

  it('a too-many-tries answer says so', async () => {
    const limited = await buildApp({
      config: { ...config, signInsPerMinute: 1 },
      database,
      fetch: globalThis.fetch,
      mailer: mailbox,
    });
    await limited.inject({
      method: 'POST',
      url: '/v1/auth/resend',
      payload: { identifier: 'x@y.test' },
    });
    const second = await limited.inject({
      method: 'POST',
      url: '/v1/auth/resend',
      payload: { identifier: 'x@y.test' },
    });
    expect(second.statusCode).toBe(429);
    expect(second.json()).toEqual({ error: 'too-many-tries' });
    await limited.close();
  });

  it('joins a class on its own account, and keeps the account when taken out of it', async () => {
    const teacher = cookieOf(
      await app.inject({
        method: 'POST',
        url: '/v1/auth/sign-up',
        payload: {
          email: 'teacher@example.test',
          password: 'a long pass phrase',
          displayName: 'শিক্ষক',
          schoolName: 'বিদ্যালয়',
        },
      }),
    );
    const schoolId = (await app.inject({ method: 'GET', url: '/v1/me', ...as(teacher) })).json()
      .schools[0].schoolId;
    const made = await app.inject({
      method: 'POST',
      url: '/v1/classes',
      ...as(teacher),
      payload: { schoolId, name: 'অষ্টম ক', grade: 8, schoolConsent: true },
    });
    const { id: classId, joinCode } = made.json();

    const cookie = await newLearner('রোদ', 'rod');
    const joined = await app.inject({
      method: 'POST',
      url: '/v1/join',
      ...as(cookie),
      payload: { code: joinCode, pseudonym: 'রোদ' },
    });
    expect(joined.statusCode).toBe(201);
    // No key: the learner keeps their own sign-in, and the same account.
    expect(joined.json().key).toBeUndefined();
    const me = await app.inject({ method: 'GET', url: '/v1/me', ...as(cookie) });
    expect(me.json().classes.map((c: { className: string }) => c.className)).toEqual(['অষ্টম ক']);
    const again = await app.inject({
      method: 'POST',
      url: '/v1/join',
      ...as(cookie),
      payload: { code: joinCode, pseudonym: 'রোদ' },
    });
    expect(again.json()).toEqual({ error: 'already-in-class' });

    const roster = await app.inject({
      method: 'GET',
      url: `/v1/classes/${classId}/learners`,
      ...as(teacher),
    });
    const enrolment = roster.json().learners[0].enrolment;
    await app.inject({
      method: 'POST',
      url: `/v1/classes/${classId}/learners/${enrolment}/remove`,
      ...as(teacher),
      payload: {},
    });
    // Out of the class, but still signed in and able to sign in again.
    const after = await app.inject({ method: 'GET', url: '/v1/me', ...as(cookie) });
    expect(after.json().classes).toEqual([]);
    const back = await post('/v1/auth/sign-in', { identifier: 'rod', password: PASSWORD });
    expect(back.statusCode).toBe(200);
  });

  it('a learner who came only through a class is still signed out when taken out', async () => {
    const teacher = cookieOf(
      await app.inject({
        method: 'POST',
        url: '/v1/auth/sign-in',
        payload: { email: 'teacher@example.test', password: 'a long pass phrase' },
      }),
    );
    const classes = (await app.inject({ method: 'GET', url: '/v1/classes', ...as(teacher) })).json()
      .classes;
    const code = (
      await app.inject({
        method: 'POST',
        url: `/v1/classes/${classes[0].id}/join-code`,
        ...as(teacher),
        payload: {},
      })
    ).json().joinCode;
    const joined = await app.inject({
      method: 'POST',
      url: '/v1/join',
      payload: { code, pseudonym: 'বৃষ্টি' },
    });
    const roster = await app.inject({
      method: 'GET',
      url: `/v1/classes/${classes[0].id}/learners`,
      ...as(teacher),
    });
    const enrolment = roster
      .json()
      .learners.find((l: { pseudonym: string }) => l.pseudonym === 'বৃষ্টি').enrolment;
    await app.inject({
      method: 'POST',
      url: `/v1/classes/${classes[0].id}/learners/${enrolment}/remove`,
      ...as(teacher),
      payload: {},
    });
    const back = await app.inject({
      method: 'POST',
      url: '/v1/auth/key',
      payload: { key: joined.json().key },
    });
    expect(back.statusCode).toBe(401);
  });
});
