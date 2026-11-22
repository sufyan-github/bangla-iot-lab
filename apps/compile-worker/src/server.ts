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
import { findEsp32FirmwareToolchain } from './esp32-firmware';
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
    app.log.warn(
      'COMPILE_SANDBOX=none: submitted code is compiled WITHOUT isolation. Development only.',
    );
  }

  // Build the Arduino core before accepting requests, so the first sketch is not slow.
  // Without the core the worker still serves plain C and says why sketches cannot build.
  const arduino = await compiler.prepareArduino().then(
    () => 'ready' as const,
    (error: Error) => {
      app.log.warn(error.message);
      return 'unavailable' as const;
    },
  );

  // The ESP32 board library is experimental and needs its own toolchain; the worker runs without it.
  const esp32 = await compiler.prepareEsp32().then(
    () => 'ready' as const,
    (error: Error) => {
      app.log.warn(error.message);
      return 'unavailable' as const;
    },
  );

  // Real ESP32 firmware, for the chip emulator: another toolchain again, and optional too.
  // It is prepared on first use, not here: building the core takes about ten seconds.
  const esp32Firmware = () =>
    'missing' in findEsp32FirmwareToolchain() ? ('unavailable' as const) : ('ready' as const);

  app.get('/health', async () => ({
    status: 'ok',
    sandbox: config.sandbox,
    toolchain,
    arduino,
    esp32,
    esp32Firmware: esp32Firmware(),
  }));

  app.post(
    '/compile',
    {
      schema: {
        body: Type.Object(
          {
            board: Type.Union([Type.Literal('uno'), Type.Literal('esp32')]),
            language: Type.Union([Type.Literal('c'), Type.Literal('arduino')]),
            engine: Type.Optional(Type.Union([Type.Literal('library'), Type.Literal('emulator')])),
            source: Type.String({ minLength: 1, maxLength: config.maxSourceBytes }),
          },
          { additionalProperties: false },
        ),
      },
    },
    async (request, reply) => {
      if (request.body.board === 'esp32' && request.body.language !== 'arduino') {
        return reply.code(400).send({ error: 'the ESP32 board takes Arduino sketches only' });
      }
      if (request.body.engine && request.body.board !== 'esp32') {
        return reply.code(400).send({ error: 'only the ESP32 board has a choice of engine' });
      }
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
