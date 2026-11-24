import { Type } from '@fastify/type-provider-typebox';
import { and, eq, isNull, ne, sql } from 'drizzle-orm';
import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import type { AppDependencies } from '../app';
import { requireUser } from '../auth/access';
import { issueEmailToken, useEmailToken } from '../auth/email-tokens';
import { verifyPassword } from '../auth/password';
import { audit, clearSessionCookie, endAllSessions } from '../auth/session';
import type { Database } from '../db/client';
import { classes, consentRecords, schoolMemberships, users } from '../db/schema';
import { Email, Username, accountEmails, approvedGuardian } from './individuals';

/**
 * Closing an account (D-100): by its own holder, or, for a learner's own
 * account, by the guardian who approved it. Closing is final: no way in
 * remains, every session ends, the key is removed and the consent is marked
 * withdrawn. The data stays until the retention job removes it.
 *
 * Nothing is left without someone in charge: a school's admin, or an owner of
 * the lab, hands the role on first. A teacher's classes pass to their school's
 * admin.
 */

/** Why an account cannot be closed as it is, or null. */
async function mustHandOn(database: Database, userId: string) {
  const [user] = await database.db
    .select({ platformRole: users.platformRole })
    .from(users)
    .where(eq(users.id, userId));
  if (user?.platformRole === 'platform_admin') return 'owner-stays';
  const admin = await database.db
    .select({ id: schoolMemberships.id })
    .from(schoolMemberships)
    .where(
      and(
        eq(schoolMemberships.userId, userId),
        eq(schoolMemberships.role, 'school_admin'),
        isNull(schoolMemberships.endedAt),
      ),
    )
    .limit(1);
  return admin.length > 0 ? 'admin-stays' : null;
}

/** Closes the account for good. */
export async function closeAccount(database: Database, userId: string): Promise<void> {
  const now = new Date();
  await database.db.transaction(async (tx) => {
    // A teacher's classes pass to their school's admin.
    const teaching = await tx
      .select({ schoolId: schoolMemberships.schoolId })
      .from(schoolMemberships)
      .where(
        and(
          eq(schoolMemberships.userId, userId),
          eq(schoolMemberships.role, 'teacher'),
          isNull(schoolMemberships.endedAt),
        ),
      );
    for (const { schoolId } of teaching) {
      const [admin] = await tx
        .select({ userId: schoolMemberships.userId })
        .from(schoolMemberships)
        .where(
          and(
            eq(schoolMemberships.schoolId, schoolId),
            eq(schoolMemberships.role, 'school_admin'),
            isNull(schoolMemberships.endedAt),
            ne(schoolMemberships.userId, userId),
          ),
        )
        .limit(1);
      if (admin) {
        await tx
          .update(classes)
          .set({ teacherId: admin.userId })
          .where(
            and(
              eq(classes.schoolId, schoolId),
              eq(classes.teacherId, userId),
              isNull(classes.archivedAt),
            ),
          );
      }
    }
    await tx
      .update(schoolMemberships)
      .set({ endedAt: now })
      .where(and(eq(schoolMemberships.userId, userId), isNull(schoolMemberships.endedAt)));
    await tx
      .update(consentRecords)
      .set({ revokedAt: now })
      .where(and(eq(consentRecords.learnerId, userId), isNull(consentRecords.revokedAt)));
    await tx
      .update(users)
      .set({ deactivatedAt: now, signInKeyHash: null })
      .where(eq(users.id, userId));
  });
  await endAllSessions(database, userId);
}

export function closingRoutes(deps: AppDependencies): FastifyPluginAsyncTypebox {
  const { database, config, mailer } = deps;
  const secure = config.webOrigin.startsWith('https:');
  const mail = accountEmails(config.webOrigin);
  const strict = {
    config: { rateLimit: { max: config.signInsPerMinute, timeWindow: '1 minute' } },
  };

  return async (app) => {
    /** Closes the signed-in account. A password, if the account has one, confirms it. */
    app.post(
      '/v1/me/close',
      {
        ...strict,
        schema: {
          body: Type.Object(
            { password: Type.Optional(Type.String({ maxLength: 200 })) },
            { additionalProperties: false },
          ),
        },
      },
      async (request, reply) => {
        const who = await requireUser(database, request, reply);
        if (!who) return;
        const blocked = await mustHandOn(database, who.userId);
        if (blocked) return reply.code(409).send({ error: blocked });
        const [user] = await database.db
          .select({ passwordHash: users.passwordHash })
          .from(users)
          .where(eq(users.id, who.userId));
        if (
          user?.passwordHash &&
          !(await verifyPassword(request.body.password ?? '', user.passwordHash))
        ) {
          return reply.code(401).send({ error: 'wrong-password' });
        }
        await closeAccount(database, who.userId);
        await audit(database, {
          actorId: who.userId,
          action: 'account.close-own',
          targetType: 'user',
          targetId: who.userId,
        });
        clearSessionCookie(reply, secure);
        return { ok: true };
      },
    );

    /**
     * A guardian asks to close a learner's own account. When the sign-in name
     * and the guardian's email match the approval on record, a one-time link
     * goes to that email. The same answer whatever is found.
     */
    app.post(
      '/v1/auth/guardian-close',
      {
        ...strict,
        schema: {
          body: Type.Object(
            { username: Username, guardianEmail: Email },
            { additionalProperties: false },
          ),
        },
      },
      async (request, reply) => {
        const username = request.body.username.toLowerCase();
        const guardianEmail = request.body.guardianEmail.trim().toLowerCase();
        const [learner] = await database.db
          .select({ id: users.id, displayName: users.displayName })
          .from(users)
          .where(
            and(
              sql`lower(${users.username}) = ${username}`,
              eq(users.kind, 'learner'),
              isNull(users.deactivatedAt),
            ),
          )
          .limit(1);
        const guardian = learner ? await approvedGuardian(database, learner.id) : null;
        if (learner && guardian?.email === guardianEmail) {
          const token = await issueEmailToken(database.db, {
            userId: learner.id,
            purpose: 'close-account',
            email: guardianEmail,
          });
          await mailer.send(mail.close(guardianEmail, learner.displayName, username, token));
          await audit(database, {
            actorId: learner.id,
            action: 'account.guardian-close-asked',
            targetType: 'user',
            targetId: learner.id,
          });
        }
        return reply.code(202).send({ ok: true });
      },
    );

    /** The guardian's close link: the learner's account is closed. */
    app.post(
      '/v1/auth/close-account',
      {
        ...strict,
        schema: {
          body: Type.Object(
            { token: Type.String({ minLength: 20, maxLength: 100 }) },
            { additionalProperties: false },
          ),
        },
      },
      async (request, reply) => {
        const used = await useEmailToken(database.db, request.body.token, 'close-account');
        if (!used) return reply.code(404).send({ error: 'link-not-working' });
        await closeAccount(database, used.userId);
        await audit(database, {
          actorId: used.userId,
          action: 'account.closed-by-guardian',
          targetType: 'user',
          targetId: used.userId,
        });
        return { ok: true };
      },
    );
  };
}
