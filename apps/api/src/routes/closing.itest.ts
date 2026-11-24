import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../app';
import { loadConfig } from '../config';
import type { Database } from '../db/client';
import { classes, consentRecords, users } from '../db/schema';
import { LocalMailbox } from '../mail';
import { cookieOf, signUpTeacher, tokenIn } from '../test-accounts';
import { freshDatabase } from '../test-database';

/** Closing accounts (D-100), against PostgreSQL 18. */
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

const post = (url: string, payload: object = {}, cookie?: string) =>
  app.inject({ method: 'POST', url, payload, ...(cookie ? { headers: { cookie } } : {}) });
const get = (url: string, cookie?: string) =>
  app.inject({ method: 'GET', url, ...(cookie ? { headers: { cookie } } : {}) });
const signIn = (identifier: string, password = PASSWORD) =>
  post('/v1/auth/sign-in', { identifier, password });

/** An adult on their own, email confirmed; returns a signed-in cookie. */
async function adult(email: string) {
  await post('/v1/auth/register', { email, password: PASSWORD, displayName: 'বড়', adult: true });
  return cookieOf(await post('/v1/auth/verify-email', { token: tokenIn(mailbox, email) }));
}
/** A learner with their own account, approved by a guardian; returns a signed-in cookie. */
async function ownLearner(username: string, guardian: string) {
  await post('/v1/auth/register-learner', {
    username,
    pseudonym: 'মেঘ',
    password: PASSWORD,
    guardianEmail: guardian,
  });
  await post('/v1/auth/approve-learner', { token: tokenIn(mailbox, guardian) });
  return cookieOf(await signIn(username));
}

beforeAll(async () => {
  database = await freshDatabase('banglalab_test_closing');
  app = await buildApp({ config, database, fetch: globalThis.fetch, mailer: mailbox });
});
afterAll(async () => {
  await app?.close();
  await database?.pool.end();
});

