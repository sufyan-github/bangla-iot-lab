import pg from 'pg';
import { DEV_DATABASE_URL } from './config';
import { createDatabase, runMigrations, type Database } from './db/client';

/**
 * A fresh database for one test file, on the local PostgreSQL 18 (`pnpm db:up`),
 * so tests never touch development data. Dropped and made again on every run.
 */
export async function freshDatabase(name: string): Promise<Database> {
  const baseUrl = process.env.DATABASE_URL ?? DEV_DATABASE_URL;
  const admin = new pg.Client({ connectionString: baseUrl });
  await admin.connect().catch((error: Error) => {
    throw new Error(
      `PostgreSQL is not reachable at ${new URL(baseUrl).host}. Run "pnpm db:up". (${error.message})`,
    );
  });
  await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${name}`);
  await admin.end();
  const url = new URL(baseUrl);
  url.pathname = `/${name}`;
  const database = createDatabase(url.toString());
  await runMigrations(database);
  return database;
}
