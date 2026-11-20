import path from 'node:path';

export type SandboxMode = 'bwrap' | 'container' | 'none';

export interface WorkerConfig {
  host: string;
  port: number;
  /**
   * How untrusted source is isolated while the compiler runs:
   * - `bwrap`: each job runs in its own bubblewrap namespace (no network, no
   *   home directory, read-only toolchain). Default.
   * - `container`: the whole worker already runs in a locked-down container.
   * - `none`: no isolation. Development only; refused in production.
   */
  sandbox: SandboxMode;
  cacheDir: string;
  /** Wall-clock limit for one toolchain command. */
  timeoutMs: number;
  maxSourceBytes: number;
  maxConcurrentJobs: number;
  maxQueuedJobs: number;
  logLevel: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  const sandbox = env.COMPILE_SANDBOX ?? 'bwrap';
  if (sandbox !== 'bwrap' && sandbox !== 'container' && sandbox !== 'none') {
    throw new Error(`COMPILE_SANDBOX must be bwrap, container or none (got "${sandbox}")`);
  }
  if (sandbox === 'none' && env.NODE_ENV === 'production') {
    throw new Error('COMPILE_SANDBOX=none is not allowed in production');
  }
  return {
    host: env.COMPILE_WORKER_HOST ?? '127.0.0.1',
    port: Number(env.COMPILE_WORKER_PORT ?? 4100),
    sandbox,
    cacheDir: path.resolve(env.COMPILE_CACHE_DIR ?? '.cache/compile'),
    timeoutMs: Number(env.COMPILE_TIMEOUT_MS ?? 10_000),
    maxSourceBytes: 64 * 1024,
    maxConcurrentJobs: Number(env.COMPILE_MAX_CONCURRENT ?? 2),
    maxQueuedJobs: 20,
    logLevel: env.LOG_LEVEL ?? 'info',
  };
}
