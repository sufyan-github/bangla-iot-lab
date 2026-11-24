import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Database } from '../db/client';
import { auditLogs, sessions, users } from '../db/schema';

/**
 * Sessions: a random token in an HttpOnly cookie, its SHA-256 in the database.
 * A session lasts 30 days unless the user signs out.
 */
export const SESSION_COOKIE = 'bl_session';
export const SESSION_DAYS = 30;

const hashToken = (token: string) => createHash('sha256').update(token).digest('base64url');

export async function startSession(
  database: Database,
  reply: FastifyReply,
  userId: string,
  secure: boolean,
): Promise<void> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await database.db.insert(sessions).values({ userId, tokenHash: hashToken(token), expiresAt });
  reply.header(
    'set-cookie',
    `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure ? '; Secure' : ''}`,
  );
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
