import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import Fastify from 'fastify';
import type { ApiConfig } from './config';
import type { Database } from './db/client';
import { LocalMailbox, type Mailer } from './mail';
import { authRoutes } from './routes/auth';
import { individualRoutes } from './routes/individuals';
import { ownerRoutes } from './routes/owner';
import { classRoutes } from './routes/classes';
import { learnerRoutes } from './routes/learners';
import { lessonRoutes } from './routes/lessons';
import { projectRoutes } from './routes/projects';
import { schoolRoutes } from './routes/schools';
import { compileRoutes } from './routes/compile';
import { registerHealthRoutes } from './routes/health';

export interface AppDependencies {
  config: ApiConfig;
  database: Database;
  /** Injected so tests can stand in for the compile worker. */
  fetch: typeof globalThis.fetch;
  /** Sends the lab's emails. */
  mailer: Mailer;
}

export async function buildApp(options: Omit<AppDependencies, 'mailer'> & { mailer?: Mailer }) {
  const deps: AppDependencies = { ...options, mailer: options.mailer ?? new LocalMailbox() };
  const app = Fastify({
    logger: { level: deps.config.logLevel },
    // A number of proxy hops becomes the function Fastify expects for it.
    trustProxy:
      typeof deps.config.trustProxy === 'number'
        ? (
            (hops: number) => (_address: string, hop: number) =>
              hop < hops
          )(deps.config.trustProxy)
        : deps.config.trustProxy,
    bodyLimit: 256 * 1024,
  }).withTypeProvider<TypeBoxTypeProvider>();

  await app.register(cors, {
    origin: deps.config.webOrigin,
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    credentials: true,
  });
  // A request that changes something must come from the lab's own pages: a browser
  // names the page's origin, and another site cannot act with a student's cookie.
  app.addHook('onRequest', async (request, reply) => {
    if (request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS')
      return;
    const origin = request.headers.origin;
    if (origin !== undefined && origin !== deps.config.webOrigin) {
      return reply.code(403).send({ error: 'wrong-origin' });
    }
  });
  await app.register(rateLimit, { max: deps.config.requestsPerMinute, timeWindow: '1 minute' });

  // Validation errors are safe to show; anything else is logged and hidden.
  app.setErrorHandler((error: { statusCode?: number; message: string }, request, reply) => {
    const status = error.statusCode ?? 500;
    // Too many tries from this address: say so, so the page can ask to wait a minute.
    if (status === 429) return reply.code(429).send({ error: 'too-many-tries' });
    if (status >= 500) {
      request.log.error({ err: error }, 'request failed');
      return reply.code(500).send({ error: 'internal-error' });
    }
    return reply.code(status).send({ error: 'bad-request', message: error.message });
  });

  registerHealthRoutes(app, deps);
  await app.register(compileRoutes(deps));
  await app.register(authRoutes(deps));
  await app.register(individualRoutes(deps));
  await app.register(ownerRoutes(deps));
  // Development and browser tests only: the local mailbox, so a test can follow a link.
  if (deps.config.devMailbox && deps.mailer instanceof LocalMailbox) {
    const mailbox = deps.mailer;
    app.get('/v1/dev/mail', async (request) => {
      const to = String((request.query as { to?: string }).to ?? '').toLowerCase();
      return { messages: mailbox.sent.filter((m) => !to || m.to === to) };
    });
  }
  await app.register(classRoutes(deps));
  await app.register(learnerRoutes(deps));
  await app.register(projectRoutes(deps));
  await app.register(lessonRoutes(deps));
  await app.register(schoolRoutes(deps));
  return app;
}
