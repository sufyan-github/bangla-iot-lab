import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../app';
import { loadConfig } from '../config';
import type { Database } from '../db/client';
import { freshDatabase } from '../test-database';

/** A school admin invites other teachers, against a real PostgreSQL 18. */
const config = loadConfig({ LOG_LEVEL: 'silent', WEB_ORIGIN: 'http://localhost:4174' });
let database: Database;
let app: Awaited<ReturnType<typeof buildApp>>;
let admin: string;
let schoolId: string;

const cookieOf = (response: { headers: Record<string, unknown> }) =>
  String(response.headers['set-cookie']).split(';')[0]!;
const as = (cookie: string) => ({ headers: { cookie } });

const signUp = (email: string, extra: Record<string, string>) =>
  app.inject({
    method: 'POST',
    url: '/v1/auth/sign-up',
    payload: { email, password: 'a long pass phrase', displayName: email.split('@')[0], ...extra },
  });

const invite = async (cookie = admin) => {
  const made = await app.inject({
    method: 'POST',
    url: `/v1/schools/${schoolId}/invites`,
    ...as(cookie),
  });
  return made;
};

beforeAll(async () => {
  database = await freshDatabase('banglalab_test_schools');
  app = await buildApp({ config, database, fetch: globalThis.fetch });
  admin = cookieOf(await signUp('admin@example.test', { schoolName: 'পরীক্ষা বিদ্যালয়' }));
  const me = await app.inject({ method: 'GET', url: '/v1/me', ...as(admin) });
  schoolId = me.json().schools[0].schoolId;
});
afterAll(async () => {
  await app?.close();
  await database?.pool.end();
});

describe('teacher invitations', () => {
  it('sign-up needs a school name or an invitation, not both and not neither', async () => {
    expect((await signUp('none@example.test', {})).statusCode).toBe(400);
    const both = await signUp('both@example.test', { schoolName: 'x', inviteCode: 'ABCD-EFGH' });
    expect(both.statusCode).toBe(400);
  });

  it('an admin makes a code, shown once; a new teacher signs up with it and joins the school', async () => {
    const made = await invite();
    expect(made.statusCode).toBe(201);
    const { id, code } = made.json();
    expect(code).toMatch(/^[2-9A-HJKMNP-Z]{4}(-[2-9A-HJKMNP-Z]{4}){2}$/);
    const open = await app.inject({
      method: 'GET',
      url: `/v1/schools/${schoolId}/teachers`,
      ...as(admin),
    });
    expect(open.json().invites).toEqual([expect.objectContaining({ id })]);
    expect(JSON.stringify(open.json())).not.toContain(code);

    // Typed in lower case and without dashes, as people do.
    const joined = await signUp('new@example.test', {
      inviteCode: code.toLowerCase().replaceAll('-', ''),
    });
    expect(joined.statusCode).toBe(201);
    const me = await app.inject({ method: 'GET', url: '/v1/me', ...as(cookieOf(joined)) });
    expect(me.json().schools).toEqual([
      { schoolId, schoolName: 'পরীক্ষা বিদ্যালয়', role: 'teacher' },
    ]);
    const after = await app.inject({
      method: 'GET',
      url: `/v1/schools/${schoolId}/teachers`,
      ...as(admin),
    });
    expect(after.json().invites).toEqual([]);
    expect(
      after
        .json()
        .teachers.map((t: { displayName: string; admin: boolean }) => [t.displayName, t.admin]),
    ).toEqual([
      ['admin', true],
      ['new', false],
    ]);

    // A code works once; a second sign-up with it makes no account.
    const again = await signUp('again@example.test', { inviteCode: code });
    expect(again.statusCode).toBe(404);
    const retry = await signUp('again@example.test', { schoolName: 'অন্য বিদ্যালয়' });
    expect(retry.statusCode).toBe(201);
  });

  it('a teacher of another school joins with a code while signed in', async () => {
    const other = cookieOf(await signUp('other@example.test', { schoolName: 'দ্বিতীয় বিদ্যালয়' }));
    const { code } = (await invite()).json();
    const accepted = await app.inject({
      method: 'POST',
      url: '/v1/invites/accept',
      ...as(other),
      payload: { code },
    });
    expect(accepted.json()).toEqual({ schoolId });
    const me = await app.inject({ method: 'GET', url: '/v1/me', ...as(other) });
    expect(
      me
        .json()
        .schools.map((s: { role: string }) => s.role)
        .sort(),
    ).toEqual(['school_admin', 'teacher', 'teacher']);
    // Now a teacher here, they may make a class in this school.
    const made = await app.inject({
      method: 'POST',
      url: '/v1/classes',
      ...as(other),
      payload: { schoolId, name: 'অষ্টম খ', grade: 8, schoolConsent: true },
    });
    expect(made.statusCode).toBe(201);
  });

  it('a withdrawn code no longer works', async () => {
    const { id, code } = (await invite()).json();
    const gone = await app.inject({
      method: 'POST',
      url: `/v1/schools/${schoolId}/invites/${id}/withdraw`,
      payload: {},
      ...as(admin),
    });
    expect(gone.statusCode).toBe(200);
    expect((await signUp('late@example.test', { inviteCode: code })).statusCode).toBe(404);
    const twice = await app.inject({
      method: 'POST',
      url: `/v1/schools/${schoolId}/invites/${id}/withdraw`,
      payload: {},
      ...as(admin),
    });
    expect(twice.statusCode).toBe(404);
  });

  it('only the school’s admin may invite or see its teachers', async () => {
    const teacher = cookieOf(
      await app.inject({
        method: 'POST',
        url: '/v1/auth/sign-in',
        payload: { email: 'new@example.test', password: 'a long pass phrase' },
      }),
    );
    expect((await invite(teacher)).statusCode).toBe(403);
    const list = await app.inject({
      method: 'GET',
      url: `/v1/schools/${schoolId}/teachers`,
      ...as(teacher),
    });
    expect(list.statusCode).toBe(403);
    const signedOut = await app.inject({ method: 'POST', url: `/v1/schools/${schoolId}/invites` });
    expect(signedOut.statusCode).toBe(401);
  });

  it('a learner cannot use a teacher’s invitation', async () => {
    const made = await app.inject({
      method: 'POST',
      url: '/v1/classes',
      ...as(admin),
      payload: { schoolId, name: 'ষষ্ঠ ক', grade: 6, schoolConsent: true },
    });
    const joined = await app.inject({
      method: 'POST',
      url: '/v1/join',
      payload: { code: made.json().joinCode, pseudonym: 'তারা' },
    });
    expect(joined.statusCode).toBe(201);
    const learner = cookieOf(joined);
    const { code } = (await invite()).json();
    const refused = await app.inject({
      method: 'POST',
      url: '/v1/invites/accept',
      ...as(learner),
      payload: { code },
    });
    expect(refused.statusCode).toBe(403);
  });
});
