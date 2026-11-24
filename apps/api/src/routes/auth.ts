import { Type } from '@fastify/type-provider-typebox';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import type { AppDependencies } from '../app';
import { DUMMY_HASH, hashPassword, verifyPassword } from '../auth/password';
import { requireUser } from '../auth/access';
import { sessions } from '../db/schema';
import {
  audit,
  clearSessionCookie,
  endAllSessions,
  endSession,
  signedIn,
  startSession,
} from '../auth/session';
import { classEnrollments, classes, schoolMemberships, schools, users } from '../db/schema';
import { acceptInvite } from './schools';
import { onOwnAccount } from '../auth/access';
import { accountEmails, approvedGuardian } from './individuals';
import { issueEmailToken } from '../auth/email-tokens';

/** Thrown inside the sign-up transaction to undo it when the invitation does not work. */
class NoSuchInvite extends Error {}

const Email = Type.String({
  minLength: 3,
  maxLength: 254,
  pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$',
});
/** At least 10 characters; long passphrases are welcome. */
const Password = Type.String({ minLength: 10, maxLength: 200 });
const Name = Type.String({ minLength: 1, maxLength: 80 });

/**
 * Accounts for adults (teachers). A teacher signs up with an email and a
 * password, and either names their school (becoming its admin) or gives the
 * code a school's admin made for them. Learners never have an email and join
 * through a class instead.
 */
