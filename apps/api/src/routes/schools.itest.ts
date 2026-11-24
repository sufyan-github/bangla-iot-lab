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

describe('running a school', () => {
  const signIn = async (email: string) =>
    cookieOf(
      await app.inject({
        method: 'POST',
        url: '/v1/auth/sign-in',
        payload: { email, password: 'a long pass phrase' },
      }),
    );
  const teachers = async (cookie = admin) =>
    (
      await app.inject({ method: 'GET', url: `/v1/schools/${schoolId}/teachers`, ...as(cookie) })
    ).json().teachers as { userId: string; displayName: string; admin: boolean }[];
  const post = (url: string, cookie: string, payload: object = {}) =>
    app.inject({ method: 'POST', url, ...as(cookie), payload });

  it('an admin removes a teacher, whose classes pass to the admin', async () => {
    const { code } = (await invite()).json();
    const leaving = cookieOf(await signUp('leaving@example.test', { inviteCode: code }));
    const made = await post('/v1/classes', leaving, {
      schoolId,
      name: 'নবম গ',
      grade: 9,
      schoolConsent: true,
    });
    const classId = made.json().id;
    const id = (await teachers()).find((t) => t.displayName === 'leaving')!.userId;

    // Not by another teacher, and never the admin.
    expect((await post(`/v1/schools/${schoolId}/teachers/${id}/remove`, leaving)).statusCode).toBe(
      403,
    );
    const me = (await teachers()).find((t) => t.admin)!.userId;
    expect((await post(`/v1/schools/${schoolId}/teachers/${me}/remove`, admin)).statusCode).toBe(
      409,
    );

    const removed = await post(`/v1/schools/${schoolId}/teachers/${id}/remove`, admin);
    expect(removed.json()).toEqual({ classesMoved: 1 });
    expect((await teachers()).map((t) => t.displayName)).not.toContain('leaving');
    // They no longer have the class; the admin does.
    const theirs = await app.inject({ method: 'GET', url: '/v1/classes', ...as(leaving) });
    expect(theirs.json().classes).toEqual([]);
    const mine = await app.inject({ method: 'GET', url: '/v1/classes', ...as(admin) });
    expect(mine.json().classes.map((c: { id: string }) => c.id)).toContain(classId);
    const learners = await app.inject({
      method: 'GET',
      url: `/v1/classes/${classId}/learners`,
      ...as(leaving),
    });
    expect(learners.statusCode).toBe(404);
  });

  it('an admin hands the role on, and stays a teacher', async () => {
    const next = await signIn('new@example.test');
    const nextId = (await teachers()).find((t) => t.displayName === 'new')!.userId;
    expect(
      (await post(`/v1/schools/${schoolId}/teachers/${nextId}/make-admin`, next)).statusCode,
    ).toBe(403);
    const handed = await post(`/v1/schools/${schoolId}/teachers/${nextId}/make-admin`, admin);
    expect(handed.statusCode).toBe(200);
    const list = await teachers(next);
    expect(list.filter((t) => t.admin).map((t) => t.displayName)).toEqual(['new']);
    expect(list.map((t) => t.displayName)).toContain('admin');
    // The old admin no longer runs the school.
    expect((await invite(admin)).statusCode).toBe(403);
    expect((await invite(next)).statusCode).toBe(201);
    // Hand it back, for the tests that follow.
    const adminId = list.find((t) => t.displayName === 'admin')!.userId;
    await post(`/v1/schools/${schoolId}/teachers/${adminId}/make-admin`, next);
    expect((await invite(admin)).statusCode).toBe(201);
  });

  it('a teacher moves a learner to another of their classes; the learner keeps their key', async () => {
    const make = async (name: string) =>
      (await post('/v1/classes', admin, { schoolId, name, grade: 7, schoolConsent: true })).json();
    const from = await make('সপ্তম চ');
    const to = await make('সপ্তম ছ');
    const joined = await app.inject({
      method: 'POST',
      url: '/v1/join',
      payload: { code: from.joinCode, pseudonym: 'নদী' },
    });
    const { key } = joined.json();
    const roster = await app.inject({
      method: 'GET',
      url: `/v1/classes/${from.id}/learners`,
      ...as(admin),
    });
    const enrolment = roster.json().learners[0].enrolment;
    const moved = await post(`/v1/classes/${from.id}/learners/${enrolment}/move`, admin, {
      to: to.id,
    });
    expect(moved.statusCode).toBe(200);
    const names = async (classId: string) =>
      (await app.inject({ method: 'GET', url: `/v1/classes/${classId}/learners`, ...as(admin) }))
        .json()
        .learners.map((l: { pseudonym: string }) => l.pseudonym);
    expect(await names(from.id)).toEqual([]);
    expect(await names(to.id)).toEqual(['নদী']);
    const back = await app.inject({ method: 'POST', url: '/v1/auth/key', payload: { key } });
    expect(back.statusCode).toBe(200);
    const me = await app.inject({ method: 'GET', url: '/v1/me', ...as(cookieOf(back)) });
    expect(me.json().classes.map((c: { className: string }) => c.className)).toEqual(['সপ্তম ছ']);

    // Not into a class of another school, nor into the class it is in.
    const elsewhere = cookieOf(await signUp('elsewhere@example.test', { schoolName: 'অন্য' }));
    const elseSchool = (await app.inject({ method: 'GET', url: '/v1/me', ...as(elsewhere) })).json()
      .schools[0].schoolId;
    const theirClass = (
      await post('/v1/classes', elsewhere, {
        schoolId: elseSchool,
        name: 'x',
        grade: 7,
        schoolConsent: true,
      })
    ).json();
    const roster2 = await app.inject({
      method: 'GET',
      url: `/v1/classes/${to.id}/learners`,
      ...as(admin),
    });
    const enrolment2 = roster2.json().learners[0].enrolment;
    expect(
      (await post(`/v1/classes/${to.id}/learners/${enrolment2}/move`, admin, { to: theirClass.id }))
        .statusCode,
    ).toBe(404);
    expect(
      (await post(`/v1/classes/${to.id}/learners/${enrolment2}/move`, admin, { to: to.id }))
        .statusCode,
    ).toBe(404);
  });
});
