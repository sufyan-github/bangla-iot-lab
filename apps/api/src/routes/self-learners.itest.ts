import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../app';
import { loadConfig } from '../config';
import type { Database } from '../db/client';
import { consentRecords, users } from '../db/schema';
import { freshDatabase } from '../test-database';

/** Learners on their own: no school, no class, a guardian's permission. Against PostgreSQL 18. */
const config = loadConfig({ LOG_LEVEL: 'silent', WEB_ORIGIN: 'http://localhost:4174' });
let database: Database;
let app: Awaited<ReturnType<typeof buildApp>>;

const cookieOf = (response: { headers: Record<string, unknown> }) =>
  String(response.headers['set-cookie']).split(';')[0]!;
const as = (cookie: string) => ({ headers: { cookie } });
const signUp = (payload: object) =>
  app.inject({ method: 'POST', url: '/v1/auth/learner-sign-up', payload });

beforeAll(async () => {
  database = await freshDatabase('banglalab_test_self_learners');
  app = await buildApp({ config, database, fetch: globalThis.fetch });
});
afterAll(async () => {
  await app?.close();
  await database?.pool.end();
});

describe('learners on their own', () => {
  it('signs up with a nickname and a guardian’s permission, and nothing else', async () => {
    expect((await signUp({ pseudonym: 'মেঘ' })).statusCode).toBe(400);
    expect((await signUp({ pseudonym: 'মেঘ', guardianConsent: false })).statusCode).toBe(400);
    const made = await signUp({ pseudonym: 'মেঘ', guardianConsent: true });
    expect(made.statusCode).toBe(201);
    expect(made.json().key).toMatch(/^[2-9A-HJKMNP-Z]{4}(-[2-9A-HJKMNP-Z]{4}){2}$/);
    const me = await app.inject({ method: 'GET', url: '/v1/me', ...as(cookieOf(made)) });
    expect(me.json()).toMatchObject({
      user: { kind: 'learner', displayName: 'মেঘ', ownAccount: true },
      schools: [],
      classes: [],
    });
    // The guardian's permission is on record, with no school.
    const [consent] = await database.db
      .select()
      .from(consentRecords)
      .where(eq(consentRecords.learnerId, me.json().user.id));
    expect(consent).toMatchObject({ grantedBy: 'guardian', schoolId: null, scope: 'platform_use' });
    // A field the form does not have, such as an email, is dropped, never kept.
    const extra = await signUp({ pseudonym: 'ঝড়', guardianConsent: true, email: 'a@b.test' });
    const [row] = await database.db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.displayName, 'ঝড়'));
    expect(extra.statusCode).toBe(201);
    expect(row!.email).toBeNull();
  });

  it('keeps projects and progress like any learner, and sees its own progress', async () => {
    const made = await signUp({ pseudonym: 'তারা', guardianConsent: true });
    const cookie = cookieOf(made);
    const at = new Date().toISOString();
    const sent = await app.inject({
      method: 'POST',
      url: '/v1/progress',
      ...as(cookie),
      payload: {
        events: [
          { id: randomUUID(), lessonId: 'led-resistor', step: 0, outcome: 'step-done', at },
          { id: randomUUID(), lessonId: 'led-resistor', step: 1, outcome: 'step-done', at },
          { id: randomUUID(), lessonId: 'led-resistor', step: 1, outcome: 'lesson-done', at },
          { id: randomUUID(), lessonId: 'push-button', step: 0, outcome: 'step-done', at },
        ],
      },
    });
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

  it('a new key stops the old one and other devices, but not this one', async () => {
    const made = await signUp({ pseudonym: 'নীল', guardianConsent: true });
    const here = cookieOf(made);
    const other = cookieOf(
      await app.inject({ method: 'POST', url: '/v1/auth/key', payload: { key: made.json().key } }),
    );
    const fresh = await app.inject({ method: 'POST', url: '/v1/me/key', ...as(here), payload: {} });
    expect(fresh.json().key).not.toBe(made.json().key);
    expect((await app.inject({ method: 'GET', url: '/v1/me', ...as(here) })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/v1/me', ...as(other) })).statusCode).toBe(401);
    const old = await app.inject({
      method: 'POST',
      url: '/v1/auth/key',
      payload: { key: made.json().key },
    });
    expect(old.statusCode).toBe(401);
    const now = await app.inject({
      method: 'POST',
      url: '/v1/auth/key',
      payload: { key: fresh.json().key },
    });
    expect(now.statusCode).toBe(200);
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

    const learner = await signUp({ pseudonym: 'রোদ', guardianConsent: true });
    const cookie = cookieOf(learner);
    const joined = await app.inject({
      method: 'POST',
      url: '/v1/join',
      ...as(cookie),
      payload: { code: joinCode, pseudonym: 'রোদ' },
    });
    expect(joined.statusCode).toBe(201);
    // No new key: the learner keeps theirs, and the same account.
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
    // Out of the class, but still signed in and able to sign in with the key.
    const after = await app.inject({ method: 'GET', url: '/v1/me', ...as(cookie) });
    expect(after.json().classes).toEqual([]);
    const back = await app.inject({
      method: 'POST',
      url: '/v1/auth/key',
      payload: { key: learner.json().key },
    });
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
