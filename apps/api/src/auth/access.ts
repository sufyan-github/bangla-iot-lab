import { and, eq, isNull } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Database } from '../db/client';
import { classes, schoolMemberships } from '../db/schema';
import { signedIn, type SignedIn } from './session';

/** The signed-in user, or a 401 sent and null. */
export async function requireUser(
  database: Database,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<SignedIn | null> {
  const who = await signedIn(database, request);
  if (!who) {
    await reply.code(401).send({ error: 'signed-out' });
    return null;
  }
  return who;
}

/** True when the user teaches in the school. */
export async function teachesIn(database: Database, userId: string, schoolId: string) {
  const rows = await database.db
    .select({ id: schoolMemberships.id })
    .from(schoolMemberships)
    .where(
      and(
        eq(schoolMemberships.userId, userId),
        eq(schoolMemberships.schoolId, schoolId),
        eq(schoolMemberships.role, 'teacher'),
        isNull(schoolMemberships.endedAt),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/** A class the user teaches and has not archived, or null. */
export async function ownClass(database: Database, userId: string, classId: string) {
  const [row] = await database.db
    .select()
    .from(classes)
    .where(and(eq(classes.id, classId), eq(classes.teacherId, userId), isNull(classes.archivedAt)))
    .limit(1);
  return row ?? null;
}
