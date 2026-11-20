import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import * as schema from './schema';

export function createDatabase(databaseUrl: string) {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 10 });
  const db = drizzle(pool, { schema });
  return { db, pool };
}

export type Database = ReturnType<typeof createDatabase>;

/** Applies every migration in apps/api/drizzle that has not run yet. Forward-only. */
export async function runMigrations(database: Database): Promise<void> {
  await migrate(database.db, {
    migrationsFolder: new URL('../../drizzle', import.meta.url).pathname,
  });
}
