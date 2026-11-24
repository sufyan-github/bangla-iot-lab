export interface ApiConfig {
  host: string;
  port: number;
  databaseUrl: string;
  webOrigin: string;
  compileWorkerUrl: string;
  /** How many compiles one address may ask for in a minute. */
  compilesPerMinute: number;
  /**
   * How many times one address may try to sign up, sign in or use a code in a
   * minute, on each of those routes: few, against guessing.
   */
  signInsPerMinute: number;
  /** How many requests of any kind one address may make in a minute. */
  requestsPerMinute: number;
  logLevel: string;
  /** How email leaves the lab. Only "local" exists until a provider is chosen. */
  mailTransport: 'local';
  /** The sender's address on emails. */
  mailFrom: string;
  /**
   * Development and browser tests only: GET /v1/dev/mail shows the local
   * mailbox, so a test can follow the link in an email. Never in production.
   */
  devMailbox: boolean;
}

export const DEV_DATABASE_URL = 'postgres://banglalab:banglalab_dev@127.0.0.1:55440/banglalab_dev';

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const production = env.NODE_ENV === 'production';
  if (production && !env.DATABASE_URL) throw new Error('DATABASE_URL is required in production');
  if (production && !env.WEB_ORIGIN) throw new Error('WEB_ORIGIN is required in production');
  if (production) {
    throw new Error(
      'No email provider is configured: accounts need verification emails. Choose a provider before production.',
    );
  }
  if (env.MAIL_TRANSPORT && env.MAIL_TRANSPORT !== 'local') {
    throw new Error(`MAIL_TRANSPORT "${env.MAIL_TRANSPORT}" is not supported yet; use "local".`);
  }
  return {
    host: env.API_HOST ?? '127.0.0.1',
    port: Number(env.API_PORT ?? 4000),
    databaseUrl: env.DATABASE_URL ?? DEV_DATABASE_URL,
    webOrigin: env.WEB_ORIGIN ?? 'http://localhost:5173',
    compileWorkerUrl: env.COMPILE_WORKER_URL ?? 'http://127.0.0.1:4100',
    compilesPerMinute: Number(env.COMPILES_PER_MINUTE ?? 20),
    signInsPerMinute: Number(env.SIGN_INS_PER_MINUTE ?? 10),
    requestsPerMinute: Number(env.REQUESTS_PER_MINUTE ?? 300),
    logLevel: env.LOG_LEVEL ?? 'info',
    mailTransport: 'local',
    mailFrom: env.MAIL_FROM ?? 'Bangla IoT Lab <no-reply@localhost>',
    devMailbox: env.DEV_MAILBOX === '1',
  };
}
