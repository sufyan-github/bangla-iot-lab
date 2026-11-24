import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { Database } from '../db/client';
import { emailTokens } from '../db/schema';

/**
 * One-time links sent by email. The token is 32 random bytes; only its SHA-256
 * is stored. A new link for the same account and purpose cancels the older
 * ones, and a link works once, before it expires.
 */
export type EmailTokenPurpose =
  'verify-email' | 'approve-learner' | 'reset-password' | 'close-account';

/** How long each kind of link works. */
export const TOKEN_LIFETIME_MS: Record<EmailTokenPurpose, number> = {
  'verify-email': 48 * 60 * 60 * 1000,
  'approve-learner': 7 * 24 * 60 * 60 * 1000,
  'reset-password': 60 * 60 * 1000,
  'close-account': 24 * 60 * 60 * 1000,
};

const hash = (token: string) => createHash('sha256').update(token).digest('base64url');

type Writer = Pick<Database['db'], 'insert' | 'update'>;

export async function issueEmailToken(
  db: Writer,
  entry: { userId: string; purpose: EmailTokenPurpose; email: string; lifetimeMs?: number },
): Promise<string> {
  const now = new Date();
  await db
    .update(emailTokens)
    .set({ usedAt: now })
    .where(
      and(
        eq(emailTokens.userId, entry.userId),
        eq(emailTokens.purpose, entry.purpose),
        isNull(emailTokens.usedAt),
      ),
    );
  const token = randomBytes(32).toString('base64url');
  await db.insert(emailTokens).values({
    userId: entry.userId,
    purpose: entry.purpose,
    email: entry.email,
    tokenHash: hash(token),
    expiresAt: new Date(now.getTime() + (entry.lifetimeMs ?? TOKEN_LIFETIME_MS[entry.purpose])),
  });
  return token;
}

/** The link's details while it still works, without using it up. */
export async function peekEmailToken(database: Database, token: string) {
  const [row] = await database.db
    .select({
      id: emailTokens.id,
      userId: emailTokens.userId,
      purpose: emailTokens.purpose,
      email: emailTokens.email,
    })
    .from(emailTokens)
    .where(
      and(
        eq(emailTokens.tokenHash, hash(token)),
        isNull(emailTokens.usedAt),
        gt(emailTokens.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Uses the link up, if it still works and is for this purpose. Returns its
 * account and address, or null. Two requests with the same link cannot both
 * succeed: only one update finds it unused.
 */
export async function useEmailToken(
  db: Pick<Database['db'], 'update'>,
  token: string,
  purpose: EmailTokenPurpose,
): Promise<{ userId: string; email: string } | null> {
  const [row] = await db
    .update(emailTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(emailTokens.tokenHash, hash(token)),
        eq(emailTokens.purpose, purpose),
        isNull(emailTokens.usedAt),
        gt(emailTokens.expiresAt, new Date()),
      ),
    )
    .returning({ userId: emailTokens.userId, email: emailTokens.email });
  return row ?? null;
}
