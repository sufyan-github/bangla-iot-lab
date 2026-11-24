import { Type, type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { AppDependencies } from '../app';
import { hashCode, makeCode } from '../auth/codes';
import { audit, startSession } from '../auth/session';
import { classEnrollments, classes, consentRecords, users } from '../db/schema';
import { PLATFORM_POLICY_VERSION } from './classes';

/**
 * A nickname, not a name: 2 to 24 letters (any script), digits, spaces, dots,
 * dashes or underscores.
 */
export const Pseudonym = Type.String({ pattern: '^[\\p{L}\\p{M}\\p{N} ._-]{2,24}$' });

/**
 * Learners. A learner joins a class with its code and a nickname, and is given
 * a sign-in key for other devices. No email, phone or real name is asked for.
 */
export function learnerRoutes(deps: AppDependencies): FastifyPluginAsyncTypebox {
  const { database, config } = deps;
  const secure = config.webOrigin.startsWith('https:');
  const strict = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } };

  return async (app) => {
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
        const key = makeCode(3);
        const joined = await database.db.transaction(async (tx) => {
          const taken = await tx
            .select({ id: classEnrollments.id })
            .from(classEnrollments)
            .where(
              and(
                eq(classEnrollments.classId, found.id),
                eq(classEnrollments.pseudonym, pseudonym),
              ),
            )
            .limit(1);
          if (taken.length > 0) return null;
          const [learner] = await tx
            .insert(users)
            .values({ kind: 'learner', displayName: pseudonym, signInKeyHash: hashCode(key) })
            .returning({ id: users.id });
          await tx
            .insert(classEnrollments)
            .values({ classId: found.id, learnerId: learner!.id, pseudonym });
          // The school's permission, which the teacher confirmed for the class.
          await tx.insert(consentRecords).values({
            learnerId: learner!.id,
            schoolId: found.schoolId,
            scope: 'platform_use',
            grantedBy: 'school',
            policyVersion: PLATFORM_POLICY_VERSION,
            recordedBy: found.teacherId,
          });
          return learner!.id;
        });
        if (!joined) return reply.code(409).send({ error: 'pseudonym-taken' });
        await audit(database, {
          actorId: joined,
          schoolId: found.schoolId,
          action: 'class.join',
          targetType: 'class',
          targetId: found.id,
        });
        await startSession(database, reply, joined, secure);
        return reply.code(201).send({ className: found.name, pseudonym, key });
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
  };
}
