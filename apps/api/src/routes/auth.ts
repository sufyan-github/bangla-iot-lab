import { Type } from '@fastify/type-provider-typebox';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import type { AppDependencies } from '../app';
import { DUMMY_HASH, hashPassword, verifyPassword } from '../auth/password';
import { audit, clearSessionCookie, endSession, signedIn, startSession } from '../auth/session';
import { classEnrollments, classes, schoolMemberships, schools, users } from '../db/schema';
import { acceptInvite } from './schools';
import { onOwnAccount } from '../auth/access';

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
  const { database, config } = deps;
  const secure = config.webOrigin.startsWith('https:');
  const strict = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } };

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
            const [school] = await tx
              .insert(schools)
              .values({ name: schoolName!, district: district || null })
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
        await startSession(database, reply, userId, secure);
        return reply.code(201).send({ ok: true });
      },
    );

    app.post(
      '/v1/auth/sign-in',
      {
        ...strict,
        schema: {
          body: Type.Object(
            { email: Email, password: Type.String({ maxLength: 200 }) },
            { additionalProperties: false },
          ),
        },
      },
      async (request, reply) => {
        const { email, password } = request.body;
        const [user] = await database.db
          .select({ id: users.id, passwordHash: users.passwordHash })
          .from(users)
          .where(
            and(sql`lower(${users.email}) = ${email.toLowerCase()}`, isNull(users.deactivatedAt)),
          )
          .limit(1);
        // Checked even when there is no such user, so the answer takes as long either way.
        const matches = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
        if (!user || !matches) return reply.code(401).send({ error: 'wrong-email-or-password' });
        await audit(database, { actorId: user.id, action: 'auth.sign-in' });
        await startSession(database, reply, user.id, secure);
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

    /** Who is signed in, and their roles in schools. 401 when no one is. */
    app.get('/v1/me', async (request, reply) => {
      const who = await signedIn(database, request);
      if (!who) return reply.code(401).send({ error: 'signed-out' });
      const roles = await database.db
        .select({ schoolId: schools.id, schoolName: schools.name, role: schoolMemberships.role })
        .from(schoolMemberships)
        .innerJoin(schools, eq(schools.id, schoolMemberships.schoolId))
        .where(and(eq(schoolMemberships.userId, who.userId), isNull(schoolMemberships.endedAt)));
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
      return {
        user: {
          id: who.userId,
          kind: who.kind,
          displayName: who.displayName,
          locale: who.locale,
          // A learner who signed up on their own, rather than only through a class.
          ownAccount: who.kind === 'learner' && (await onOwnAccount(database, who.userId)),
        },
        schools: roles,
        classes: enrolled,
      };
    });
  };
}
