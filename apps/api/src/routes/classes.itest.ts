import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../app';
import { loadConfig } from '../config';
import type { Database } from '../db/client';
import { freshDatabase } from '../test-database';

/** Classes, join codes, learners and their keys, against a real PostgreSQL 18. */
const config = loadConfig({ LOG_LEVEL: 'silent', WEB_ORIGIN: 'http://localhost:4174' });
let database: Database;
let app: Awaited<ReturnType<typeof buildApp>>;
let teacher: string;
let schoolId: string;

const cookieOf = (response: { headers: Record<string, unknown> }) =>
  String(response.headers['set-cookie']).split(';')[0]!;
const as = (cookie: string) => ({ headers: { cookie } });

beforeAll(async () => {
  database = await freshDatabase('banglalab_test_classes');
  app = await buildApp({ config, database, fetch: globalThis.fetch });
  const signUp = await app.inject({
    method: 'POST',
    url: '/v1/auth/sign-up',
    payload: {
      email: 'teacher@example.test',
      password: 'a long pass phrase',
      displayName: 'শিক্ষক',
      schoolName: 'পরীক্ষা বিদ্যালয়',
    },
  });
  teacher = cookieOf(signUp);
  const me = await app.inject({ method: 'GET', url: '/v1/me', ...as(teacher) });
  schoolId = me.json().schools[0].schoolId;
});
afterAll(async () => {
  await app?.close();
  await database?.pool.end();
});

