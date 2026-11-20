export interface ApiConfig {
  host: string;
  port: number;
  databaseUrl: string;
  webOrigin: string;
  compileWorkerUrl: string;
  logLevel: string;
}

export const DEV_DATABASE_URL = 'postgres://banglalab:banglalab_dev@127.0.0.1:55440/banglalab_dev';

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const production = env.NODE_ENV === 'production';
  if (production && !env.DATABASE_URL) throw new Error('DATABASE_URL is required in production');
  if (production && !env.WEB_ORIGIN) throw new Error('WEB_ORIGIN is required in production');
  return {
    host: env.API_HOST ?? '127.0.0.1',
    port: Number(env.API_PORT ?? 4000),
    databaseUrl: env.DATABASE_URL ?? DEV_DATABASE_URL,
    webOrigin: env.WEB_ORIGIN ?? 'http://localhost:5173',
    compileWorkerUrl: env.COMPILE_WORKER_URL ?? 'http://127.0.0.1:4100',
    logLevel: env.LOG_LEVEL ?? 'info',
  };
}
