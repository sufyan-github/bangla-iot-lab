import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../app';
import { loadConfig } from '../config';
import type { Database } from '../db/client';
import { LocalMailbox } from '../mail';
import { signUpTeacher } from '../test-accounts';
import { freshDatabase } from '../test-database';

/** Lessons set for a class, and learners' progress, against a real PostgreSQL 18. */
const config = loadConfig({
  LOG_LEVEL: 'silent',
  WEB_ORIGIN: 'http://localhost:4174',
  SCHOOL_APPROVAL: 'automatic',
});
const mailbox = new LocalMailbox();
let database: Database;
let app: Awaited<ReturnType<typeof buildApp>>;
const cookieOf = (response: { headers: Record<string, unknown> }) =>
  String(response.headers['set-cookie']).split(';')[0]!;
let teacher: string;
let classId: string;
const learners: string[] = [];

beforeAll(async () => {
  database = await freshDatabase('banglalab_test_lessons');
  app = await buildApp({ config, database, fetch: globalThis.fetch, mailer: mailbox });
  teacher = await signUpTeacher(app, mailbox, {
    email: 't@example.test',
    password: 'a long pass phrase',
    displayName: 'x',
    schoolName: 'y',
  });
  const me = await app.inject({ method: 'GET', url: '/v1/me', headers: { cookie: teacher } });
  const made = await app.inject({
    method: 'POST',
    url: '/v1/classes',
    headers: { cookie: teacher },
    payload: {
      schoolId: me.json().schools[0].schoolId,
      name: '৮ খ',
      grade: 8,
      schoolConsent: true,
    },
  });
  classId = made.json().id;
  for (const pseudonym of ['এক', 'দুই', 'তিন']) {
    const joined = await app.inject({
      method: 'POST',
      url: '/v1/join',
      payload: { code: made.json().joinCode, pseudonym },
    });
    learners.push(cookieOf(joined));
  }
});
afterAll(async () => {
  await app?.close();
  await database?.pool.end();
});

const event = (lessonId: string, outcome: 'step-done' | 'lesson-done', step = 1) => ({
  id: randomUUID(),
  lessonId,
  step,
  outcome,
  at: new Date().toISOString(),
});

describe('lessons for a class', () => {
  it('a teacher sets lessons, once each; the class’s learners see them', async () => {
    const set = await app.inject({
      method: 'POST',
      url: `/v1/classes/${classId}/assignments`,
      headers: { cookie: teacher },
      payload: { lessonId: 'push-button', dueAt: '2026-12-01T00:00:00.000Z' },
    });
    expect(set.statusCode).toBe(201);
    await app.inject({
      method: 'POST',
      url: `/v1/classes/${classId}/assignments`,
      headers: { cookie: teacher },
      payload: { lessonId: 'logic-gates' },
    });
    const twice = await app.inject({
      method: 'POST',
      url: `/v1/classes/${classId}/assignments`,
      headers: { cookie: teacher },
      payload: { lessonId: 'push-button' },
    });
    expect(twice.statusCode).toBe(409);
    const seen = await app.inject({
      method: 'GET',
      url: '/v1/assignments',
      headers: { cookie: learners[0]! },
    });
    expect(seen.json().assignments.map((a: { lessonId: string }) => a.lessonId)).toEqual([
      'push-button',
      'logic-gates',
    ]);
    // A learner cannot set lessons.
    const sneaky = await app.inject({
      method: 'POST',
      url: `/v1/classes/${classId}/assignments`,
      headers: { cookie: learners[0]! },
      payload: { lessonId: 'servo' },
    });
    expect(sneaky.statusCode).toBe(404);
  });

  it('counts who started and finished each lesson, counting an event sent twice once', async () => {
    const first = event('push-button', 'step-done');
    const done = event('push-button', 'lesson-done', 5);
    const sent = await app.inject({
      method: 'POST',
      url: '/v1/progress',
      headers: { cookie: learners[0]! },
      payload: { events: [first, done] },
    });
    expect(sent.json()).toEqual({ kept: 2 });
    // Offline, then sent again: nothing new is kept.
    const again = await app.inject({
      method: 'POST',
      url: '/v1/progress',
      headers: { cookie: learners[0]! },
      payload: { events: [first, done] },
    });
    expect(again.json()).toEqual({ kept: 0 });
    await app.inject({
      method: 'POST',
      url: '/v1/progress',
      headers: { cookie: learners[1]! },
      payload: { events: [event('push-button', 'step-done')] },
    });

    const summary = await app.inject({
      method: 'GET',
      url: `/v1/classes/${classId}/summary`,
      headers: { cookie: teacher },
    });
    expect(summary.json()).toMatchObject({
      learners: 3,
      lessons: [
        { lessonId: 'push-button', started: 2, finished: 1 },
        { lessonId: 'logic-gates', started: 0, finished: 0 },
      ],
    });
    // Counts only: no nickname appears in the summary.
    expect(JSON.stringify(summary.json())).not.toContain('এক');
  });

  it('keeps no progress for a teacher trying a lesson, and refuses a malformed event', async () => {
    const tried = await app.inject({
      method: 'POST',
      url: '/v1/progress',
      headers: { cookie: teacher },
      payload: { events: [event('servo', 'step-done')] },
    });
    expect(tried.json()).toEqual({ kept: 0 });
    const bad = await app.inject({
      method: 'POST',
      url: '/v1/progress',
      headers: { cookie: learners[2]! },
      payload: { events: [{ ...event('servo', 'step-done'), lessonId: 'Not A Lesson!' }] },
    });
    expect(bad.statusCode).toBe(400);
  });

  it('a removed lesson leaves the class’s list', async () => {
    const summary = await app.inject({
      method: 'GET',
      url: `/v1/classes/${classId}/summary`,
      headers: { cookie: teacher },
    });
    const { id } = summary.json().lessons[1];
    await app.inject({
      method: 'POST',
      url: `/v1/classes/${classId}/assignments/${id}/remove`,
      headers: { cookie: teacher },
    });
    const seen = await app.inject({
      method: 'GET',
      url: '/v1/assignments',
      headers: { cookie: learners[0]! },
    });
    expect(seen.json().assignments.map((a: { lessonId: string }) => a.lessonId)).toEqual([
      'push-button',
    ]);
  });
});