export function authRoutes(deps: AppDependencies): FastifyPluginAsyncTypebox {
  const { database, config, mailer } = deps;
  const mail = accountEmails(config.webOrigin);
  const secure = config.webOrigin.startsWith('https:');
  const strict = {
    config: { rateLimit: { max: deps.config.signInsPerMinute, timeWindow: '1 minute' } },
  };

  return async (app) => {
    app.post(
      '/v1/auth/sign-up',
      {
        ...strict,
        schema: {
          body: Type.Object(
            {
              email: Email,
              password: Password,
              displayName: Name,
              schoolName: Type.Optional(Name),
              /** Joins an existing school instead of naming a new one. */
              inviteCode: Type.Optional(Type.String({ minLength: 4, maxLength: 40 })),
              district: Type.Optional(Type.String({ maxLength: 60 })),
            },
            { additionalProperties: false },
          ),
        },
      },
      async (request, reply) => {
        const { email, password, displayName, schoolName, inviteCode, district } = request.body;
        if ((schoolName === undefined) === (inviteCode === undefined)) {
          return reply.code(400).send({ error: 'school-or-invite' });
        }
        const taken = await database.db
          .select({ id: users.id })
          .from(users)
          .where(sql`lower(${users.email}) = ${email.toLowerCase()}`)
          .limit(1);
        if (taken.length > 0) return reply.code(409).send({ error: 'email-taken' });
        const passwordHash = await hashPassword(password);
        let userId: string;
        try {
          userId = await database.db.transaction(async (tx) => {
            const [user] = await tx
              .insert(users)
              .values({ kind: 'adult', email: email.toLowerCase(), passwordHash, displayName })
              .returning({ id: users.id });
            if (inviteCode !== undefined) {
              if (!(await acceptInvite(tx, inviteCode, user!.id))) throw new NoSuchInvite();
              return user!.id;
            }
            // A new school waits for an owner's approval, unless approval is switched off.
            const [school] = await tx
              .insert(schools)
              .values({
                name: schoolName!,
                district: district || null,
                status: config.schoolApproval === 'required' ? 'pending' : 'active',
              })
              .returning({ id: schools.id });
            await tx.insert(schoolMemberships).values([
              { schoolId: school!.id, userId: user!.id, role: 'school_admin' },
              { schoolId: school!.id, userId: user!.id, role: 'teacher' },
            ]);
            return user!.id;
          });
        } catch (error) {
          if (error instanceof NoSuchInvite)
            return reply.code(404).send({ error: 'no-such-invite' });
          throw error;
        }
        await audit(database, { actorId: userId, action: 'auth.sign-up' });
        // A teacher confirms their email before signing in, like any adult.
        const address = email.toLowerCase();
        const token = await issueEmailToken(database.db, {
          userId,
          purpose: 'verify-email',
          email: address,
        });
        await mailer.send(mail.verify(address, displayName, token));
        return reply.code(202).send({ ok: true, confirmEmail: true });
      },
    );

    /**
     * Signs in with an email (adults) or a sign-in name (learners with their own
     * account), and a password. Every adult must have confirmed their email,
     * and a learner's guardian must have approved the account (D-096, D-098).
     */
    app.post(
      '/v1/auth/sign-in',
      {
        ...strict,
        schema: {
          body: Type.Object(
            {
              identifier: Type.Optional(Type.String({ minLength: 3, maxLength: 254 })),
              /** The older name of the field, for adults. */
              email: Type.Optional(Email),
              password: Type.String({ maxLength: 200 }),
              keep: Type.Optional(Type.Boolean()),
            },
            { additionalProperties: false },
          ),
        },
      },
      async (request, reply) => {
        const { password } = request.body;
        const identifier = (request.body.identifier ?? request.body.email ?? '')
          .trim()
          .toLowerCase();
        if (!identifier) return reply.code(400).send({ error: 'bad-request' });
        const byEmail = identifier.includes('@');
        const [user] = await database.db
          .select({
            id: users.id,
            kind: users.kind,
            passwordHash: users.passwordHash,
            emailVerifiedAt: users.emailVerifiedAt,
            suspendedAt: users.suspendedAt,
          })
          .from(users)
          .where(
            and(
              byEmail
                ? sql`lower(${users.email}) = ${identifier}`
                : sql`lower(${users.username}) = ${identifier}`,
              isNull(users.deactivatedAt),
            ),
          )
          .limit(1);
        // Checked even when there is no such user, so the answer takes as long either way.
        const matches = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
        if (!user || !matches) return reply.code(401).send({ error: 'wrong-email-or-password' });
        // Only after the right password, so these say nothing to someone guessing.
        if (user.suspendedAt !== null) return reply.code(403).send({ error: 'account-suspended' });
        if (user.kind === 'adult' && user.emailVerifiedAt === null) {
          return reply.code(403).send({ error: 'email-not-verified' });
        }
        if (user.kind === 'learner' && !(await approvedGuardian(database, user.id))) {
          return reply.code(403).send({ error: 'awaiting-guardian' });
        }
        await audit(database, { actorId: user.id, action: 'auth.sign-in' });
        await startSession(database, reply, user.id, secure, request.body.keep ?? false);
        return { ok: true };
      },
    );

    app.post('/v1/auth/sign-out', async (request, reply) => {
      const who = await signedIn(database, request);
      if (who) {
        await endSession(database, who.sessionId);
        await audit(database, { actorId: who.userId, action: 'auth.sign-out' });
      }
      clearSessionCookie(reply, secure);
      return { ok: true };
    });

    /** Signs this account out on every device, this one too. */
    app.post('/v1/auth/sign-out-everywhere', async (request, reply) => {
      const who = await requireUser(database, request, reply);
      if (!who) return;
      await endAllSessions(database, who.userId);
      await audit(database, { actorId: who.userId, action: 'auth.sign-out-everywhere' });
      clearSessionCookie(reply, secure);
      return { ok: true };
    });

    /**
     * A new password, given the current one. Other devices are signed out; this
     * one stays signed in. Class learners have a key, not a password.
     */
    app.post(
      '/v1/me/password',
      {
        ...strict,
        schema: {
          body: Type.Object(
            { current: Type.String({ maxLength: 200 }), next: Password },
            { additionalProperties: false },
          ),
        },
      },
      async (request, reply) => {
        const who = await requireUser(database, request, reply);
        if (!who) return;
        const [user] = await database.db
          .select({ passwordHash: users.passwordHash })
          .from(users)
          .where(eq(users.id, who.userId));
        if (!user?.passwordHash) return reply.code(409).send({ error: 'no-password' });
        if (!(await verifyPassword(request.body.current, user.passwordHash))) {
          return reply.code(401).send({ error: 'wrong-password' });
        }
        await database.db
          .update(users)
          .set({ passwordHash: await hashPassword(request.body.next) })
          .where(eq(users.id, who.userId));
        await database.db
          .update(sessions)
          .set({ revokedAt: new Date() })
          .where(
            and(
              eq(sessions.userId, who.userId),
              isNull(sessions.revokedAt),
              sql`${sessions.id} <> ${who.sessionId}`,
            ),
          );
        await audit(database, { actorId: who.userId, action: 'auth.change-password' });
        return { ok: true };
      },
    );

    /** Who is signed in, and their roles in schools. 401 when no one is. */
    app.get('/v1/me', async (request, reply) => {
      const who = await signedIn(database, request);
      if (!who) return reply.code(401).send({ error: 'signed-out' });
      const roles = await database.db
        .select({
          schoolId: schools.id,
          schoolName: schools.name,
          role: schoolMemberships.role,
          // Whether the school works yet: waiting for approval, working, or suspended.
          schoolStatus: schools.status,
        })
        .from(schoolMemberships)
        .innerJoin(schools, eq(schools.id, schoolMemberships.schoolId))
        .where(
          and(
            eq(schoolMemberships.userId, who.userId),
            isNull(schoolMemberships.endedAt),
            isNull(schools.archivedAt),
          ),
        );
      // A learner's classes, under the nickname they have in each.
      const enrolled = await database.db
        .select({
          classId: classes.id,
          className: classes.name,
          grade: classes.grade,
          pseudonym: classEnrollments.pseudonym,
        })
        .from(classEnrollments)
        .innerJoin(classes, eq(classes.id, classEnrollments.classId))
        .where(and(eq(classEnrollments.learnerId, who.userId), isNull(classEnrollments.revokedAt)));
      const ownAccount = who.kind === 'learner' && (await onOwnAccount(database, who.userId));
      const [details] = await database.db
        .select({ username: users.username })
        .from(users)
        .where(eq(users.id, who.userId));
      return {
        user: {
          id: who.userId,
          kind: who.kind,
          displayName: who.displayName,
          locale: who.locale,
          // A learner who signed up on their own, rather than only through a class.
          ownAccount,
          platformRole: who.platformRole,
          /**
           * - staff: an adult in a school (teacher or admin);
           * - individual: an adult in no school, or a learner with their own account;
           * - class: a learner who exists only through their classes.
           */
          account:
            who.kind === 'adult'
              ? roles.length > 0
                ? 'staff'
                : 'individual'
              : ownAccount
                ? 'individual'
                : 'class',
          username: details?.username ?? null,
        },
        schools: roles,
        classes: enrolled,
      };
    });
  };
}
