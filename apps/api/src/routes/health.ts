import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { AppDependencies } from '../app';

export function registerHealthRoutes(app: FastifyInstance, deps: AppDependencies) {
  /** Liveness: the process is up. */
  app.get('/health', async () => ({ status: 'ok' }));

  /** Readiness: the services this API depends on are reachable. */
  app.get('/ready', async (_request, reply) => {
    const [database, compiler] = await Promise.all([
      deps.database.db.execute(sql`select 1`).then(
        () => 'ok' as const,
        () => 'unreachable' as const,
      ),
      deps
        .fetch(`${deps.config.compileWorkerUrl}/health`, { signal: AbortSignal.timeout(2_000) })
        .then(
          (response) => (response.ok ? ('ok' as const) : ('unreachable' as const)),
          () => 'unreachable' as const,
        ),
    ]);
    // The lab works without the compiler (it is only needed for text-code builds),
    // so only the database decides readiness.
    return reply.code(database === 'ok' ? 200 : 503).send({ database, compiler });
  });
}
