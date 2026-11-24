// The retention job (D-101). Run it on the server, once a day.
// Without --apply it only reports what it would remove; nothing changes.
//
//   pnpm --filter @banglalab/api retention
//   pnpm --filter @banglalab/api retention --apply
//
// The periods are RETENTION_* settings; see docs/architecture/database.md.
import { loadConfig } from '../config';
import { retentionPolicy, runRetention } from '../retention';
import { createDatabase } from './client';

const apply = process.argv.includes('--apply');
const database = createDatabase(loadConfig().databaseUrl);
try {
  const result = await runRetention(database, { policy: retentionPolicy(), apply });
  console.log(apply ? 'Retention: done.' : 'Retention: report only; run with --apply to do it.');
  for (const rule of result.rules) {
    console.log(`${String(rule.rows).padStart(8)}  ${rule.name}: ${rule.what}`);
  }
} finally {
  await database.pool.end();
}
