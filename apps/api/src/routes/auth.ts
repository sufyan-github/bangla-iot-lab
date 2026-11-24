import { Type } from '@fastify/type-provider-typebox';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import type { AppDependencies } from '../app';
import { DUMMY_HASH, hashPassword, verifyPassword } from '../auth/password';
import { audit, clearSessionCookie, endSession, signedIn, startSession } from '../auth/session';
import { schoolMemberships, schools, users } from '../db/schema';

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
 * password and names their school; learners never have an email and join
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
              schoolName: Name,
              district: Type.Optional(Type.String({ maxLength: 60 })),
            },
            { additionalProperties: false },
          ),
        },
      },
      async (request, reply) => {
        const { email, password, displayName, schoolName, district } = request.body;
        const taken = await database.db
          .select({ id: users.id })
          .from(users)
          .where(sql`lower(${users.email}) = ${email.toLowerCase()}`)
          .limit(1);
        if (taken.length > 0) return reply.code(409).send({ error: 'email-taken' });
        const passwordHash = await hashPassword(password);
        const userId = await database.db.transaction(async (tx) => {
          const [user] = await tx
            .insert(users)
            .values({ kind: 'adult', email: email.toLowerCase(), passwordHash, displayName })
            .returning({ id: users.id });
          const [school] = await tx
            .insert(schools)
            .values({ name: schoolName, district: district || null })
            .returning({ id: schools.id });
          await tx.insert(schoolMemberships).values([
            { schoolId: school!.id, userId: user!.id, role: 'school_admin' },
            { schoolId: school!.id, userId: user!.id, role: 'teacher' },
          ]);
          return user!.id;
        });
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
      return {
        user: { id: who.userId, kind: who.kind, displayName: who.displayName, locale: who.locale },
        schools: roles,
      };
    });
  };
}
