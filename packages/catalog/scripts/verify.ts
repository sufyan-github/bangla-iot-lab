// Checks an imported snapshot against the figures in the project brief.
// This runs only where the private data is; it is not part of CI.
//
//   pnpm catalog:verify --date 2026-11-13
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { CatalogProduct, CatalogProject, LabBudget } from '../src/index';

const index = process.argv.indexOf('--date');
const date = index >= 0 ? process.argv[index + 1] : undefined;
if (!date) {
  console.error('usage: pnpm catalog:verify --date yyyy-mm-dd');
  process.exit(2);
}
const folder = path.resolve(import.meta.dirname, '../../../data/private/catalog', date);
const load = <T>(name: string) => JSON.parse(readFileSync(path.join(folder, name), 'utf8')) as T;
const products = load<CatalogProduct[]>('products.json');
const projects = load<CatalogProject[]>('projects.json');
const lab = load<LabBudget>('lab.json');

/** Required and optional totals from the brief, section 2.2. */
const BRIEF: Record<string, [number, number]> = {
  C1: [8967, 0],
  C2: [12736, 0],
  C3: [4023, 0],
  C4: [12238, 0],
  C5: [5660, 0],
  E1: [6615, 0],
  E2: [11581, 9000],
  E3: [7786, 0],
  E4: [5637, 0],
  E5: [6748, 11990],
  E6: [9124, 0],
  R1: [1776, 750],
  R2: [7462, 0],
  R3: [3195, 0],
  R4: [6083, 0],
  S1: [4148, 0],
  S2: [3863, 0],
  S3: [3412, 44699],
  S4: [11530, 0],
  S5: [4952, 0],
};

let failed = 0;
function expect(what: string, actual: unknown, wanted: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(wanted);
  if (!ok) failed++;
  console.log(
    `${ok ? 'ok  ' : 'FAIL'}  ${what}: ${JSON.stringify(actual)}${ok ? '' : `, brief says ${JSON.stringify(wanted)}`}`,
  );
}

const lines = projects.flatMap((project) => project.lines);
expect('projects', projects.length, 20);
expect('BOM lines', lines.length, 244);
expect('verified lines', lines.filter((line) => line.priceSource === 'verified').length, 228);
expect('estimated lines', lines.filter((line) => line.priceSource === 'estimated').length, 16);
expect(
  'shortlisted',
  projects
    .filter((p) => p.shortlisted)
    .map((p) => p.id)
    .sort(),
  ['C1', 'E1', 'E3', 'R1', 'S1'],
);
for (const project of projects) {
  expect(
    `${project.id} required, optional`,
    [project.requiredBdt, project.optionalBdt],
    BRIEF[project.id],
  );
}
expect('lab total', lab.totalBdt, 296098);
expect(
  'lab tiers',
  lab.tiers.map((tier) => [tier.lines, tier.totalBdt]),
  [
    [17, 176919],
    [63, 58384],
    [42, 60795],
  ],
);
const bought = (name: RegExp) =>
  lab.lines.filter((line) => name.test(line.item)).reduce((sum, line) => sum + line.quantity, 0);
expect('ESP32 30-pin boards bought', bought(/ESP32 ESP-32S/i), 40);
expect('UNO R3 boards bought', bought(/Uno R3/i), 15);
console.log(
  `\nCatalogue: ${products.length} products (the brief describes a partial export of 499).`,
);
console.log(
  failed === 0 ? 'Every figure matches the brief.' : `${failed} figure(s) differ from the brief.`,
);
process.exit(failed === 0 ? 0 : 1);
