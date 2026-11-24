// Links a private catalogue snapshot to the parts master and reports on it.
//
//   pnpm catalog:links --date 2026-11-13
//
// Reads data/private/catalog/<date>/ and the decisions in
// data/private/catalog/part-links.json (made with `pnpm catalog:browse`), and
// writes links.json and links-report.md into the snapshot folder. Everything
// stays in data/private/: product ids and prices are the store's data.
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { PRIVATE_CATALOG, decisionsFile, readDecisions, readSnapshot } from '../src/files';
import { linkProducts } from '../src/links';
import { linksReport } from '../src/links-report';

const index = process.argv.indexOf('--date');
const date = index >= 0 ? process.argv[index + 1] : undefined;
if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
  console.error('usage: pnpm catalog:links --date yyyy-mm-dd');
  process.exit(2);
}
const folder = path.join(PRIVATE_CATALOG, date);
const snapshot = readSnapshot(folder);
const decisions = readDecisions(decisionsFile());
const report = linksReport(snapshot, decisions);

writeFileSync(
  path.join(folder, 'links.json'),
  `${JSON.stringify([...linkProducts(snapshot.products, decisions).values()], null, 2)}\n`,
);
writeFileSync(path.join(folder, 'links-report.md'), `${report.markdown}\n`);

const { confirmed, suggested, rejected, none } = report.counts;
console.log(
  `${snapshot.products.length} products: ${confirmed} linked by a person, ${suggested} suggested (${report.ambiguous} with more than one possible part), ${rejected} marked as no lab part, ${none} with no part found.`,
);
const unsold = report.parts.filter((p) => p.confirmed + p.suggested === 0).length;
console.log(
  `${report.parts.length} parts in the master; ${unsold} with no product in this catalogue.`,
);
if (report.problems.length)
  console.log(`${report.problems.length} decisions no longer fit; see the report.`);
console.log(`Report: data/private/catalog/${date}/links-report.md`);
