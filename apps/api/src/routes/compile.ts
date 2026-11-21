import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { Type } from 'typebox';
import type { AppDependencies } from '../app';

const source = Type.String({ minLength: 1, maxLength: 64 * 1024 });
const CompileBody = Type.Union([
  Type.Object(
    {
      board: Type.Literal('uno'),
      language: Type.Union([Type.Literal('c'), Type.Literal('arduino')]),
      source,
    },
    { additionalProperties: false },
  ),
  // The ESP32 board (experimental) takes Arduino sketches only.
  Type.Object(
    { board: Type.Literal('esp32'), language: Type.Literal('arduino'), source },
    { additionalProperties: false },
  ),
]);

/**
 * POST /v1/compile: validates the request and passes it to the compile worker.
 * The API process itself never compiles or runs submitted code.
 *
 * Phase 0 has no accounts yet, so this route is protected by rate limiting
 * only and the API listens on localhost. It must sit behind authentication
 * before the API is exposed to a network (tracked in docs/decisions).
 */
export const compileRoutes =
  (deps: AppDependencies): FastifyPluginAsyncTypebox =>
  async (app) => {
    app.post(
      '/v1/compile',
      {
        schema: { body: CompileBody },
        config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
      },
      async (request, reply) => {
        let response: Response;
        try {
          response = await deps.fetch(`${deps.config.compileWorkerUrl}/compile`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(request.body),
            signal: AbortSignal.timeout(30_000),
          });
        } catch (error) {
          request.log.error({ err: error }, 'compile worker unreachable');
          return reply.code(503).send({ error: 'compiler-unavailable' });
        }
        if (response.status === 503) {
          return reply.code(503).header('retry-after', '5').send({ error: 'compiler-busy' });
        }
        if (!response.ok) {
          request.log.error({ status: response.status }, 'compile worker error');
          return reply.code(502).send({ error: 'compiler-error' });
        }
        return reply.send(await response.json());
      },
    );
  };
