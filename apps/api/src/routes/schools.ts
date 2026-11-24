import { Type, type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { and, asc, eq, gt, isNull, sql } from 'drizzle-orm';
import type { AppDependencies } from '../app';
import { adminOf, requireUser } from '../auth/access';
import { hashCode, makeCode } from '../auth/codes';
import { audit } from '../auth/session';
import type { Database } from '../db/client';
import { schoolMemberships, teacherInvites, users } from '../db/schema';

/** How long an invitation works. */
export const INVITE_DAYS = 7;

type Tx = Parameters<Parameters<Database['db']['transaction']>[0]>[0];

/**
 * Uses up an invitation for the user and makes them a teacher of its school.
 * Returns the school, or null when the code is wrong, used, withdrawn or old.
 */
export async function acceptInvite(tx: Tx, code: string, userId: string) {
  const [invite] = await tx
    .update(teacherInvites)
    .set({ acceptedBy: userId, acceptedAt: new Date() })
    .where(
      and(
        eq(teacherInvites.codeHash, hashCode(code)),
        isNull(teacherInvites.acceptedAt),
        isNull(teacherInvites.revokedAt),
        gt(teacherInvites.expiresAt, new Date()),
      ),
    )
    .returning({ id: teacherInvites.id, schoolId: teacherInvites.schoolId });
  if (!invite) return null;
  // A teacher who once left the school comes back on the same membership.
  await tx
    .insert(schoolMemberships)
    .values({ schoolId: invite.schoolId, userId, role: 'teacher' })
    .onConflictDoUpdate({
      target: [schoolMemberships.schoolId, schoolMemberships.userId, schoolMemberships.role],
      set: { endedAt: null },
    });
  return invite;
}

const School = Type.Object({ id: Type.String({ format: 'uuid' }) });

/**
 * A school's teachers. The teacher who signed the school up is its admin, and
 * may invite others with a code that works once; nothing is emailed.
 */
export function schoolRoutes(deps: AppDependencies): FastifyPluginAsyncTypebox {
  const { database } = deps;
  const strict = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } };

  return async (app) => {
    /** The school's teachers and its open invitations. Admins only. */
    app.get('/v1/schools/:id/teachers', { schema: { params: School } }, async (request, reply) => {
      const who = await requireUser(database, request, reply);
      if (!who) return;
      const schoolId = request.params.id;
      if (!(await adminOf(database, who.userId, schoolId))) {
        return reply.code(403).send({ error: 'not-an-admin-here' });
      }
      const teachers = await database.db
        .select({
          userId: users.id,
          displayName: users.displayName,
          since: schoolMemberships.createdAt,
          admin: sql<boolean>`exists (
            select 1 from ${schoolMemberships} as a
            where a.school_id = ${schoolId} and a.user_id = ${users.id}
              and a.role = 'school_admin' and a.ended_at is null)`,
        })
        .from(schoolMemberships)
        .innerJoin(users, eq(users.id, schoolMemberships.userId))
        .where(
          and(
            eq(schoolMemberships.schoolId, schoolId),
            eq(schoolMemberships.role, 'teacher'),
            isNull(schoolMemberships.endedAt),
            isNull(users.deactivatedAt),
          ),
        )
        .orderBy(asc(schoolMemberships.createdAt));
      const invites = await database.db
        .select({
          id: teacherInvites.id,
          createdAt: teacherInvites.createdAt,
          expiresAt: teacherInvites.expiresAt,
        })
        .from(teacherInvites)
        .where(
          and(
            eq(teacherInvites.schoolId, schoolId),
            isNull(teacherInvites.acceptedAt),
            isNull(teacherInvites.revokedAt),
            gt(teacherInvites.expiresAt, new Date()),
          ),
        )
        .orderBy(asc(teacherInvites.createdAt));
      return { teachers, invites };
    });

    /** A new invitation. Its code is in this answer only. */
    app.post(
      '/v1/schools/:id/invites',
      { ...strict, schema: { params: School } },
      async (request, reply) => {
        const who = await requireUser(database, request, reply);
        if (!who) return;
        const schoolId = request.params.id;
        if (!(await adminOf(database, who.userId, schoolId))) {
          return reply.code(403).send({ error: 'not-an-admin-here' });
        }
        const code = makeCode(3);
        const expiresAt = new Date(Date.now() + INVITE_DAYS * 86_400_000);
        const [invite] = await database.db
          .insert(teacherInvites)
          .values({ schoolId, createdBy: who.userId, codeHash: hashCode(code), expiresAt })
          .returning({ id: teacherInvites.id });
        await audit(database, {
          actorId: who.userId,
          schoolId,
          action: 'school.invite',
          targetType: 'teacher_invite',
          targetId: invite!.id,
        });
        return reply.code(201).send({ id: invite!.id, code, expiresAt: expiresAt.toISOString() });
      },
    );

    /** Withdraws an invitation nobody has used yet. */
    app.post(
      '/v1/schools/:id/invites/:invite/withdraw',
      {
        schema: {
          params: Type.Object({
            id: Type.String({ format: 'uuid' }),
            invite: Type.String({ format: 'uuid' }),
          }),
        },
      },
      async (request, reply) => {
        const who = await requireUser(database, request, reply);
        if (!who) return;
        const { id: schoolId, invite } = request.params;
        if (!(await adminOf(database, who.userId, schoolId))) {
          return reply.code(403).send({ error: 'not-an-admin-here' });
        }
        const withdrawn = await database.db
          .update(teacherInvites)
          .set({ revokedAt: new Date() })
          .where(
            and(
              eq(teacherInvites.id, invite),
              eq(teacherInvites.schoolId, schoolId),
              isNull(teacherInvites.acceptedAt),
              isNull(teacherInvites.revokedAt),
            ),
          )
          .returning({ id: teacherInvites.id });
        if (withdrawn.length === 0) return reply.code(404).send({ error: 'no-such-invite' });
        await audit(database, {
          actorId: who.userId,
          schoolId,
          action: 'school.invite-withdrawn',
          targetType: 'teacher_invite',
          targetId: invite,
        });
        return { ok: true };
      },
    );

    /** A signed-in teacher joins another school with an invitation's code. */
    app.post(
      '/v1/invites/accept',
      {
        ...strict,
        schema: {
          body: Type.Object(
            { code: Type.String({ minLength: 4, maxLength: 40 }) },
            { additionalProperties: false },
          ),
        },
      },
      async (request, reply) => {
        const who = await requireUser(database, request, reply);
        if (!who) return;
        if (who.kind !== 'adult') return reply.code(403).send({ error: 'adults-only' });
        const invite = await database.db.transaction((tx) =>
          acceptInvite(tx, request.body.code, who.userId),
        );
        if (!invite) return reply.code(404).send({ error: 'no-such-invite' });
        await audit(database, {
          actorId: who.userId,
          schoolId: invite.schoolId,
          action: 'school.invite-accepted',
          targetType: 'teacher_invite',
          targetId: invite.id,
        });
        return { schoolId: invite.schoolId };
      },
    );
  };
}
