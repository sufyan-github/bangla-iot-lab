import { Type, type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { and, eq, gt, isNull, max, ne, sql } from 'drizzle-orm';
import type { AppDependencies } from '../app';
import { requireUser } from '../auth/access';
import { hashCode, makeCode } from '../auth/codes';
import { audit, signedIn, startSession } from '../auth/session';
import {
  classEnrollments,
  classes,
  consentRecords,
  progressEvents,
  sessions,
  users,
} from '../db/schema';
import { PLATFORM_POLICY_VERSION, Pseudonym } from './classes';

export { Pseudonym };

/** The policy a guardian agrees to for a learner who signs up on their own. */
export const SELF_LEARNER_POLICY_VERSION = 'self-learner-2026-11';

/**
 * Learners. A learner either joins a class with its code and a nickname, or
 * signs up on their own with a nickname and a guardian's permission; either way
 * they are given a sign-in key for other devices. No email, phone or real name
 * is asked for.
 */
export function learnerRoutes(deps: AppDependencies): FastifyPluginAsyncTypebox {
  const { database, config } = deps;
  const secure = config.webOrigin.startsWith('https:');
  const strict = {
    config: { rateLimit: { max: deps.config.signInsPerMinute, timeWindow: '1 minute' } },
  };

  return async (app) => {
    /**
     * Joins a class. Signed out, this makes a new learner and gives their key;
     * a learner already signed in joins on their own account and keeps their key.
     */
    app.post(
      '/v1/join',
      {
        ...strict,
        schema: {
          body: Type.Object(
            { code: Type.String({ minLength: 4, maxLength: 20 }), pseudonym: Pseudonym },
            { additionalProperties: false },
          ),
        },
      },
      async (request, reply) => {
        const pseudonym = request.body.pseudonym.trim();
        const [found] = await database.db
          .select()
          .from(classes)
          .where(
            and(
              eq(classes.joinCodeHash, hashCode(request.body.code)),
              gt(classes.joinCodeExpiresAt, new Date()),
              isNull(classes.archivedAt),
            ),
          )
          .limit(1);
        if (!found) return reply.code(404).send({ error: 'no-such-code' });
        const who = await signedIn(database, request);
        const existing = who?.kind === 'learner' ? who.userId : null;
        const key = existing ? null : makeCode(3);
        const joined = await database.db.transaction(async (tx) => {
          const there = await tx
            .select({
              learnerId: classEnrollments.learnerId,
              revokedAt: classEnrollments.revokedAt,
            })
            .from(classEnrollments)
            .where(eq(classEnrollments.classId, found.id));
          if (existing && there.some((row) => row.learnerId === existing && !row.revokedAt)) {
            return 'already-in-class' as const;
          }
          const taken = await tx
            .select({ id: classEnrollments.id })
            .from(classEnrollments)
            .where(
              and(
                eq(classEnrollments.classId, found.id),
                eq(classEnrollments.pseudonym, pseudonym),
                existing ? ne(classEnrollments.learnerId, existing) : sql`true`,
              ),
            )
            .limit(1);
          if (taken.length > 0) return 'pseudonym-taken' as const;
          let learnerId = existing;
          if (!learnerId) {
            const [learner] = await tx
              .insert(users)
              .values({ kind: 'learner', displayName: pseudonym, signInKeyHash: hashCode(key!) })
              .returning({ id: users.id });
            learnerId = learner!.id;
          }
          // A learner who left the class before comes back on the same enrolment.
          await tx
            .insert(classEnrollments)
            .values({ classId: found.id, learnerId, pseudonym })
            .onConflictDoUpdate({
              target: [classEnrollments.classId, classEnrollments.learnerId],
              set: { pseudonym, revokedAt: null },
            });
          // The school's permission, which the teacher confirmed for the class.
          await tx.insert(consentRecords).values({
            learnerId,
            schoolId: found.schoolId,
            scope: 'platform_use',
            grantedBy: 'school',
            policyVersion: PLATFORM_POLICY_VERSION,
            recordedBy: found.teacherId,
          });
          return learnerId;
        });
        if (joined === 'already-in-class' || joined === 'pseudonym-taken') {
          return reply.code(409).send({ error: joined });
        }
        await audit(database, {
          actorId: joined,
          schoolId: found.schoolId,
          action: 'class.join',
          targetType: 'class',
          targetId: found.id,
        });
        if (!existing) await startSession(database, reply, joined, secure);
        return reply.code(201).send({ className: found.name, pseudonym, ...(key ? { key } : {}) });
      },
    );

    /**
     * A learner signs up on their own, to learn and build at their own pace: a
     * nickname, and a guardian's permission, which is recorded. Nothing else.
     */
    app.post(
      '/v1/auth/learner-sign-up',
      {
        ...strict,
        schema: {
          body: Type.Object(
            { pseudonym: Pseudonym, guardianConsent: Type.Literal(true) },
            { additionalProperties: false },
          ),
        },
      },
      async (request, reply) => {
        const pseudonym = request.body.pseudonym.trim();
        const key = makeCode(3);
        const learnerId = await database.db.transaction(async (tx) => {
          const [learner] = await tx
            .insert(users)
            .values({ kind: 'learner', displayName: pseudonym, signInKeyHash: hashCode(key) })
            .returning({ id: users.id });
          await tx.insert(consentRecords).values({
            learnerId: learner!.id,
            schoolId: null,
            scope: 'platform_use',
            grantedBy: 'guardian',
            policyVersion: SELF_LEARNER_POLICY_VERSION,
            // Confirmed on the sign-up form, so the learner's own account records it.
            recordedBy: learner!.id,
          });
          return learner!.id;
        });
        await audit(database, { actorId: learnerId, action: 'auth.learner-sign-up' });
        await startSession(database, reply, learnerId, secure);
        return reply.code(201).send({ pseudonym, key });
      },
    );

    /** A learner signs in on another device with their key. */
    app.post(
      '/v1/auth/key',
      {
        ...strict,
        schema: {
          body: Type.Object(
            { key: Type.String({ minLength: 8, maxLength: 30 }) },
            { additionalProperties: false },
          ),
        },
      },
      async (request, reply) => {
        const [learner] = await database.db
          .select({ id: users.id })
          .from(users)
          .where(
            and(
              eq(users.signInKeyHash, hashCode(request.body.key)),
              eq(users.kind, 'learner'),
              isNull(users.deactivatedAt),
            ),
          )
          .limit(1);
        if (!learner) return reply.code(401).send({ error: 'wrong-key' });
        await audit(database, { actorId: learner.id, action: 'auth.key-sign-in' });
        await startSession(database, reply, learner.id, secure);
        return { ok: true };
      },
    );

    /**
     * A new key for the learner signed in, when someone may have seen theirs:
     * the old key and every other device's session stop working.
     */
    app.post('/v1/me/key', { ...strict }, async (request, reply) => {
      const who = await requireUser(database, request, reply);
      if (!who) return;
      if (who.kind !== 'learner') return reply.code(403).send({ error: 'learners-only' });
      const key = makeCode(3);
      await database.db
        .update(users)
        .set({ signInKeyHash: hashCode(key) })
        .where(eq(users.id, who.userId));
      await database.db
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(sessions.userId, who.userId),
            ne(sessions.id, who.sessionId),
            isNull(sessions.revokedAt),
          ),
        );
      await audit(database, { actorId: who.userId, action: 'auth.new-key' });
      return { key };
    });

    /** How far the learner has got in each lesson they have started. */
    app.get('/v1/me/progress', async (request, reply) => {
      const who = await requireUser(database, request, reply);
      if (!who) return;
      const rows = await database.db
        .select({
          lessonId: progressEvents.lessonId,
          steps:
            sql<number>`count(distinct ${progressEvents.step}) filter (where ${progressEvents.outcome} = 'step-done')`.mapWith(
              Number,
            ),
          done: sql<boolean>`bool_or(${progressEvents.outcome} = 'lesson-done')`,
          lastAt: max(progressEvents.occurredAt),
        })
        .from(progressEvents)
        .where(eq(progressEvents.learnerId, who.userId))
        .groupBy(progressEvents.lessonId)
        .orderBy(sql`max(${progressEvents.occurredAt}) desc`);
      return { lessons: rows };
    });
  };
}
