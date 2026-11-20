import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import Fastify from 'fastify';
import { Type } from 'typebox';
import { Compiler, QueueFullError } from './compiler';
import type { WorkerConfig } from './config';
import { assertSandboxWorks } from './sandbox';

async function detectToolchain(): Promise<string> {
  const { stdout } = await promisify(execFile)('avr-gcc', ['-dumpfullversion']).catch(() => {
    throw new Error('avr-gcc is not installed (needed: avr-gcc, avr-libc, binutils-avr)');
  });
  return `avr-gcc ${stdout.trim()}`;
}

/**
 * The compile worker: turns submitted source into firmware. It holds no
 * secrets and no database access, and is only ever called by the API.
 */
export async function buildServer(config: WorkerConfig) {
  const toolchain = await detectToolchain();
  const probeDir = await mkdtemp(path.join(tmpdir(), 'banglalab-probe-'));
  try {
    await assertSandboxWorks(config.sandbox, probeDir);
  } finally {
    await rm(probeDir, { recursive: true, force: true });
  }

  const compiler = new Compiler(config, toolchain);
  const app = Fastify({
    logger: { level: config.logLevel },
    bodyLimit: config.maxSourceBytes * 2,
  }).withTypeProvider<TypeBoxTypeProvider>();

  if (config.sandbox === 'none') {
    app.log.warn('COMPILE_SANDBOX=none: submitted code is compiled WITHOUT isolation. Development only.');
  }

  app.get('/health', async () => ({ status: 'ok', sandbox: config.sandbox, toolchain }));

  app.post(
    '/compile',
    {
      schema: {
        body: Type.Object(
          {
            board: Type.Literal('uno'),
            language: Type.Literal('c'),
            source: Type.String({ minLength: 1, maxLength: config.maxSourceBytes }),
          },
          { additionalProperties: false },
        ),
      },
    },
    async (request, reply) => {
      try {
        return await compiler.compile(request.body);
      } catch (error) {
        if (error instanceof QueueFullError) {
          return reply.code(503).header('retry-after', '5').send({ error: 'busy' });
        }
        throw error;
      }
    },
  );

  return app;
}