describe('closing one’s own account', () => {
  it('an adult closes theirs with their password; no way in remains', async () => {
    const cookie = await adult('rahim@example.test');
    expect((await post('/v1/me/close', { password: 'wrong one' }, cookie)).json()).toEqual({
      error: 'wrong-password',
    });
    expect((await post('/v1/me/close', {}, cookie)).statusCode).toBe(401);
    const closed = await post('/v1/me/close', { password: PASSWORD }, cookie);
    expect(closed.statusCode).toBe(200);
    expect(String(closed.headers['set-cookie'])).toContain('Max-Age=0');
    expect((await get('/v1/me', cookie)).statusCode).toBe(401);
    expect((await signIn('rahim@example.test')).statusCode).toBe(401);
    // A reset cannot bring it back: no link is sent for a closed account.
    const before = mailbox.sent.length;
    await post('/v1/auth/forgot-password', { identifier: 'rahim@example.test' });
    expect(mailbox.sent.length).toBe(before);
  });

  it('a learner closes their own account; the guardian’s permission is withdrawn', async () => {
    const cookie = await ownLearner('tara', 'tara.guardian@example.test');
    expect((await post('/v1/me/close', { password: PASSWORD }, cookie)).statusCode).toBe(200);
    expect((await signIn('tara')).statusCode).toBe(401);
    const [row] = await database.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, 'tara'));
    const [consent] = await database.db
      .select()
      .from(consentRecords)
      .where(eq(consentRecords.learnerId, row!.id));
    expect(consent!.revokedAt).not.toBeNull();
  });

  it('a teacher’s classes pass to the school’s admin; an admin or an owner hands on first', async () => {
    const admin = await signUpTeacher(app, mailbox, {
      email: 'admin@example.test',
      password: PASSWORD,
      displayName: 'প্রধান',
      schoolName: 'বিদ্যালয়',
    });
    const me = (await get('/v1/me', admin)).json();
    const schoolId = me.schools[0].schoolId;
    const { code } = (await post(`/v1/schools/${schoolId}/invites`, {}, admin)).json();
    const teacher = await signUpTeacher(app, mailbox, {
      email: 'teacher@example.test',
      password: PASSWORD,
      displayName: 'রিনা',
      inviteCode: code,
    });
    const made = (
      await post('/v1/classes', { schoolId, name: 'সপ্তম', grade: 7, schoolConsent: true }, teacher)
    ).json();
    const joined = cookieOf(await post('/v1/join', { code: made.joinCode, pseudonym: 'নদী' }));

    expect((await post('/v1/me/close', { password: PASSWORD }, admin)).json()).toEqual({
      error: 'admin-stays',
    });
    expect((await post('/v1/me/close', { password: PASSWORD }, teacher)).statusCode).toBe(200);
    const [moved] = await database.db.select().from(classes).where(eq(classes.id, made.id));
    expect(moved!.teacherId).toBe(me.user.id);
    // The class goes on: its learner is still in it.
    expect(
      (await get('/v1/me', joined)).json().classes.map((c: { className: string }) => c.className),
    ).toEqual(['সপ্তম']);

    // An owner hands the role on, on the server, before closing.
    await database.db
      .update(users)
      .set({ platformRole: 'platform_admin' })
      .where(eq(users.id, me.user.id));
    expect((await post('/v1/me/close', { password: PASSWORD }, admin)).json()).toEqual({
      error: 'owner-stays',
    });
  });

  it('a class learner, who has no password, can close theirs; the key stops working', async () => {
    const admin = await signUpTeacher(app, mailbox, {
      email: 'admin2@example.test',
      password: PASSWORD,
      displayName: 'প্রধান',
      schoolName: 'দ্বিতীয়',
    });
    const schoolId = (await get('/v1/me', admin)).json().schools[0].schoolId;
    const { joinCode } = (
      await post('/v1/classes', { schoolId, name: 'অষ্টম', grade: 8, schoolConsent: true }, admin)
    ).json();
    const joined = await post('/v1/join', { code: joinCode, pseudonym: 'বাতাস' });
    const key = joined.json().key;
    expect((await post('/v1/me/close', {}, cookieOf(joined))).statusCode).toBe(200);
    expect((await post('/v1/auth/key', { key })).statusCode).toBe(401);
  });
});

describe('a guardian closes a learner’s own account', () => {
  it('the approval email says how', async () => {
    await ownLearner('megh', 'ma@example.test');
    const approval = mailbox.sent.find(
      (m) => m.to === 'ma@example.test' && m.subject.includes('অনুমোদন'),
    )!;
    expect(approval.text).toContain('http://localhost:4174/account/guardian');
  });

  it('only the approving guardian’s email gets a link; the answer is the same either way', async () => {
    const before = mailbox.sent.length;
    const wrong = await post('/v1/auth/guardian-close', {
      username: 'megh',
      guardianEmail: 'stranger@example.test',
    });
    expect(wrong.statusCode).toBe(202);
    const nobody = await post('/v1/auth/guardian-close', {
      username: 'no-such-name',
      guardianEmail: 'ma@example.test',
    });
    expect(nobody.statusCode).toBe(202);
    expect(mailbox.sent.length).toBe(before);

    const right = await post('/v1/auth/guardian-close', {
      username: 'MEGH',
      guardianEmail: 'Ma@Example.test',
    });
    expect(right.statusCode).toBe(202);
    const mail = mailbox.latest('ma@example.test')!;
    expect(mail.text).toContain('/account/close#');
    const token = tokenIn(mailbox, 'ma@example.test');
    expect((await post('/v1/auth/email-link', { token })).json()).toEqual({
      purpose: 'close-account',
      displayName: 'মেঘ',
      username: 'megh',
    });
    expect((await post('/v1/auth/close-account', { token })).statusCode).toBe(200);
    expect((await signIn('megh')).statusCode).toBe(401);
    expect((await post('/v1/auth/close-account', { token })).statusCode).toBe(404);
  });
});