describe('classes and learners', () => {
  let classId: string;
  let joinCode: string;

  it('a teacher makes a class once the school’s permission is confirmed, and gets its code once', async () => {
    const refused = await app.inject({
      method: 'POST',
      url: '/v1/classes',
      ...as(teacher),
      payload: { schoolId, name: 'সপ্তম ক', grade: 7, schoolConsent: false },
    });
    expect(refused.statusCode).toBe(400);
    const made = await app.inject({
      method: 'POST',
      url: '/v1/classes',
      ...as(teacher),
      payload: { schoolId, name: 'সপ্তম ক', grade: 7, schoolConsent: true },
    });
    expect(made.statusCode).toBe(201);
    ({ id: classId, joinCode } = made.json());
    expect(joinCode).toMatch(/^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/);
    const list = await app.inject({ method: 'GET', url: '/v1/classes', ...as(teacher) });
    expect(list.json().classes).toEqual([
      expect.objectContaining({ id: classId, name: 'সপ্তম ক', grade: 7, learners: 0 }),
    ]);
    expect(JSON.stringify(list.json())).not.toContain(joinCode);
    // Grade 5 is not a class the lab is for.
    const young = await app.inject({
      method: 'POST',
      url: '/v1/classes',
      ...as(teacher),
      payload: { schoolId, name: 'x', grade: 5, schoolConsent: true },
    });
    expect(young.statusCode).toBe(400);
  });

  it('only a teacher of the school may make a class there', async () => {
    const stranger = await app.inject({
      method: 'POST',
      url: '/v1/classes',
      payload: { schoolId, name: 'x', grade: 7, schoolConsent: true },
    });
    expect(stranger.statusCode).toBe(401);
  });

  let learnerKey: string;
  let learner: string;
  it('a learner joins with the code, however typed, and a nickname; consent is recorded', async () => {
    const joined = await app.inject({
      method: 'POST',
      url: '/v1/join',
      payload: { code: joinCode.toLowerCase().replace('-', ' '), pseudonym: 'তারা৭' },
    });
    expect(joined.statusCode).toBe(201);
    expect(joined.json()).toMatchObject({ className: 'সপ্তম ক', pseudonym: 'তারা৭' });
    learnerKey = joined.json().key;
    expect(learnerKey).toMatch(/^(\w{4}-){2}\w{4}$/);
    learner = cookieOf(joined);
    const me = await app.inject({ method: 'GET', url: '/v1/me', ...as(learner) });
    expect(me.json()).toMatchObject({
      user: { kind: 'learner', displayName: 'তারা৭' },
      classes: [{ className: 'সপ্তম ক', pseudonym: 'তারা৭', grade: 7 }],
    });
    const { rows } = await database.pool.query(
      "select email, password_hash from users where kind = 'learner'",
    );
    expect(rows).toEqual([{ email: null, password_hash: null }]);
    const consent = await database.pool.query('select scope, granted_by from consent_records');
    expect(consent.rows).toEqual([{ scope: 'platform_use', granted_by: 'school' }]);
  });

  it('refuses a nickname already in the class, a wrong code, and a full name with odd characters', async () => {
    const same = await app.inject({
      method: 'POST',
      url: '/v1/join',
      payload: { code: joinCode, pseudonym: 'তারা৭' },
    });
    expect(same.statusCode).toBe(409);
    const wrong = await app.inject({
      method: 'POST',
      url: '/v1/join',
      payload: { code: 'AAAA-AAAA', pseudonym: 'নদী' },
    });
    expect(wrong.statusCode).toBe(404);
    const odd = await app.inject({
      method: 'POST',
      url: '/v1/join',
      payload: { code: joinCode, pseudonym: '<b>x</b>' },
    });
    expect(odd.statusCode).toBe(400);
  });

  it('a learner signs in elsewhere with their key; a learner cannot make classes', async () => {
    const signIn = await app.inject({
      method: 'POST',
      url: '/v1/auth/key',
      payload: { key: learnerKey },
    });
    expect(signIn.statusCode).toBe(200);
    const bad = await app.inject({
      method: 'POST',
      url: '/v1/auth/key',
      payload: { key: 'AAAA-BBBB-CCCC' },
    });
    expect(bad.statusCode).toBe(401);
    const sneaky = await app.inject({
      method: 'POST',
      url: '/v1/classes',
      ...as(learner),
      payload: { schoolId, name: 'x', grade: 7, schoolConsent: true },
    });
    expect(sneaky.statusCode).toBe(403);
  });

  it('the teacher sees nicknames, gives a new key, and removes a learner', async () => {
    const roster = await app.inject({
      method: 'GET',
      url: `/v1/classes/${classId}/learners`,
      ...as(teacher),
    });
    const [entry] = roster.json().learners;
    expect(entry).toMatchObject({ pseudonym: 'তারা৭' });
    // A learner cannot see the roster.
    const peek = await app.inject({
      method: 'GET',
      url: `/v1/classes/${classId}/learners`,
      ...as(learner),
    });
    expect(peek.statusCode).toBe(404);

    const renewed = await app.inject({
      method: 'POST',
      url: `/v1/classes/${classId}/learners/${entry.enrolment}/key`,
      ...as(teacher),
    });
    const newKey = renewed.json().key;
    expect(newKey).not.toBe(learnerKey);
    // The old key and the learner's sessions stop working; the new key works.
    expect((await app.inject({ method: 'GET', url: '/v1/me', ...as(learner) })).statusCode).toBe(
      401,
    );
    expect(
      (await app.inject({ method: 'POST', url: '/v1/auth/key', payload: { key: learnerKey } }))
        .statusCode,
    ).toBe(401);
    const again = await app.inject({
      method: 'POST',
      url: '/v1/auth/key',
      payload: { key: newKey },
    });
    expect(again.statusCode).toBe(200);

    const removed = await app.inject({
      method: 'POST',
      url: `/v1/classes/${classId}/learners/${entry.enrolment}/remove`,
      ...as(teacher),
    });
    expect(removed.statusCode).toBe(200);
    expect(
      (await app.inject({ method: 'GET', url: '/v1/me', ...as(cookieOf(again)) })).statusCode,
    ).toBe(401);
    expect(
      (await app.inject({ method: 'POST', url: '/v1/auth/key', payload: { key: newKey } }))
        .statusCode,
    ).toBe(401);
  });

  it('a new code replaces the old one, and archiving stops joining', async () => {
    const fresh = await app.inject({
      method: 'POST',
      url: `/v1/classes/${classId}/join-code`,
      ...as(teacher),
    });
    const newCode = fresh.json().joinCode;
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/v1/join',
          payload: { code: joinCode, pseudonym: 'নদী' },
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/v1/join',
          payload: { code: newCode, pseudonym: 'নদী' },
        })
      ).statusCode,
    ).toBe(201);
    await app.inject({ method: 'POST', url: `/v1/classes/${classId}/archive`, ...as(teacher) });
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/v1/join',
          payload: { code: newCode, pseudonym: 'আকাশ' },
        })
      ).statusCode,
    ).toBe(404);
    const list = await app.inject({ method: 'GET', url: '/v1/classes', ...as(teacher) });
    expect(list.json().classes).toEqual([]);
  });
});
