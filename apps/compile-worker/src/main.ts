import { loadConfig } from './config';
import { buildServer } from './server';

const config = loadConfig();
const server = await buildServer(config);
await server.listen({ host: config.host, port: config.port });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => void server.close().then(() => process.exit(0)));
}
