import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import Fastify from 'fastify';
import type { ApiConfig } from './config';
import type { Database } from './db/client';
import { compileRoutes } from './routes/compile';
import { registerHealthRoutes } from './routes/health';

export interface AppDependencies {
  config: ApiConfig;
  database: Database;
  /** Injected so tests can stand in for the compile worker. */
  fetch: typeof globalThis.fetch;
}

export async function buildApp(deps: AppDependencies) {
  const app = Fastify({
    logger: { level: deps.config.logLevel },
    bodyLimit: 256 * 1024,
  }).withTypeProvider<TypeBoxTypeProvider>();

  await app.register(cors, { origin: deps.config.webOrigin, methods: ['GET', 'POST'] });
  await app.register(rateLimit, { max: 300, timeWindow: '1 minute' });

  // Validation errors are safe to show; anything else is logged and hidden.
  app.setErrorHandler((error: { statusCode?: number; message: string }, request, reply) => {
    const status = error.statusCode ?? 500;
    if (status >= 500) {
      request.log.error({ err: error }, 'request failed');
      return reply.code(500).send({ error: 'internal-error' });
    }
    return reply.code(status).send({ error: 'bad-request', message: error.message });
  });

  registerHealthRoutes(app, deps);
  await app.register(compileRoutes(deps));
  return app;
}
