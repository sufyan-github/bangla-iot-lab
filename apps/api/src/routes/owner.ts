import { Type } from '@fastify/type-provider-typebox';
import { and, count, desc, eq, inArray, isNotNull, isNull, sql, type SQL } from 'drizzle-orm';
import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import type { AppDependencies } from '../app';
import { requireOwner } from '../auth/access';
import { issueEmailToken } from '../auth/email-tokens';
import { audit, endAllSessions } from '../auth/session';
import {
  auditLogs,
  classEnrollments,
  classes,
  guardianLinks,
  schoolMemberships,
  schools,
  users,
} from '../db/schema';

/**
 * The lab owner's panel (D-097): every school and every person, and the few
 * things only the owner may do to them. Only a platform admin may call these;
 * every change is written to the audit log with the owner as actor.
 *
 * What the owner sees is what running the lab needs, no more: names, emails of
 * adults, whether an email is confirmed; for learners, their nickname, their
 * own sign-in name if they have one, and whether a guardian approved. A
 * guardian's email is shown only in part.
 */
const PAGE = 50;
/** A reset link the owner hands on by hand works this long. */
const OWNER_RESET_MS = 24 * 60 * 60 * 1000;

const Id = Type.String({ format: 'uuid' });
const Search = Type.Optional(Type.String({ maxLength: 80 }));
const Offset = Type.Optional(Type.Integer({ minimum: 0, maximum: 100_000 }));

/** "ma@example.test" as "m…@example.test": enough to recognise, not to copy. */
function maskEmail(email: string): string {
  const [name, domain] = email.split('@');
  return `${name!.slice(0, 1)}…@${domain}`;
}

