// The private catalogue browser, on this computer only.
//
//   pnpm catalog:browse --date 2026-11-13 [--port 4300] [--decisions <file>]
//
// Opens a snapshot from data/private/catalog/<date>/ and serves a page at
// http://127.0.0.1:<port>/ to search the products, read the issues, and
// confirm, move or reject their links to the lab's parts. Decisions are saved
// to data/private/catalog/part-links.json as they are made, or to the file
// given with --decisions, to try decisions out without touching the real ones.
import path from 'node:path';
import { createBrowseServer } from '../src/browse-server';
import { PRIVATE_CATALOG, decisionsFile, readSnapshot } from '../src/files';

function option(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
const date = option('date');
const port = Number(option('port') ?? 4300);
if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isInteger(port)) {
  console.error('usage: pnpm catalog:browse --date yyyy-mm-dd [--port 4300]');
  process.exit(2);
}
const snapshot = readSnapshot(path.join(PRIVATE_CATALOG, date));
const decisions = option('decisions');
const server = createBrowseServer({
  snapshot,
  decisionsFile: decisions ? path.resolve(decisions) : decisionsFile(),
});
server.listen(port, '127.0.0.1', () => {
  console.log(`Catalogue desk for the snapshot of ${date}: http://127.0.0.1:${port}/`);
  console.log('Private: it answers only on this computer. Stop it with Ctrl+C.');
});
