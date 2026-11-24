import { Type, type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { and, desc, eq, isNull, max } from 'drizzle-orm';
import type { AppDependencies } from '../app';
import { requireUser } from '../auth/access';
import { projectVersions, projects } from '../db/schema';

/** The largest project document kept, as JSON text; compiled firmware is not sent. */
export const MAX_DOCUMENT_BYTES = 1024 * 1024;
/** How many projects one person may keep in the cloud. */
export const MAX_PROJECTS = 200;

/**
 * A project as the lab saves it: the circuit, the programs' source and the
 * logic sheet. Checked only for shape here; the lab checks it fully when it
 * opens it, as it does for a project saved on the device.
 */
const ProjectDocument = Type.Object({
  name: Type.String({ maxLength: 80 }),
  circuit: Type.Object(
    { schemaVersion: Type.Integer({ minimum: 1 }) },
    { additionalProperties: true },
  ),
  programs: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  sheet: Type.Optional(Type.Unknown()),
});
const ProjectId = Type.Object({ id: Type.String({ format: 'uuid' }) });

/**
 * Projects kept in the cloud, so that work follows a person between devices.
 * Each save adds a version; nothing is rewritten, and removing only hides it.
 */
export function projectRoutes(deps: AppDependencies): FastifyPluginAsyncTypebox {
  const { database } = deps;

  /** The person's own project that is not removed, or null. */
  const own = async (userId: string, id: string) => {
    const [row] = await database.db
      .select()
      .from(projects)
      .where(and(eq(projects.id, id), eq(projects.ownerId, userId), isNull(projects.deletedAt)))
      .limit(1);
    return row ?? null;
  };

  return async (app) => {
    /** Saves a project: a new one, or (with `id`) a new version of one already kept. */
    app.post(
      '/v1/projects',
      {
        bodyLimit: MAX_DOCUMENT_BYTES + 4096,
        schema: {
          body: Type.Object(
            { id: Type.Optional(Type.String({ format: 'uuid' })), document: ProjectDocument },
            { additionalProperties: false },
          ),
        },
      },
      async (request, reply) => {
        const who = await requireUser(database, request, reply);
        if (!who) return;
        const { document } = request.body;
        if (JSON.stringify(document).length > MAX_DOCUMENT_BYTES) {
          return reply.code(413).send({ error: 'too-large' });
        }
        const title = document.name.trim() || '—';
        let projectId = request.body.id;
        if (projectId) {
          if (!(await own(who.userId, projectId)))
            return reply.code(404).send({ error: 'no-such-project' });
        } else {
          const kept = await database.db
            .select({ id: projects.id })
            .from(projects)
            .where(and(eq(projects.ownerId, who.userId), isNull(projects.deletedAt)));
          if (kept.length >= MAX_PROJECTS)
            return reply.code(409).send({ error: 'too-many-projects' });
        }
        const version = await database.db.transaction(async (tx) => {
          if (!projectId) {
            const [made] = await tx
              .insert(projects)
              .values({ ownerId: who.userId, title })
              .returning({ id: projects.id });
            projectId = made!.id;
          } else {
            await tx
              .update(projects)
              .set({ title, updatedAt: new Date() })
              .where(eq(projects.id, projectId));
          }
          const [{ latest } = { latest: 0 }] = await tx
            .select({ latest: max(projectVersions.version) })
            .from(projectVersions)
            .where(eq(projectVersions.projectId, projectId));
          const next = (latest ?? 0) + 1;
          await tx.insert(projectVersions).values({
            projectId,
            version: next,
            schemaVersion: document.circuit.schemaVersion,
            document,
          });
          return next;
        });
        return reply.code(201).send({ id: projectId, version });
      },
    );

    /** The person's projects in the cloud, newest first. */
    app.get('/v1/projects', async (request, reply) => {
      const who = await requireUser(database, request, reply);
      if (!who) return;
      const rows = await database.db
        .select({
          id: projects.id,
          title: projects.title,
          updatedAt: projects.updatedAt,
          version: max(projectVersions.version),
        })
        .from(projects)
        .leftJoin(projectVersions, eq(projectVersions.projectId, projects.id))
        .where(and(eq(projects.ownerId, who.userId), isNull(projects.deletedAt)))
        .groupBy(projects.id)
        .orderBy(desc(projects.updatedAt));
      return { projects: rows };
    });

    /** A project's newest version. */
    app.get('/v1/projects/:id', { schema: { params: ProjectId } }, async (request, reply) => {
      const who = await requireUser(database, request, reply);
      if (!who) return;
      const project = await own(who.userId, request.params.id);
      if (!project) return reply.code(404).send({ error: 'no-such-project' });
      const [latest] = await database.db
        .select({ version: projectVersions.version, document: projectVersions.document })
        .from(projectVersions)
        .where(eq(projectVersions.projectId, project.id))
        .orderBy(desc(projectVersions.version))
        .limit(1);
      return { id: project.id, title: project.title, ...latest };
    });

    /** Takes a project out of the cloud list; the retention job removes it later. */
    app.post(
      '/v1/projects/:id/remove',
      { schema: { params: ProjectId } },
      async (request, reply) => {
        const who = await requireUser(database, request, reply);
        if (!who) return;
        const project = await own(who.userId, request.params.id);
        if (!project) return reply.code(404).send({ error: 'no-such-project' });
        await database.db
          .update(projects)
          .set({ deletedAt: new Date() })
          .where(eq(projects.id, project.id));
        return { ok: true };
      },
    );
  };
}
