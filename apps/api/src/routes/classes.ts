import { Type, type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { and, count, eq, isNull, or } from 'drizzle-orm';
import type { AppDependencies } from '../app';
import { onOwnAccount, ownClass, requireUser, teachesIn } from '../auth/access';
import { hashCode, makeCode } from '../auth/codes';
import { sessions, users } from '../db/schema';
import { audit } from '../auth/session';
import { classEnrollments, classes } from '../db/schema';

/**
 * A nickname, not a name: 2 to 24 letters (any script), digits, spaces, dots,
 * dashes or underscores.
 */
export const Pseudonym = Type.String({ pattern: '^[\\p{L}\\p{M}\\p{N} ._-]{2,24}$' });

/** How long a join code works, and the policy a school agrees to for its learners. */
export const JOIN_CODE_DAYS = 14;
export const PLATFORM_POLICY_VERSION = 'platform-use-2026-11';

const ClassId = Type.Object({ id: Type.String({ format: 'uuid' }) });
const Enrolment = Type.Object({
  id: Type.String({ format: 'uuid' }),
  enrolment: Type.String({ format: 'uuid' }),
});

/**
 * A teacher's classes. Each has a join code, shown to the teacher once and
 * kept only as a hash; learners type it to join.
 */
export function classRoutes(deps: AppDependencies): FastifyPluginAsyncTypebox {
  const { database } = deps;

  const newCode = async (classId: string) => {
    const code = makeCode(2);
    const expiresAt = new Date(Date.now() + JOIN_CODE_DAYS * 86_400_000);
    await database.db
      .update(classes)
      .set({ joinCodeHash: hashCode(code), joinCodeExpiresAt: expiresAt })
      .where(eq(classes.id, classId));
    return { joinCode: code, joinCodeExpiresAt: expiresAt.toISOString() };
  };

  return async (app) => {
    app.post(
      '/v1/classes',
      {
        schema: {
          body: Type.Object(
            {
              schoolId: Type.String({ format: 'uuid' }),
              name: Type.String({ minLength: 1, maxLength: 60 }),
              grade: Type.Integer({ minimum: 6, maximum: 12 }),
              /** The teacher confirms the school has permission for these learners to use the lab. */
              schoolConsent: Type.Literal(true),
            },
            { additionalProperties: false },
          ),
        },
      },
      async (request, reply) => {
        const who = await requireUser(database, request, reply);
        if (!who) return;
        const { schoolId, name, grade } = request.body;
        if (who.kind !== 'adult' || !(await teachesIn(database, who.userId, schoolId))) {
          return reply.code(403).send({ error: 'not-a-teacher-here' });
        }
        const [made] = await database.db
          .insert(classes)
          .values({ schoolId, teacherId: who.userId, name, grade })
          .returning({ id: classes.id });
        const code = await newCode(made!.id);
        await audit(database, {
          actorId: who.userId,
          schoolId,
          action: 'class.create',
          targetType: 'class',
          targetId: made!.id,
        });
        return reply.code(201).send({ id: made!.id, name, grade, ...code });
      },
    );

    /** The teacher's classes, with how many learners each has. The codes are not shown again. */
    app.get('/v1/classes', async (request, reply) => {
      const who = await requireUser(database, request, reply);
      if (!who) return;
      const rows = await database.db
        .select({
          id: classes.id,
          schoolId: classes.schoolId,
          name: classes.name,
          grade: classes.grade,
          joinCodeExpiresAt: classes.joinCodeExpiresAt,
          learners: count(classEnrollments.id),
        })
        .from(classes)
        .leftJoin(
          classEnrollments,
          and(eq(classEnrollments.classId, classes.id), isNull(classEnrollments.revokedAt)),
        )
        .where(and(eq(classes.teacherId, who.userId), isNull(classes.archivedAt)))
        .groupBy(classes.id)
        .orderBy(classes.createdAt);
      return { classes: rows };
    });

    /** A new join code; the old one stops working. */
    app.post(
      '/v1/classes/:id/join-code',
      { schema: { params: ClassId } },
      async (request, reply) => {
        const who = await requireUser(database, request, reply);
        if (!who) return;
        const own = await ownClass(database, who.userId, request.params.id);
        if (!own) return reply.code(404).send({ error: 'no-such-class' });
        const code = await newCode(own.id);
        await audit(database, {
          actorId: who.userId,
          schoolId: own.schoolId,
          action: 'class.join-code',
          targetType: 'class',
          targetId: own.id,
        });
        return code;
      },
    );

    /** The class's learners, by nickname. Nothing else about them is kept. */
    app.get('/v1/classes/:id/learners', { schema: { params: ClassId } }, async (request, reply) => {
      const who = await requireUser(database, request, reply);
      if (!who) return;
      const own = await ownClass(database, who.userId, request.params.id);
      if (!own) return reply.code(404).send({ error: 'no-such-class' });
      const learners = await database.db
        .select({
          enrolment: classEnrollments.id,
          pseudonym: classEnrollments.pseudonym,
          joinedAt: classEnrollments.createdAt,
        })
        .from(classEnrollments)
        .where(and(eq(classEnrollments.classId, own.id), isNull(classEnrollments.revokedAt)))
        .orderBy(classEnrollments.pseudonym);
      return { learners };
    });

    /** The enrolment, when it is in this teacher's class and still current. */
    const enrolmentIn = async (userId: string, classId: string, enrolmentId: string) => {
      const own = await ownClass(database, userId, classId);
      if (!own) return null;
      const [row] = await database.db
        .select()
        .from(classEnrollments)
        .where(
          and(
            eq(classEnrollments.id, enrolmentId),
            eq(classEnrollments.classId, own.id),
            isNull(classEnrollments.revokedAt),
          ),
        )
        .limit(1);
      return row ? { own, row } : null;
    };
    const endLearnerSessions = (learnerId: string) =>
      database.db
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(and(eq(sessions.userId, learnerId), isNull(sessions.revokedAt)));

    /**
     * Takes a learner out of the class. A learner in no other class can no longer
     * sign in; their rows are kept for the retention job, not deleted.
     */
    app.post(
      '/v1/classes/:id/learners/:enrolment/remove',
      { schema: { params: Enrolment } },
      async (request, reply) => {
        const who = await requireUser(database, request, reply);
        if (!who) return;
        const found = await enrolmentIn(who.userId, request.params.id, request.params.enrolment);
        if (!found) return reply.code(404).send({ error: 'no-such-learner' });
        const { own, row } = found;
        await database.db
          .update(classEnrollments)
          .set({ revokedAt: new Date() })
          .where(eq(classEnrollments.id, row.id));
        const [{ others } = { others: 0 }] = await database.db
          .select({ others: count(classEnrollments.id) })
          .from(classEnrollments)
          .where(
            and(eq(classEnrollments.learnerId, row.learnerId), isNull(classEnrollments.revokedAt)),
          );
        // A learner on their own account keeps it; one who came only through classes is signed out.
        if (others === 0 && !(await onOwnAccount(database, row.learnerId))) {
          await database.db
            .update(users)
            .set({ deactivatedAt: new Date(), signInKeyHash: null })
            .where(eq(users.id, row.learnerId));
          await endLearnerSessions(row.learnerId);
        }
        await audit(database, {
          actorId: who.userId,
          schoolId: own.schoolId,
          action: 'class.remove-learner',
          targetType: 'enrolment',
          targetId: row.id,
        });
        return { ok: true };
      },
    );

    /**
     * Moves a learner to another of the teacher's classes in the same school,
     * under the same nickname unless another is given. Their account, key and
     * progress stay as they are.
     */
    app.post(
      '/v1/classes/:id/learners/:enrolment/move',
      {
        schema: {
          params: Enrolment,
          body: Type.Object(
            { to: Type.String({ format: 'uuid' }), pseudonym: Type.Optional(Pseudonym) },
            { additionalProperties: false },
          ),
        },
      },
      async (request, reply) => {
        const who = await requireUser(database, request, reply);
        if (!who) return;
        const found = await enrolmentIn(who.userId, request.params.id, request.params.enrolment);
        if (!found) return reply.code(404).send({ error: 'no-such-learner' });
        const { own, row } = found;
        const target = await ownClass(database, who.userId, request.body.to);
        if (!target || target.id === own.id || target.schoolId !== own.schoolId) {
          return reply.code(404).send({ error: 'no-such-class' });
        }
        const pseudonym = (request.body.pseudonym ?? row.pseudonym).trim();
        const moved = await database.db.transaction(async (tx) => {
          const there = await tx
            .select({ id: classEnrollments.id, learnerId: classEnrollments.learnerId })
            .from(classEnrollments)
            .where(
              and(
                eq(classEnrollments.classId, target.id),
                isNull(classEnrollments.revokedAt),
                or(
                  eq(classEnrollments.pseudonym, pseudonym),
                  eq(classEnrollments.learnerId, row.learnerId),
                ),
              ),
            );
          if (there.some((other) => other.learnerId === row.learnerId)) return 'already-there';
          if (there.length > 0) return 'pseudonym-taken';
          await tx
            .update(classEnrollments)
            .set({ revokedAt: new Date() })
            .where(eq(classEnrollments.id, row.id));
          // A learner who was in that class before comes back on the same enrolment.
          const [enrolment] = await tx
            .insert(classEnrollments)
            .values({ classId: target.id, learnerId: row.learnerId, pseudonym })
            .onConflictDoUpdate({
              target: [classEnrollments.classId, classEnrollments.learnerId],
              set: { pseudonym, revokedAt: null },
            })
            .returning({ id: classEnrollments.id });
          return enrolment!.id;
        });
        if (moved === 'already-there' || moved === 'pseudonym-taken') {
          return reply.code(409).send({ error: moved });
        }
        await audit(database, {
          actorId: who.userId,
          schoolId: own.schoolId,
          action: 'class.move-learner',
          targetType: 'enrolment',
          targetId: moved,
        });
        return { enrolment: moved };
      },
    );

    /** A new sign-in key for a learner who lost theirs; the old key and their sessions stop working. */
    app.post(
      '/v1/classes/:id/learners/:enrolment/key',
      { schema: { params: Enrolment } },
      async (request, reply) => {
        const who = await requireUser(database, request, reply);
        if (!who) return;
        const found = await enrolmentIn(who.userId, request.params.id, request.params.enrolment);
        if (!found) return reply.code(404).send({ error: 'no-such-learner' });
        const key = makeCode(3);
        await database.db
          .update(users)
          .set({ signInKeyHash: hashCode(key) })
          .where(eq(users.id, found.row.learnerId));
        await endLearnerSessions(found.row.learnerId);
        await audit(database, {
          actorId: who.userId,
          schoolId: found.own.schoolId,
          action: 'class.new-learner-key',
          targetType: 'enrolment',
          targetId: found.row.id,
        });
        return { key };
      },
    );

    /** Archives a class: its code stops working and it leaves the list. Nothing is deleted. */
    app.post('/v1/classes/:id/archive', { schema: { params: ClassId } }, async (request, reply) => {
      const who = await requireUser(database, request, reply);
      if (!who) return;
      const own = await ownClass(database, who.userId, request.params.id);
      if (!own) return reply.code(404).send({ error: 'no-such-class' });
      await database.db
        .update(classes)
        .set({ archivedAt: new Date(), joinCodeHash: null, joinCodeExpiresAt: null })
        .where(eq(classes.id, own.id));
      await audit(database, {
        actorId: who.userId,
        schoolId: own.schoolId,
        action: 'class.archive',
        targetType: 'class',
        targetId: own.id,
      });
      return { ok: true };
    });
  };
}
