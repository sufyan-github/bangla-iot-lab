import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../app';
import { loadConfig } from '../config';
import type { Database } from '../db/client';
import { freshDatabase } from '../test-database';

/** Teacher accounts and sessions, against a real PostgreSQL 18. */
const config = loadConfig({ LOG_LEVEL: 'silent', WEB_ORIGIN: 'http://localhost:4174' });
let database: Database;
let app: Awaited<ReturnType<typeof buildApp>>;

beforeAll(async () => {
  database = await freshDatabase('banglalab_test_accounts');
  app = await buildApp({ config, database, fetch: globalThis.fetch });
});
afterAll(async () => {
  await app?.close();
  await database?.pool.end();
});

const teacher = {
  email: 'Rina@Example.test',
  password: 'a long pass phrase',
  displayName: 'রিনা আপা',
  schoolName: 'পরীক্ষা উচ্চ বিদ্যালয়',
};
/** The session cookie a response set, as a request header. */
const cookieOf = (response: { headers: Record<string, unknown> }) =>
  String(response.headers['set-cookie']).split(';')[0]!;

describe('teacher accounts', () => {
  it('signs up, names the school, and is signed in at once', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/sign-up',
      payload: teacher,
    });
    expect(response.statusCode).toBe(201);
    const cookie = String(response.headers['set-cookie']);
    expect(cookie).toMatch(/^bl_session=[\w-]{43}; Path=\/; HttpOnly; SameSite=Lax/);
    const me = await app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: { cookie: cookieOf(response) },
    });
    expect(me.json()).toMatchObject({
      user: { kind: 'adult', displayName: 'রিনা আপা' },
      schools: expect.arrayContaining([
        expect.objectContaining({ schoolName: 'পরীক্ষা উচ্চ বিদ্যালয়', role: 'teacher' }),
        expect.objectContaining({ role: 'school_admin' }),
      ]),
    });
    // The token is never stored: only its hash.
    const { rows } = await database.pool.query('select token_hash from sessions');
    expect(rows[0].token_hash).not.toBe(cookieOf(response).split('=')[1]);
  });

  it('refuses the same email twice, whatever its case, and a short password', async () => {
    const again = await app.inject({
      method: 'POST',
      url: '/v1/auth/sign-up',
      payload: { ...teacher, email: 'rina@example.TEST' },
    });
    expect(again.statusCode).toBe(409);
    const short = await app.inject({
      method: 'POST',
      url: '/v1/auth/sign-up',
      payload: { ...teacher, email: 'other@example.test', password: 'short' },
    });
    expect(short.statusCode).toBe(400);
  });

  it('signs in with the right password only, the same answer for a wrong email', async () => {
    const wrong = await app.inject({
      method: 'POST',
      url: '/v1/auth/sign-in',
      payload: { email: teacher.email, password: 'not the password' },
    });
    const nobody = await app.inject({
      method: 'POST',
      url: '/v1/auth/sign-in',
      payload: { email: 'nobody@example.test', password: 'not the password' },
    });
    expect(wrong.statusCode).toBe(401);
    expect(nobody.json()).toEqual(wrong.json());
    const right = await app.inject({
      method: 'POST',
      url: '/v1/auth/sign-in',
      payload: { email: 'RINA@example.test', password: teacher.password },
    });
    expect(right.statusCode).toBe(200);

    // Signing out ends that session for good.
    const cookie = cookieOf(right);
    const out = await app.inject({ method: 'POST', url: '/v1/auth/sign-out', headers: { cookie } });
    expect(String(out.headers['set-cookie'])).toContain('Max-Age=0');
    const me = await app.inject({ method: 'GET', url: '/v1/me', headers: { cookie } });
    expect(me.statusCode).toBe(401);
  });

  it('refuses a change sent from another site', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/sign-in',
      headers: { origin: 'https://elsewhere.example' },
      payload: { email: teacher.email, password: teacher.password },
    });
    expect(response.statusCode).toBe(403);
  });

  it('keeps an audit trail of identifiers, not passwords', async () => {
    const { rows } = await database.pool.query(
      'select action, metadata from audit_logs order by id',
    );
    expect(rows.map((row) => row.action)).toEqual([
      'auth.sign-up',
      'auth.sign-in',
      'auth.sign-out',
    ]);
    expect(JSON.stringify(rows)).not.toContain(teacher.password);
  });
});
