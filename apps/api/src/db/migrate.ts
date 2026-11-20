import { loadConfig } from '../config';
import { createDatabase, runMigrations } from './client';

const database = createDatabase(loadConfig().databaseUrl);
try {
  await runMigrations(database);
  console.log('Migrations applied.');
} finally {
  await database.pool.end();
}
