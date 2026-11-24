import { Type } from '@fastify/type-provider-typebox';
import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import type { AppDependencies } from '../app';
import { issueEmailToken, peekEmailToken, useEmailToken } from '../auth/email-tokens';
import { hashPassword } from '../auth/password';
import { audit, endAllSessions, startSession } from '../auth/session';
import { consentRecords, guardianLinks, schoolMemberships, users } from '../db/schema';
import type { Database } from '../db/client';
import type { MailMessage } from '../mail';
import { Pseudonym } from './classes';

/**
 * Accounts for people who use the lab on their own, outside any school (D-096).
 *
 * - An adult signs up with an email and a password and opens the link sent to
 *   that email before they can sign in.
 * - A learner under 18 never gives an email. They choose a sign-in name, a
 *   nickname and a password, and name a guardian's email. The guardian opens
 *   the link sent there and approves the account (that is the consent), and
 *   later receives its password resets.
 *
 * Answers that would tell a stranger whether an email has an account are the
 * same either way; what differs goes by email to the owner of the address.
 */
export const INDIVIDUAL_LEARNER_POLICY_VERSION = 'individual-learner-2026-11';

export const Email = Type.String({
  minLength: 3,
  maxLength: 254,
  pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$',
});
export const Password = Type.String({ minLength: 10, maxLength: 200 });
/** Letters a-z, digits, dot, dash and underscore: easy to type on any keyboard. */
export const Username = Type.String({ pattern: '^[A-Za-z0-9][A-Za-z0-9._-]{2,23}$' });
const Token = Type.String({ minLength: 20, maxLength: 100 });
const Identifier = Type.String({ minLength: 3, maxLength: 254 });

const accepted = { ok: true } as const;

/** Adults who belong to no school and learners with their own account: not staff. */
export async function isStaff(database: Database, userId: string): Promise<boolean> {
  const rows = await database.db
    .select({ id: schoolMemberships.id })
    .from(schoolMemberships)
    .where(and(eq(schoolMemberships.userId, userId), isNull(schoolMemberships.endedAt)))
    .limit(1);
  return rows.length > 0;
}