export function ownerRoutes(deps: AppDependencies): FastifyPluginAsyncTypebox {
  const { database, config } = deps;

  /** Accounts the panel never suspends or closes: the owner's own, and other owners'. */
  async function protectedAccount(ownerId: string, userId: string) {
    if (ownerId === userId) return true;
    const [row] = await database.db
      .select({ role: users.platformRole })
      .from(users)
      .where(eq(users.id, userId));
    return row?.role === 'platform_admin';
  }

  return async (app) => {
    app.get('/v1/owner/overview', async (request, reply) => {
      if (!(await requireOwner(database, request, reply))) return;
      const schoolRows = await database.db
        .select({
          status: schools.status,
          closed: sql<boolean>`${schools.archivedAt} is not null`,
          n: count(),
        })
        .from(schools)
        .groupBy(schools.status, sql`${schools.archivedAt} is not null`);
      const staffIds = database.db
        .selectDistinct({ id: schoolMemberships.userId })
        .from(schoolMemberships)
        .where(isNull(schoolMemberships.endedAt));
      const [people] = await database.db
        .select({
          staff:
            sql<number>`count(*) filter (where ${users.kind} = 'adult' and ${users.id} in (${staffIds}))`.mapWith(
              Number,
            ),
          adults:
            sql<number>`count(*) filter (where ${users.kind} = 'adult' and ${users.id} not in (${staffIds}))`.mapWith(
              Number,
            ),
          ownLearners:
            sql<number>`count(*) filter (where ${users.kind} = 'learner' and ${users.username} is not null)`.mapWith(
              Number,
            ),
          classLearners:
            sql<number>`count(*) filter (where ${users.kind} = 'learner' and ${users.username} is null)`.mapWith(
              Number,
            ),
          suspended: sql<number>`count(*) filter (where ${users.suspendedAt} is not null)`.mapWith(
            Number,
          ),
          newThisWeek:
            sql<number>`count(*) filter (where ${users.createdAt} > now() - interval '7 days')`.mapWith(
              Number,
            ),
        })
        .from(users)
        .where(isNull(users.deactivatedAt));
      const tally = { pending: 0, active: 0, suspended: 0, closed: 0 };
      for (const row of schoolRows) {
        if (row.closed) tally.closed += Number(row.n);
        else tally[row.status] += Number(row.n);
      }
      return { schools: tally, people };
    });

    app.get(
      '/v1/owner/schools',
      {
        schema: {
          querystring: Type.Object({
            q: Search,
            status: Type.Optional(
              Type.Union([
                Type.Literal('pending'),
                Type.Literal('active'),
                Type.Literal('suspended'),
                Type.Literal('closed'),
              ]),
            ),
            offset: Offset,
          }),
        },
      },
      async (request, reply) => {
        if (!(await requireOwner(database, request, reply))) return;
        const { q, status, offset = 0 } = request.query;
        const where: SQL[] = [];
        if (q) where.push(sql`${schools.name} ilike ${`%${q}%`}`);
        if (status === 'closed') where.push(isNotNull(schools.archivedAt));
        else if (status) where.push(and(eq(schools.status, status), isNull(schools.archivedAt))!);
        const rows = await database.db
          .select({
            id: schools.id,
            name: schools.name,
            district: schools.district,
            status: schools.status,
            closedAt: schools.archivedAt,
            createdAt: schools.createdAt,
            total: sql<number>`count(*) over ()`.mapWith(Number),
          })
          .from(schools)
          .where(where.length ? and(...where) : undefined)
          .orderBy(desc(schools.createdAt))
          .limit(PAGE)
          .offset(offset);
        const ids = rows.map((row) => row.id);
        const staff = ids.length
          ? await database.db
              .select({
                schoolId: schoolMemberships.schoolId,
                role: schoolMemberships.role,
                name: users.displayName,
                email: users.email,
              })
              .from(schoolMemberships)
              .innerJoin(users, eq(users.id, schoolMemberships.userId))
              .where(
                and(inArray(schoolMemberships.schoolId, ids), isNull(schoolMemberships.endedAt)),
              )
          : [];
        const classCounts = ids.length
          ? await database.db
              .select({
                schoolId: classes.schoolId,
                classes: sql<number>`count(distinct ${classes.id})`.mapWith(Number),
                learners:
                  sql<number>`count(distinct ${classEnrollments.learnerId}) filter (where ${classEnrollments.revokedAt} is null)`.mapWith(
                    Number,
                  ),
              })
              .from(classes)
              .leftJoin(classEnrollments, eq(classEnrollments.classId, classes.id))
              .where(and(inArray(classes.schoolId, ids), isNull(classes.archivedAt)))
              .groupBy(classes.schoolId)
          : [];
        return {
          total: rows[0]?.total ?? 0,
          limit: PAGE,
          schools: rows.map(({ total: _total, ...row }) => {
            const counts = classCounts.find((c) => c.schoolId === row.id);
            const members = staff.filter((m) => m.schoolId === row.id);
            return {
              ...row,
              teachers: members.filter((m) => m.role === 'teacher').length,
              admins: members
                .filter((m) => m.role === 'school_admin')
                .map((m) => ({ name: m.name, email: m.email })),
              classes: counts?.classes ?? 0,
              learners: counts?.learners ?? 0,
            };
          }),
        };
      },
    );

    /** Start, suspend, close or reopen a school. */
    app.post(
      '/v1/owner/schools/:id/:action',
      {
        schema: {
          params: Type.Object({
            id: Id,
            action: Type.Union([
              Type.Literal('activate'),
              Type.Literal('suspend'),
              Type.Literal('close'),
              Type.Literal('reopen'),
            ]),
          }),
        },
      },
      async (request, reply) => {
        const owner = await requireOwner(database, request, reply);
        if (!owner) return;
        const { id, action } = request.params;
        const change =
          action === 'activate'
            ? { status: 'active' as const }
            : action === 'suspend'
              ? { status: 'suspended' as const }
              : action === 'close'
                ? { archivedAt: new Date() }
                : { archivedAt: null, status: 'active' as const };
        const [changed] = await database.db
          .update(schools)
          .set(change)
          .where(eq(schools.id, id))
          .returning({ id: schools.id });
        if (!changed) return reply.code(404).send({ error: 'no-such-school' });
        await audit(database, {
          actorId: owner.userId,
          schoolId: id,
          action: `owner.school-${action}`,
          targetType: 'school',
          targetId: id,
        });
        return { ok: true };
      },
    );

    app.get(
      '/v1/owner/people',
      {
        schema: {
          querystring: Type.Object({
            q: Search,
            kind: Type.Optional(
              Type.Union([
                Type.Literal('staff'),
                Type.Literal('individual'),
                Type.Literal('learner'),
                Type.Literal('class'),
              ]),
            ),
            status: Type.Optional(Type.Union([Type.Literal('suspended'), Type.Literal('closed')])),
            offset: Offset,
          }),
        },
      },
      async (request, reply) => {
        if (!(await requireOwner(database, request, reply))) return;
        const { q, kind, status, offset = 0 } = request.query;
        const staffIds = database.db
          .selectDistinct({ id: schoolMemberships.userId })
          .from(schoolMemberships)
          .where(isNull(schoolMemberships.endedAt));
        const where: SQL[] = [];
        if (q) {
          const like = `%${q}%`;
          where.push(
            sql`(${users.displayName} ilike ${like} or ${users.email} ilike ${like} or ${users.username} ilike ${like})`,
          );
        }
        // People on their own: adults in no school, and learners with their own sign-in name.
        if (kind === 'staff')
          where.push(sql`${users.kind} = 'adult' and ${users.id} in (${staffIds})`);
        if (kind === 'individual')
          where.push(sql`${users.kind} = 'adult' and ${users.id} not in (${staffIds})`);
        if (kind === 'learner')
          where.push(sql`${users.kind} = 'learner' and ${users.username} is not null`);
        if (kind === 'class')
          where.push(sql`${users.kind} = 'learner' and ${users.username} is null`);
        if (status === 'suspended') where.push(isNotNull(users.suspendedAt));
        if (status === 'closed') where.push(isNotNull(users.deactivatedAt));
        else where.push(isNull(users.deactivatedAt));
        const rows = await database.db
          .select({
            id: users.id,
            kind: users.kind,
            displayName: users.displayName,
            email: users.email,
            emailVerified: sql<boolean>`${users.emailVerifiedAt} is not null`,
            username: users.username,
            platformRole: users.platformRole,
            createdAt: users.createdAt,
            suspendedAt: users.suspendedAt,
            closedAt: users.deactivatedAt,
            staff: sql<boolean>`${users.id} in (${staffIds})`,
            total: sql<number>`count(*) over ()`.mapWith(Number),
          })
          .from(users)
          .where(and(...where))
          .orderBy(desc(users.createdAt))
          .limit(PAGE)
          .offset(offset);
        const ids = rows.map((row) => row.id);
        const memberships = ids.length
          ? await database.db
              .select({
                userId: schoolMemberships.userId,
                school: schools.name,
                role: schoolMemberships.role,
              })
              .from(schoolMemberships)
              .innerJoin(schools, eq(schools.id, schoolMemberships.schoolId))
              .where(and(inArray(schoolMemberships.userId, ids), isNull(schoolMemberships.endedAt)))
          : [];
        const enrolled = ids.length
          ? await database.db
              .select({ learnerId: classEnrollments.learnerId, n: count() })
              .from(classEnrollments)
              .where(
                and(inArray(classEnrollments.learnerId, ids), isNull(classEnrollments.revokedAt)),
              )
              .groupBy(classEnrollments.learnerId)
          : [];
        const guardians = ids.length
          ? await database.db
              .select({
                learnerId: guardianLinks.learnerId,
                email: guardianLinks.email,
                approved: sql<boolean>`${guardianLinks.approvedAt} is not null`,
              })
              .from(guardianLinks)
              .where(and(inArray(guardianLinks.learnerId, ids), isNull(guardianLinks.revokedAt)))
          : [];
        return {
          total: rows[0]?.total ?? 0,
          limit: PAGE,
          people: rows.map(({ total: _total, staff, ...row }) => {
            const guardian = guardians.find((g) => g.learnerId === row.id);
            return {
              ...row,
              account:
                row.kind === 'adult'
                  ? staff
                    ? 'staff'
                    : 'individual'
                  : row.username
                    ? 'individual'
                    : 'class',
              schools: memberships
                .filter((m) => m.userId === row.id)
                .map((m) => ({ school: m.school, role: m.role })),
              classes: enrolled.find((e) => e.learnerId === row.id)?.n ?? 0,
              guardian: guardian
                ? { email: maskEmail(guardian.email), approved: guardian.approved }
                : null,
            };
          }),
        };
      },
    );

    /** Suspend, restore or close an account; never the owner's own or another owner's. */
    app.post(
      '/v1/owner/people/:id/:action',
      {
        schema: {
          params: Type.Object({
            id: Id,
            action: Type.Union([
              Type.Literal('suspend'),
              Type.Literal('restore'),
              Type.Literal('close'),
              Type.Literal('reset-link'),
            ]),
          }),
        },
      },
      async (request, reply) => {
        const owner = await requireOwner(database, request, reply);
        if (!owner) return;
        const { id, action } = request.params;
        const [person] = await database.db
          .select({
            id: users.id,
            kind: users.kind,
            email: users.email,
            username: users.username,
            closedAt: users.deactivatedAt,
          })
          .from(users)
          .where(eq(users.id, id));
        if (!person) return reply.code(404).send({ error: 'no-such-person' });
        if (person.closedAt !== null) return reply.code(409).send({ error: 'account-closed' });

        if (action === 'reset-link') {
          // A link for the owner to hand on by hand: to an adult, or to a learner's guardian.
          // A class learner has no password; their teacher gives a new key.
          if (person.kind === 'learner' && !person.username) {
            return reply.code(409).send({ error: 'class-learner' });
          }
          const token = await issueEmailToken(database.db, {
            userId: person.id,
            purpose: 'reset-password',
            email: person.email ?? 'given-by-owner',
            lifetimeMs: OWNER_RESET_MS,
          });
          await audit(database, {
            actorId: owner.userId,
            action: 'owner.reset-link',
            targetType: 'user',
            targetId: id,
          });
          return {
            link: `${config.webOrigin}/account/reset#${token}`,
            expiresAt: new Date(Date.now() + OWNER_RESET_MS).toISOString(),
          };
        }

        if (await protectedAccount(owner.userId, id)) {
          return reply.code(409).send({ error: 'protected-account' });
        }
        const now = new Date();
        if (action === 'suspend') {
          await database.db.update(users).set({ suspendedAt: now }).where(eq(users.id, id));
        } else if (action === 'restore') {
          await database.db.update(users).set({ suspendedAt: null }).where(eq(users.id, id));
        } else {
          // Closed for good: no sign-in by any means; its data waits for the retention job.
          await database.db
            .update(users)
            .set({ deactivatedAt: now, signInKeyHash: null })
            .where(eq(users.id, id));
        }
        if (action !== 'restore') await endAllSessions(database, id);
        await audit(database, {
          actorId: owner.userId,
          action: `owner.${action}`,
          targetType: 'user',
          targetId: id,
        });
        return { ok: true };
      },
    );

    /** The latest things done, newest first: who, what, to which kind of thing. Identifiers only. */
    app.get('/v1/owner/activity', async (request, reply) => {
      if (!(await requireOwner(database, request, reply))) return;
      const rows = await database.db
        .select({
          at: auditLogs.occurredAt,
          action: auditLogs.action,
          actor: users.displayName,
          targetType: auditLogs.targetType,
          targetId: auditLogs.targetId,
          school: schools.name,
        })
        .from(auditLogs)
        .leftJoin(users, eq(users.id, auditLogs.actorId))
        .leftJoin(schools, eq(schools.id, auditLogs.schoolId))
        .orderBy(desc(auditLogs.occurredAt))
        .limit(100);
      return { entries: rows };
    });
  };
}
