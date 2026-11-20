import { buildApp } from './app';
import { loadConfig } from './config';
import { createDatabase } from './db/client';

const config = loadConfig();
const database = createDatabase(config.databaseUrl);
const app = await buildApp({ config, database, fetch: globalThis.fetch });
await app.listen({ host: config.host, port: config.port });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void app
      .close()
      .then(() => database.pool.end())
      .then(() => process.exit(0));
  });
}
