// Reports how much of each project's parts list the simulator can build.
// Reads a private catalogue snapshot and writes the report beside it.
//
//   pnpm parts:coverage --date 2026-11-13
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { coverage } from '../src/index';

const index = process.argv.indexOf('--date');
const date = index >= 0 ? process.argv[index + 1] : undefined;
if (!date) {
  console.error('usage: pnpm parts:coverage --date yyyy-mm-dd');
  process.exit(2);
}
const folder = path.resolve(import.meta.dirname, '../../../data/private/catalog', date);
interface Project {
  id: string;
  name: string;
  shortlisted: boolean;
  lines: { component: string; storeProduct: string; optional: boolean }[];
}
const projects = JSON.parse(readFileSync(path.join(folder, 'projects.json'), 'utf8')) as Project[];

const report = ['# What the simulator can build, by project', '', `Snapshot ${date}.`, ''];
const summary: string[] = [];
const missing = new Map<string, Set<string>>();
for (const project of projects) {
  const required = project.lines.filter((line) => !line.optional);
  const result = coverage(required.map((line) => `${line.component} ${line.storeProduct}`));
  const { simulated, generic, planned, undefined: unknown } = result.counts;
  const real = required.length - result.counts['not-simulated'];
  summary.push(
    `${project.id.padEnd(3)} ${String(simulated).padStart(2)}/${String(real).padEnd(2)} simulated, ${generic} stand-in, ${planned} planned, ${unknown} undefined${project.shortlisted ? '  (shortlisted)' : ''}`,
  );
  report.push(
    `## ${project.id} ${project.name}`,
    '',
    `${simulated} of ${real} parts simulated; ${generic} stand-in, ${planned} planned, ${unknown} with no definition.`,
    '',
    '| Line | Part | Status |',
    '| --- | --- | --- |',
    ...result.lines.map(
      (line, i) => `| ${required[i]!.component} | ${line.part?.id ?? ''} | ${line.status} |`,
    ),
    '',
  );
  result.lines.forEach((line, i) => {
    if (line.status === 'simulated' || line.status === 'not-simulated') return;
    const key = line.part
      ? `${line.part.id} (${line.status})`
      : `no definition: ${required[i]!.component}`;
    missing.set(key, (missing.get(key) ?? new Set()).add(project.id));
  });
}
report.push('## Missing parts, most wanted first', '', '| Part | Projects |', '| --- | --- |');
for (const [part, wanted] of [...missing.entries()].sort((a, b) => b[1].size - a[1].size)) {
  report.push(`| ${part} | ${[...wanted].join(', ')} |`);
}
writeFileSync(path.join(folder, 'coverage.md'), `${report.join('\n')}\n`);
console.log(summary.join('\n'));
console.log(`\n${missing.size} parts or lines stand between the simulator and these projects.`);
console.log(`Full report: data/private/catalog/${date}/coverage.md`);
