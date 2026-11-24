// Makes an adult's account an owner of the lab (a platform admin), or takes it back.
// Run on the server, where the database is; there is no way to do it from the web.
//
//   pnpm --filter @banglalab/api owner:grant owner@example.com
//   pnpm --filter @banglalab/api owner:grant owner@example.com --revoke
import { and, eq, isNull, sql } from 'drizzle-orm';
import { loadConfig } from '../config';
import { createDatabase } from './client';
import { auditLogs, users } from './schema';

const email = process.argv[2]?.trim().toLowerCase();
const revoke = process.argv.includes('--revoke');
if (!email || !email.includes('@')) {
  console.error('usage: owner:grant <email of an existing adult account> [--revoke]');
  process.exit(2);
}
const database = createDatabase(loadConfig().databaseUrl);
try {
  const [user] = await database.db
    .update(users)
    .set({ platformRole: revoke ? null : 'platform_admin' })
    .where(
      and(
        sql`lower(${users.email}) = ${email}`,
        eq(users.kind, 'adult'),
        isNull(users.deactivatedAt),
      ),
    )
    .returning({ id: users.id, name: users.displayName });
  if (!user) {
    console.error(`No open adult account has the email ${email}. Sign up on the lab first.`);
    process.exitCode = 1;
  } else {
    await database.db.insert(auditLogs).values({
      actorId: null,
      action: revoke ? 'owner.revoked-by-server' : 'owner.granted-by-server',
      targetType: 'user',
      targetId: user.id,
    });
    console.log(`${user.name} ${revoke ? 'is no longer' : 'is now'} an owner of the lab.`);
  }
} finally {
  await database.pool.end();
}
