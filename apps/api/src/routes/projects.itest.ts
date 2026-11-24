import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../app';
import { loadConfig } from '../config';
import type { Database } from '../db/client';
import { LocalMailbox } from '../mail';
import { signUpTeacher } from '../test-accounts';
import { freshDatabase } from '../test-database';

/** Projects in the cloud, against a real PostgreSQL 18. */
const config = loadConfig({
  LOG_LEVEL: 'silent',
  WEB_ORIGIN: 'http://localhost:4174',
  SCHOOL_APPROVAL: 'automatic',
});
const mailbox = new LocalMailbox();
let database: Database;
let app: Awaited<ReturnType<typeof buildApp>>;

async function signUp(email: string) {
  return {
    cookie: await signUpTeacher(app, mailbox, {
      email,
      password: 'a long pass phrase',
      displayName: 'x',
      schoolName: 'y',
    }),
  };
}
const doc = (name: string, resistance: number) => ({
  name,
  circuit: { schemaVersion: 24, components: [{ id: 'R1', props: { resistance } }], wires: [] },
  programs: {},
});

beforeAll(async () => {
  database = await freshDatabase('banglalab_test_projects');
  app = await buildApp({ config, database, fetch: globalThis.fetch, mailer: mailbox });
});
afterAll(async () => {
  await app?.close();
  await database?.pool.end();
});

describe('projects in the cloud', () => {
  it('saves a project, then new versions of it, and gives back the newest', async () => {
    const { cookie } = await signUp('a@example.test');
    const headers = { cookie };
    const first = await app.inject({
      method: 'POST',
      url: '/v1/projects',
      headers,
      payload: { document: doc('LED', 220) },
    });
    expect(first.statusCode).toBe(201);
    const { id } = first.json();
    expect(first.json().version).toBe(1);
    const second = await app.inject({
      method: 'POST',
      url: '/v1/projects',
      headers,
      payload: { id, document: doc('LED ২', 470) },
    });
    expect(second.json()).toEqual({ id, version: 2 });

    const list = await app.inject({ method: 'GET', url: '/v1/projects', headers });
    expect(list.json().projects).toEqual([
      expect.objectContaining({ id, title: 'LED ২', version: 2 }),
    ]);
    const opened = await app.inject({ method: 'GET', url: `/v1/projects/${id}`, headers });
    expect(opened.json()).toMatchObject({ version: 2, document: doc('LED ২', 470) });
    // The first version is still kept: saving never rewrites one.
    const { rows } = await database.pool.query(
      'select version from project_versions order by version',
    );
    expect(rows.map((row) => row.version)).toEqual([1, 2]);

    await app.inject({ method: 'POST', url: `/v1/projects/${id}/remove`, headers });
    expect(
      (await app.inject({ method: 'GET', url: '/v1/projects', headers })).json().projects,
    ).toEqual([]);
  });

  it('keeps each person’s projects to themselves', async () => {
    const owner = await signUp('b@example.test');
    const other = await signUp('c@example.test');
    const made = await app.inject({
      method: 'POST',
      url: '/v1/projects',
      headers: { cookie: owner.cookie },
      payload: { document: doc('mine', 1) },
    });
    const { id } = made.json();
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/v1/projects/${id}`,
          headers: { cookie: other.cookie },
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/v1/projects',
          headers: { cookie: other.cookie },
          payload: { id, document: doc('theirs', 2) },
        })
      ).statusCode,
    ).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/v1/projects' })).statusCode).toBe(401);
  });

  it('refuses something that is not a project', async () => {
    const { cookie } = await signUp('d@example.test');
    const bad = await app.inject({
      method: 'POST',
      url: '/v1/projects',
      headers: { cookie },
      payload: { document: { name: 'x' } },
    });
    expect(bad.statusCode).toBe(400);
  });
});