/** The guardian who approved a learner's own account, if one has. */
export async function approvedGuardian(database: Database, learnerId: string) {
  const [row] = await database.db
    .select({ email: guardianLinks.email })
    .from(guardianLinks)
    .where(
      and(
        eq(guardianLinks.learnerId, learnerId),
        isNotNull(guardianLinks.approvedAt),
        isNull(guardianLinks.revokedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Emails, Bangla first, then English. Links carry the token after #, so it never reaches a server log. */
function emails(origin: string) {
  const link = (path: string, token: string) => `${origin}/account/${path}#${token}`;
  return {
    verify: (to: string, name: string, token: string): MailMessage => ({
      to,
      subject: 'বাংলা IoT ল্যাব: ইমেইল যাচাই করুন / Confirm your email',
      text: [
        `${name}, বাংলা IoT ল্যাবে আপনার অ্যাকাউন্ট চালু করতে এই লিংক খুলুন (৪৮ ঘণ্টা কাজ করবে):`,
        link('verify', token),
        '',
        `${name}, open this link to start your Bangla IoT Lab account (it works for 48 hours):`,
        link('verify', token),
        '',
        'আপনি অ্যাকাউন্ট না খুলে থাকলে এই ইমেইল উপেক্ষা করুন। / If you did not sign up, ignore this email.',
      ].join('\n'),
    }),
    alreadyHave: (to: string): MailMessage => ({
      to,
      subject: 'বাংলা IoT ল্যাব: আপনার অ্যাকাউন্ট আগেই আছে / You already have an account',
      text: [
        'এই ইমেইল দিয়ে কেউ নতুন অ্যাকাউন্ট খুলতে চেয়েছে, কিন্তু অ্যাকাউন্ট আগেই আছে। পাসওয়ার্ড মনে না থাকলে সাইন-ইন পাতায় "পাসওয়ার্ড ভুলে গেছি" বেছে নিন।',
        `${origin}/account`,
        '',
        'Someone tried to sign up with this email, but it already has an account. If you forgot the password, choose "Forgot password" on the sign-in page.',
        '',
        'আপনি না হলে কিছু করতে হবে না। / If it was not you, there is nothing to do.',
      ].join('\n'),
    }),
    approve: (to: string, nickname: string, username: string, token: string): MailMessage => ({
      to,
      subject: `বাংলা IoT ল্যাব: ${nickname}-এর অ্যাকাউন্ট অনুমোদন / Approve ${nickname}'s account`,
      text: [
        `"${nickname}" (সাইন-ইন নাম ${username}) বাংলা IoT ল্যাবে নিজের অ্যাকাউন্ট খুলতে চায় এবং আপনাকে অভিভাবক হিসেবে দেখিয়েছে। ল্যাব তার ইমেইল, ফোন নম্বর বা আসল নাম রাখে না; আপনার ইমেইল রাখা হয় শুধু অনুমোদন আর পাসওয়ার্ড ভুলে গেলে নতুন পাসওয়ার্ডের জন্য।`,
        'দেখে অনুমোদন দিতে এই লিংক খুলুন (৭ দিন কাজ করবে):',
        link('approve', token),
        '',
        `"${nickname}" (sign-in name ${username}) wants an account of their own on Bangla IoT Lab and named you as their parent or guardian. The lab keeps no email, phone number or real name of theirs; your email is kept only for this approval and for password resets.`,
        'To read more and approve, open this link (it works for 7 days):',
        link('approve', token),
        '',
        'আপনি এই শিক্ষার্থীকে না চিনলে এই ইমেইল উপেক্ষা করুন; অ্যাকাউন্ট চালু হবে না। / If you do not know this learner, ignore this email; the account stays closed.',
      ].join('\n'),
    }),
    reset: (to: string, name: string, token: string, forLearner: boolean): MailMessage => ({
      to,
      subject: 'বাংলা IoT ল্যাব: নতুন পাসওয়ার্ড / Set a new password',
      text: [
        forLearner
          ? `আপনি যার অভিভাবক, সেই "${name}"-এর অ্যাকাউন্টের নতুন পাসওয়ার্ড ঠিক করতে এই লিংক খুলুন (১ ঘণ্টা কাজ করবে):`
          : `${name}, নতুন পাসওয়ার্ড ঠিক করতে এই লিংক খুলুন (১ ঘণ্টা কাজ করবে):`,
        link('reset', token),
        '',
        forLearner
          ? `To set a new password for "${name}", the learner whose guardian you are, open this link (it works for one hour):`
          : `${name}, open this link to set a new password (it works for one hour):`,
        link('reset', token),
        '',
        'আপনি না চাইলে কিছু করতে হবে না; পুরোনো পাসওয়ার্ড কাজ করবে। / If you did not ask, there is nothing to do; the old password still works.',
      ].join('\n'),
    }),
  };
}

export function individualRoutes(deps: AppDependencies): FastifyPluginAsyncTypebox {
  const { database, config, mailer } = deps;
  const secure = config.webOrigin.startsWith('https:');
  const mail = emails(config.webOrigin);
  const strict = {
    config: { rateLimit: { max: config.signInsPerMinute, timeWindow: '1 minute' } },
  };
  const send = (message: MailMessage) => mailer.send(message);

  /** An account found by email (adults) or sign-in name (learners). */
  async function findAccount(identifier: string) {
    const value = identifier.trim().toLowerCase();
    const where = value.includes('@')
      ? sql`lower(${users.email}) = ${value}`
      : sql`lower(${users.username}) = ${value}`;
    const [user] = await database.db
      .select({
        id: users.id,
        kind: users.kind,
        email: users.email,
        username: users.username,
        displayName: users.displayName,
        emailVerifiedAt: users.emailVerifiedAt,
      })
      .from(users)
      .where(and(where, isNull(users.deactivatedAt)))
      .limit(1);
    return user ?? null;
  }

  async function pendingGuardian(learnerId: string) {
    const [row] = await database.db
      .select({ email: guardianLinks.email })
      .from(guardianLinks)
      .where(
        and(
          eq(guardianLinks.learnerId, learnerId),
          isNull(guardianLinks.approvedAt),
          isNull(guardianLinks.revokedAt),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  return async (app) => {
    /** An adult on their own: answered the same whether or not the email has an account. */
    app.post(
      '/v1/auth/register',
      {
        ...strict,
        schema: {
          body: Type.Object(
            {
              email: Email,
              password: Password,
              displayName: Type.String({ minLength: 1, maxLength: 80 }),
              adult: Type.Literal(true),
            },
            { additionalProperties: false },
          ),
        },
      },
      async (request, reply) => {
        const email = request.body.email.trim().toLowerCase();
        const displayName = request.body.displayName.trim();
        const existing = await findAccount(email);
        if (existing) {
          if (existing.emailVerifiedAt === null && !(await isStaff(database, existing.id))) {
            // Signed up before and never confirmed: send the link again.
            const token = await issueEmailToken(database.db, {
              userId: existing.id,
              purpose: 'verify-email',
              email,
            });
            await send(mail.verify(email, existing.displayName, token));
          } else {
            await send(mail.alreadyHave(email));
          }
          return reply.code(202).send(accepted);
        }
        const passwordHash = await hashPassword(request.body.password);
        const made = await database.db.transaction(async (tx) => {
          const [user] = await tx
            .insert(users)
            .values({ kind: 'adult', email, passwordHash, displayName })
            .returning({ id: users.id });
          const token = await issueEmailToken(tx, {
            userId: user!.id,
            purpose: 'verify-email',
            email,
          });
          return { userId: user!.id, token };
        });
        await audit(database, { actorId: made.userId, action: 'auth.register' });
        await send(mail.verify(email, displayName, made.token));
        return reply.code(202).send(accepted);
      },
    );

    /** A learner under 18 on their own: no email of theirs, a guardian's to approve. */
    app.post(
      '/v1/auth/register-learner',
      {
        ...strict,
        schema: {
          body: Type.Object(
            {
              username: Username,
              pseudonym: Pseudonym,
              password: Password,
              guardianEmail: Email,
            },
            { additionalProperties: false },
          ),
        },
      },
      async (request, reply) => {
        const username = request.body.username.toLowerCase();
        const pseudonym = request.body.pseudonym.trim();
        const guardianEmail = request.body.guardianEmail.trim().toLowerCase();
        if (await findAccount(username)) return reply.code(409).send({ error: 'username-taken' });
        const passwordHash = await hashPassword(request.body.password);
        let made: { userId: string; token: string };
        try {
          made = await database.db.transaction(async (tx) => {
            const [learner] = await tx
              .insert(users)
              .values({ kind: 'learner', username, displayName: pseudonym, passwordHash })
              .returning({ id: users.id });
            await tx.insert(guardianLinks).values({ learnerId: learner!.id, email: guardianEmail });
            const token = await issueEmailToken(tx, {
              userId: learner!.id,
              purpose: 'approve-learner',
              email: guardianEmail,
            });
            return { userId: learner!.id, token };
          });
        } catch (error) {
          // Two sign-ups racing for one name: the unique index decides.
          if ((error as { code?: string }).code === '23505')
            return reply.code(409).send({ error: 'username-taken' });
          throw error;
        }
        await audit(database, { actorId: made.userId, action: 'auth.register-learner' });
        await send(mail.approve(guardianEmail, pseudonym, username, made.token));
        return reply.code(202).send(accepted);
      },
    );

    /** What an emailed link is for, so its page can say so before anything is done. */
    app.post(
      '/v1/auth/email-link',
      {
        ...strict,
        schema: { body: Type.Object({ token: Token }, { additionalProperties: false }) },
      },
      async (request, reply) => {
        const link = await peekEmailToken(database, request.body.token);
        if (!link) return reply.code(404).send({ error: 'link-not-working' });
        const [user] = await database.db
          .select({ displayName: users.displayName, username: users.username })
          .from(users)
          .where(eq(users.id, link.userId));
        return {
          purpose: link.purpose,
          displayName: user!.displayName,
          // The guardian sees which account they approve or reset.
          username: link.purpose === 'verify-email' ? null : user!.username,
        };
      },
    );

    /** The adult opened their verification link: the account works, and they are signed in. */
    app.post(
      '/v1/auth/verify-email',
      {
        ...strict,
        schema: {
          body: Type.Object(
            { token: Token, keep: Type.Optional(Type.Boolean()) },
            { additionalProperties: false },
          ),
        },
      },
      async (request, reply) => {
        const used = await useEmailToken(database.db, request.body.token, 'verify-email');
        if (!used) return reply.code(404).send({ error: 'link-not-working' });
        await database.db
          .update(users)
          .set({ emailVerifiedAt: new Date() })
          .where(eq(users.id, used.userId));
        await audit(database, { actorId: used.userId, action: 'auth.verify-email' });
        await startSession(database, reply, used.userId, secure, request.body.keep ?? false);
        return { ok: true };
      },
    );

    /** The guardian approves a learner's own account: this is the consent. */
    app.post(
      '/v1/auth/approve-learner',
      {
        ...strict,
        schema: { body: Type.Object({ token: Token }, { additionalProperties: false }) },
      },
      async (request, reply) => {
        const approved = await database.db.transaction(async (tx) => {
          const used = await useEmailToken(tx, request.body.token, 'approve-learner');
          if (!used) return null;
          await tx
            .update(guardianLinks)
            .set({ approvedAt: new Date() })
            .where(
              and(
                eq(guardianLinks.learnerId, used.userId),
                eq(guardianLinks.email, used.email),
                isNull(guardianLinks.revokedAt),
              ),
            );
          await tx.insert(consentRecords).values({
            learnerId: used.userId,
            schoolId: null,
            scope: 'platform_use',
            grantedBy: 'guardian',
            policyVersion: INDIVIDUAL_LEARNER_POLICY_VERSION,
            // The guardian has no account; the learner's own account records it.
            recordedBy: used.userId,
          });
          return used;
        });
        if (!approved) return reply.code(404).send({ error: 'link-not-working' });
        await audit(database, {
          actorId: approved.userId,
          action: 'auth.guardian-approved',
          targetType: 'user',
          targetId: approved.userId,
        });
        return { ok: true };
      },
    );

    /** Sends the verification or approval link again. The same answer whatever is found. */
    app.post(
      '/v1/auth/resend',
      {
        ...strict,
        schema: { body: Type.Object({ identifier: Identifier }, { additionalProperties: false }) },
      },
      async (request, reply) => {
        const account = await findAccount(request.body.identifier);
        if (account?.kind === 'adult' && account.email && account.emailVerifiedAt === null) {
          if (!(await isStaff(database, account.id))) {
            const token = await issueEmailToken(database.db, {
              userId: account.id,
              purpose: 'verify-email',
              email: account.email,
            });
            await send(mail.verify(account.email, account.displayName, token));
          }
        } else if (account?.kind === 'learner' && account.username) {
          const guardian = await pendingGuardian(account.id);
          if (guardian) {
            const token = await issueEmailToken(database.db, {
              userId: account.id,
              purpose: 'approve-learner',
              email: guardian.email,
            });
            await send(mail.approve(guardian.email, account.displayName, account.username, token));
          }
        }
        return reply.code(202).send(accepted);
      },
    );

    /**
     * A reset link: to the adult's confirmed email, or to the guardian who
     * approved a learner's account. Class learners have no email; their teacher
     * gives them a new key. The same answer whatever is found.
     */
    app.post(
      '/v1/auth/forgot-password',
      {
        ...strict,
        schema: { body: Type.Object({ identifier: Identifier }, { additionalProperties: false }) },
      },
      async (request, reply) => {
        const account = await findAccount(request.body.identifier);
        if (account?.kind === 'adult' && account.email && account.emailVerifiedAt !== null) {
          const token = await issueEmailToken(database.db, {
            userId: account.id,
            purpose: 'reset-password',
            email: account.email,
          });
          await send(mail.reset(account.email, account.displayName, token, false));
        } else if (account?.kind === 'learner' && account.username) {
          const guardian = await approvedGuardian(database, account.id);
          if (guardian) {
            const token = await issueEmailToken(database.db, {
              userId: account.id,
              purpose: 'reset-password',
              email: guardian.email,
            });
            await send(mail.reset(guardian.email, account.displayName, token, true));
          }
        }
        if (account) await audit(database, { actorId: account.id, action: 'auth.forgot-password' });
        return reply.code(202).send(accepted);
      },
    );

    /** A new password from a reset link. Every session ends; the person signs in again. */
    app.post(
      '/v1/auth/reset-password',
      {
        ...strict,
        schema: {
          body: Type.Object({ token: Token, password: Password }, { additionalProperties: false }),
        },
      },
      async (request, reply) => {
        const passwordHash = await hashPassword(request.body.password);
        const used = await useEmailToken(database.db, request.body.token, 'reset-password');
        if (!used) return reply.code(404).send({ error: 'link-not-working' });
        await database.db.update(users).set({ passwordHash }).where(eq(users.id, used.userId));
        await endAllSessions(database, used.userId);
        await audit(database, { actorId: used.userId, action: 'auth.reset-password' });
        return { ok: true };
      },
    );
  };
}
