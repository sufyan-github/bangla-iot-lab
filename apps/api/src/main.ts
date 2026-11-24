import { buildApp } from './app';
import { loadConfig } from './config';
import { createDatabase } from './db/client';
import { LocalMailbox } from './mail';

const config = loadConfig();
const database = createDatabase(config.databaseUrl);
// No email provider is chosen yet: emails stay in the local mailbox (development only).
const mailer = new LocalMailbox((line) => console.log(line));
const app = await buildApp({ config, database, fetch: globalThis.fetch, mailer });
await app.listen({ host: config.host, port: config.port });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void app
      .close()
      .then(() => database.pool.end())
      .then(() => process.exit(0));
  });
}
