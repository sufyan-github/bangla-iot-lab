// Imports a store export into a dated, private snapshot.
//
//   pnpm catalog:import --source <folder with the three CSV files> --date 2026-11-13
//
// Writes data/private/catalog/<date>/ : the original files byte for byte, the
// cleaned records, the issues found, a manifest and a readable report. The
// folder is ignored by git: store data is not published without permission.
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { importSnapshot, type DataIssue } from '../src/index';

const FILES = {
  inventory: '1_RoboticsBD_inventory.csv',
  projects: '2_Project_portfolio_and_BOM.csv',
  lab: '3_Lab_procurement_list.csv',
} as const;

function option(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const source = option('source') ?? process.env.BANGLALAB_CATALOG_SOURCE;
const date = option('date');
if (!source || !date) {
  console.error('usage: pnpm catalog:import --source <folder> --date yyyy-mm-dd');
  process.exit(2);
}
const root = path.resolve(import.meta.dirname, '../../..');
const out = path.resolve(root, option('out') ?? 'data/private/catalog', date);
mkdirSync(path.join(out, 'source'), { recursive: true });

const text = {} as Record<keyof typeof FILES, string>;
const sources = Object.entries(FILES).map(([key, file]) => {
  const from = path.join(source, file);
  const bytes = readFileSync(from);
  text[key as keyof typeof FILES] = bytes.toString('utf8');
  copyFileSync(from, path.join(out, 'source', file)); // the original, untouched
  return { file, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
});

const snapshot = importSnapshot(text, date);
const write = (name: string, value: unknown) =>
  writeFileSync(path.join(out, name), `${JSON.stringify(value, null, 2)}\n`);
write('products.json', snapshot.products);
write('projects.json', snapshot.projects);
write('lab.json', snapshot.lab);
write('issues.json', snapshot.issues);

const groups = new Map<string, number>();
for (const product of snapshot.products)
  groups.set(product.group, (groups.get(product.group) ?? 0) + 1);
const manifest = {
  formatVersion: 1,
  snapshotDate: date,
  importedAt: new Date().toISOString(),
  notice: 'Prices and stock are a snapshot from the date above and may have changed.',
  sources,
  counts: {
    products: snapshot.products.length,
    groups: groups.size,
    categories: new Set(snapshot.products.map((p) => `${p.group}/${p.category}`)).size,
    projects: snapshot.projects.length,
    bomLines: snapshot.projects.reduce((sum, project) => sum + project.lines.length, 0),
    labLines: snapshot.lab.lines.length,
    issues: snapshot.issues.length,
  },
};
write('manifest.json', manifest);

const section = (title: string, list: DataIssue[]) =>
  list.length === 0
    ? []
    : [
        `## ${title}`,
        '',
        ...list.flatMap((issue) => [
          `### ${issue.message} (${issue.count})`,
          '',
          ...issue.examples.map((example) => `- ${example}`),
          ...(issue.count > issue.examples.length
            ? [`- … and ${issue.count - issue.examples.length} more`]
            : []),
          '',
        ]),
      ];
const report = [
  `# Catalogue import report: snapshot of ${date}`,
  '',
  `Imported ${manifest.importedAt}. Prices and stock are true for the snapshot date only.`,
  '',
  '| | Count |',
  '| --- | --- |',
  ...Object.entries(manifest.counts).map(([name, count]) => `| ${name} | ${count} |`),
  '',
  '| Group | Products |',
  '| --- | --- |',
  ...[...groups.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([group, count]) => `| ${group} | ${count} |`),
  '',
  ...section(
    'Errors',
    snapshot.issues.filter((issue) => issue.severity === 'error'),
  ),
  ...section(
    'Warnings',
    snapshot.issues.filter((issue) => issue.severity === 'warning'),
  ),
  ...section(
    'Notes',
    snapshot.issues.filter((issue) => issue.severity === 'info'),
  ),
];
writeFileSync(path.join(out, 'report.md'), `${report.join('\n')}\n`);

console.log(`Snapshot ${date} written to ${path.relative(root, out)}`);
console.log(manifest.counts);
for (const issue of snapshot.issues)
  console.log(`  ${issue.severity.padEnd(7)} ${String(issue.count).padStart(4)}  ${issue.message}`);
