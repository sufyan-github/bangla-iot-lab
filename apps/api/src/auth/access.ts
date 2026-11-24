import { and, eq, isNull } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Database } from '../db/client';
import { classes, consentRecords, schoolMemberships } from '../db/schema';
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

/** True when the user holds the role in the school now. */
async function holds(
  database: Database,
  userId: string,
  schoolId: string,
  role: 'teacher' | 'school_admin',
) {
  const rows = await database.db
    .select({ id: schoolMemberships.id })
    .from(schoolMemberships)
    .where(
      and(
        eq(schoolMemberships.userId, userId),
        eq(schoolMemberships.schoolId, schoolId),
        eq(schoolMemberships.role, role),
        isNull(schoolMemberships.endedAt),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/**
 * True for a learner who signed up on their own, with a guardian's permission:
 * their account is theirs, not a class's.
 */
export async function onOwnAccount(database: Database, userId: string) {
  const rows = await database.db
    .select({ id: consentRecords.id })
    .from(consentRecords)
    .where(
      and(
        eq(consentRecords.learnerId, userId),
        eq(consentRecords.grantedBy, 'guardian'),
        eq(consentRecords.scope, 'platform_use'),
        isNull(consentRecords.revokedAt),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/** True when the user teaches in the school. */
export const teachesIn = (database: Database, userId: string, schoolId: string) =>
  holds(database, userId, schoolId, 'teacher');

/** True when the user runs the school's account in the lab. */
export const adminOf = (database: Database, userId: string, schoolId: string) =>
  holds(database, userId, schoolId, 'school_admin');

/**
 * A class the user teaches and has not archived, or null. A teacher who has
 * left the class's school no longer has it.
 */
export async function ownClass(database: Database, userId: string, classId: string) {
  const [row] = await database.db
    .select()
    .from(classes)
    .where(and(eq(classes.id, classId), eq(classes.teacherId, userId), isNull(classes.archivedAt)))
    .limit(1);
  if (!row || !(await teachesIn(database, userId, row.schoolId))) return null;
  return row;
}
