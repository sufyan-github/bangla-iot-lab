import { Type, type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { and, countDistinct, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { AppDependencies } from '../app';
import { isStaff } from './individuals';
import { ownClass, requireUser } from '../auth/access';
import { audit } from '../auth/session';
import { classEnrollments, classes, lessonAssignments, progressEvents } from '../db/schema';

const LessonId = Type.String({ pattern: '^[a-z0-9-]{1,60}$' });
const ClassId = Type.Object({ id: Type.String({ format: 'uuid' }) });
/** Events the lab may send in one go, after being offline. */
export const MAX_EVENTS = 200;

/**
 * Lessons set for a class, and learners' progress in lessons. A teacher sees
 * how many of the class started and finished each lesson, not each learner's
 * record.
 */
export function lessonRoutes(deps: AppDependencies): FastifyPluginAsyncTypebox {
  const { database } = deps;

  return async (app) => {
    app.post(
      '/v1/classes/:id/assignments',
      {
        schema: {
          params: ClassId,
          body: Type.Object(
            { lessonId: LessonId, dueAt: Type.Optional(Type.String({ format: 'date-time' })) },
            { additionalProperties: false },
          ),
        },
      },
      async (request, reply) => {
        const who = await requireUser(database, request, reply);
        if (!who) return;
        const own = await ownClass(database, who.userId, request.params.id);
        if (!own) return reply.code(404).send({ error: 'no-such-class' });
        const { lessonId, dueAt } = request.body;
        const already = await database.db
          .select({ id: lessonAssignments.id })
          .from(lessonAssignments)
          .where(
            and(
              eq(lessonAssignments.classId, own.id),
              eq(lessonAssignments.lessonId, lessonId),
              isNull(lessonAssignments.removedAt),
            ),
          )
          .limit(1);
        if (already.length > 0) return reply.code(409).send({ error: 'already-set' });
        const [made] = await database.db
          .insert(lessonAssignments)
          .values({ classId: own.id, lessonId, dueAt: dueAt ? new Date(dueAt) : null })
          .returning({ id: lessonAssignments.id });
        await audit(database, {
          actorId: who.userId,
          schoolId: own.schoolId,
          action: 'class.assign-lesson',
          targetType: 'class',
          targetId: own.id,
        });
        return reply.code(201).send({ id: made!.id });
      },
    );

    app.post(
      '/v1/classes/:id/assignments/:assignment/remove',
      {
        schema: {
          params: Type.Object({
            id: Type.String({ format: 'uuid' }),
            assignment: Type.String({ format: 'uuid' }),
          }),
        },
      },
      async (request, reply) => {
        const who = await requireUser(database, request, reply);
        if (!who) return;
        const own = await ownClass(database, who.userId, request.params.id);
        if (!own) return reply.code(404).send({ error: 'no-such-class' });
        const changed = await database.db
          .update(lessonAssignments)
          .set({ removedAt: new Date() })
          .where(
            and(
              eq(lessonAssignments.id, request.params.assignment),
              eq(lessonAssignments.classId, own.id),
              isNull(lessonAssignments.removedAt),
            ),
          )
          .returning({ id: lessonAssignments.id });
        if (changed.length === 0) return reply.code(404).send({ error: 'no-such-assignment' });
        return { ok: true };
      },
    );

    /**
     * The class's lessons, each with how many of its current learners have
     * started and finished it. Counts only: no learner's own record.
     */
    app.get('/v1/classes/:id/summary', { schema: { params: ClassId } }, async (request, reply) => {
      const who = await requireUser(database, request, reply);
      if (!who) return;
      const own = await ownClass(database, who.userId, request.params.id);
      if (!own) return reply.code(404).send({ error: 'no-such-class' });
      const assignments = await database.db
        .select({
          id: lessonAssignments.id,
          lessonId: lessonAssignments.lessonId,
          dueAt: lessonAssignments.dueAt,
        })
        .from(lessonAssignments)
        .where(and(eq(lessonAssignments.classId, own.id), isNull(lessonAssignments.removedAt)))
        .orderBy(lessonAssignments.createdAt);
      const learners = database.db
        .select({ id: classEnrollments.learnerId })
        .from(classEnrollments)
        .where(and(eq(classEnrollments.classId, own.id), isNull(classEnrollments.revokedAt)));
      const lessonIds = assignments.map((a) => a.lessonId);
      const counts =
        lessonIds.length === 0
          ? []
          : await database.db
              .select({
                lessonId: progressEvents.lessonId,
                started: countDistinct(progressEvents.learnerId),
                finished:
                  sql<number>`count(distinct ${progressEvents.learnerId}) filter (where ${progressEvents.outcome} = 'lesson-done')`.mapWith(
                    Number,
                  ),
              })
              .from(progressEvents)
              .where(
                and(
                  inArray(progressEvents.lessonId, lessonIds),
                  inArray(progressEvents.learnerId, learners),
                ),
              )
              .groupBy(progressEvents.lessonId);
      const [{ size } = { size: 0 }] = await database.db
        .select({ size: countDistinct(classEnrollments.learnerId) })
        .from(classEnrollments)
        .where(and(eq(classEnrollments.classId, own.id), isNull(classEnrollments.revokedAt)));
      return {
        learners: size,
        lessons: assignments.map((a) => {
          const count = counts.find((c) => c.lessonId === a.lessonId);
          return { ...a, started: count?.started ?? 0, finished: count?.finished ?? 0 };
        }),
      };
    });

    /** The lessons set for the learner's classes. */
    app.get('/v1/assignments', async (request, reply) => {
      const who = await requireUser(database, request, reply);
      if (!who) return;
      const rows = await database.db
        .select({
          id: lessonAssignments.id,
          lessonId: lessonAssignments.lessonId,
          dueAt: lessonAssignments.dueAt,
          className: classes.name,
        })
        .from(lessonAssignments)
        .innerJoin(classes, eq(classes.id, lessonAssignments.classId))
        .innerJoin(classEnrollments, eq(classEnrollments.classId, classes.id))
        .where(
          and(
            eq(classEnrollments.learnerId, who.userId),
            isNull(classEnrollments.revokedAt),
            isNull(lessonAssignments.removedAt),
            isNull(classes.archivedAt),
          ),
        )
        .orderBy(lessonAssignments.createdAt);
      return { assignments: rows };
    });

    /** A learner's progress, sent by the lab; events already received are ignored. */
    app.post(
      '/v1/progress',
      {
        schema: {
          body: Type.Object(
            {
              events: Type.Array(
                Type.Object(
                  {
                    id: Type.String({ format: 'uuid' }),
                    lessonId: LessonId,
                    step: Type.Integer({ minimum: 0, maximum: 100 }),
                    outcome: Type.Union([Type.Literal('step-done'), Type.Literal('lesson-done')]),
                    at: Type.String({ format: 'date-time' }),
                  },
                  { additionalProperties: false },
                ),
                { minItems: 1, maxItems: MAX_EVENTS },
              ),
            },
            { additionalProperties: false },
          ),
        },
      },
      async (request, reply) => {
        const who = await requireUser(database, request, reply);
        if (!who) return;
        // Learners' and individual adults' progress is recorded; a teacher trying a
        // lesson leaves no trace in a class's totals.
        if (who.kind !== 'learner' && (await isStaff(database, who.userId))) return { kept: 0 };
        const now = Date.now();
        const kept = await database.db
          .insert(progressEvents)
          .values(
            request.body.events.map((event) => ({
              learnerId: who.userId,
              lessonId: event.lessonId,
              step: event.step,
              outcome: event.outcome,
              clientEventId: event.id,
              // A device clock in the future is not believed.
              occurredAt: new Date(Math.min(Date.parse(event.at), now)),
            })),
          )
          .onConflictDoNothing({ target: progressEvents.clientEventId })
          .returning({ id: progressEvents.id });
        return { kept: kept.length };
      },
    );
  };
}
