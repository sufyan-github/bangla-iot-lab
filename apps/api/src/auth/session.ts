import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Database } from '../db/client';
import { auditLogs, sessions, users } from '../db/schema';

/**
 * Sessions: a random token in an HttpOnly cookie, its SHA-256 in the database.
 * By default the cookie lasts only until the browser closes (and the server
 * gives up on it after 12 hours), which is safe on a shared computer. With
 * "keep me signed in on this device" it lasts 30 days. Either way it ends
 * when the user signs out.
 */
export const SESSION_COOKIE = 'bl_session';
export const SESSION_DAYS = 30;
/** How long a browser-session sign-in is honoured at most, in hours. */
export const SHORT_SESSION_HOURS = 12;

const hashToken = (token: string) => createHash('sha256').update(token).digest('base64url');

export async function startSession(
  database: Database,
  reply: FastifyReply,
  userId: string,
  secure: boolean,
  persistent = false,
): Promise<void> {
  const token = randomBytes(32).toString('base64url');
  const lifetimeMs = persistent
    ? SESSION_DAYS * 24 * 60 * 60 * 1000
    : SHORT_SESSION_HOURS * 60 * 60 * 1000;
  const expiresAt = new Date(Date.now() + lifetimeMs);
  await database.db
    .insert(sessions)
    .values({ userId, tokenHash: hashToken(token), expiresAt, persistent });
  // Without Max-Age the browser forgets the cookie when it closes.
  const maxAge = persistent ? `; Max-Age=${SESSION_DAYS * 86400}` : '';
  reply.header(
    'set-cookie',
    `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax${maxAge}${secure ? '; Secure' : ''}`,
  );
}

/** Ends every session of a user, as after a password reset. */
export async function endAllSessions(database: Database, userId: string): Promise<void> {
  await database.db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
}

export function clearSessionCookie(reply: FastifyReply, secure: boolean): void {
  reply.header(
    'set-cookie',
    `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`,
  );
}

/** The session token in the request's cookie, if any. */
export function sessionToken(request: FastifyRequest): string | null {
  const header = request.headers.cookie ?? '';
  for (const part of header.split(';')) {
    const [name, ...value] = part.trim().split('=');
    if (name === SESSION_COOKIE) return value.join('=') || null;
  }
  return null;
}

export interface SignedIn {
  sessionId: string;
  userId: string;
  kind: 'adult' | 'learner';
  displayName: string;
  locale: string;
}

/** Who the request is from, or null when it has no live session. */
export async function signedIn(
  database: Database,
  request: FastifyRequest,
): Promise<SignedIn | null> {
  const token = sessionToken(request);
  if (!token) return null;
  const [row] = await database.db
    .select({
      sessionId: sessions.id,
      userId: users.id,
      kind: users.kind,
      displayName: users.displayName,
      locale: users.locale,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(
        eq(sessions.tokenHash, hashToken(token)),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, new Date()),
        isNull(users.deactivatedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function endSession(database: Database, sessionId: string): Promise<void> {
  await database.db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(eq(sessions.id, sessionId));
}

/** Records a security-relevant action: identifiers only, never content. */
export async function audit(
  database: Database,
  entry: {
    actorId?: string | null;
    schoolId?: string | null;
    action: string;
    targetType?: string;
    targetId?: string;
  },
): Promise<void> {
  await database.db.insert(auditLogs).values({
    actorId: entry.actorId ?? null,
    schoolId: entry.schoolId ?? null,
    action: entry.action,
    targetType: entry.targetType ?? null,
    targetId: entry.targetId ?? null,
  });
}
