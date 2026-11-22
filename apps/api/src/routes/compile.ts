import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { Type } from 'typebox';
import type { AppDependencies } from '../app';

// One flat description, checked further below. A choice between two descriptions
// would let the validator strip a field while it tries the description that does
// not apply, and the request would then be passed on without it.
const CompileBody = Type.Object(
  {
    board: Type.Union([Type.Literal('uno'), Type.Literal('esp32')]),
    language: Type.Union([Type.Literal('c'), Type.Literal('arduino')]),
    /** ESP32 only. `emulator`: real firmware for the chip emulator, not the lab's own board library. */
    engine: Type.Optional(Type.Union([Type.Literal('library'), Type.Literal('emulator')])),
    source: Type.String({ minLength: 1, maxLength: 64 * 1024 }),
  },
  { additionalProperties: false },
);

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
        const { board, language, engine } = request.body;
        // The ESP32 board (experimental) takes Arduino sketches only, and only it has engines.
        if ((board === 'esp32' && language !== 'arduino') || (board === 'uno' && engine)) {
          return reply.code(400).send({ error: 'bad-request' });
        }
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
