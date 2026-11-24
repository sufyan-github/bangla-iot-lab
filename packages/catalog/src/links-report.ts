import { PART_DEFINITIONS, type PartDefinition } from '@banglalab/parts';
import {
  decisionProblems,
  linkProducts,
  productsByPart,
  projectCoverage,
  type LinkDecisions,
  type LinkState,
} from './links';
import type { Snapshot } from './types';

export interface LinksReport {
  snapshotDate: string;
  counts: Record<LinkState, number>;
  /** Products more than one part's keywords point to: worth a person's look first. */
  ambiguous: number;
  problems: string[];
  parts: {
    part: string;
    status: string;
    confirmed: number;
    suggested: number;
    /** Lowest price among its linked products that can be bought now, in taka on the snapshot date. */
    lowestBdt: number | null;
  }[];
  projects: { id: string; name: string; simulated: number; of: number; missing: string[] }[];
  /** The report for a person to read, in Markdown. */
  markdown: string;
}

const AVAILABLE = new Set(['in-stock', 'low-stock']);

/** What the links between the catalogue and the parts master look like for one snapshot. */
export function linksReport(
  snapshot: Snapshot,
  decisions: LinkDecisions,
  definitions: readonly PartDefinition[] = PART_DEFINITIONS,
): LinksReport {
  const links = linkProducts(snapshot.products, decisions, definitions);
  const products = new Map(snapshot.products.map((product) => [product.id, product]));
  const counts: Record<LinkState, number> = { suggested: 0, confirmed: 0, rejected: 0, none: 0 };
  let ambiguous = 0;
  for (const link of links.values()) {
    counts[link.state]++;
    if (link.state === 'suggested' && link.candidates.length > 1) ambiguous++;
  }
  const parts = productsByPart(links, definitions).map((entry) => {
    const prices = [...entry.confirmed, ...entry.suggested]
      .map((id) => products.get(id)!)
      .filter((product) => AVAILABLE.has(product.stock) && product.priceBdt !== null)
      .map((product) => product.priceBdt!);
    return {
      part: entry.part,
      status: entry.status,
      confirmed: entry.confirmed.length,
      suggested: entry.suggested.length,
      lowestBdt: prices.length ? Math.min(...prices) : null,
    };
  });
  const projects = snapshot.projects.map((project) => {
    const lines = projectCoverage(project, links, definitions);
    const real = lines.filter((line) => line.status !== 'not-simulated');
    return {
      id: project.id,
      name: project.name,
      simulated: real.filter((line) => line.status === 'simulated').length,
      of: real.length,
      missing: real
        .filter((line) => line.status !== 'simulated')
        .map((line) => (line.part ? `${line.part} (${line.status})` : line.component)),
    };
  });
  const problems = decisionProblems(snapshot.products, decisions, definitions);

  const md = [
    '# Catalogue and parts master',
    '',
    `Snapshot ${snapshot.snapshotDate}. Prices are from that day and may have changed.`,
    '',
    '| Products | Count |',
    '| --- | --- |',
    `| Linked by a person | ${counts.confirmed} |`,
    `| Suggested by keyword, not yet looked at | ${counts.suggested} (${ambiguous} with more than one possible part) |`,
    `| Marked as no lab part | ${counts.rejected} |`,
    `| No part found | ${counts.none} |`,
    '',
  ];
  if (problems.length) {
    md.push('## Decisions that no longer fit', '', ...problems.map((p) => `- ${p}`), '');
  }
  md.push(
    '## Parts',
    '',
    '| Part | Status | Linked | Suggested | Lowest price now (BDT) |',
    '| --- | --- | --- | --- | --- |',
    ...parts.map(
      (p) => `| ${p.part} | ${p.status} | ${p.confirmed} | ${p.suggested} | ${p.lowestBdt ?? ''} |`,
    ),
    '',
    '## Parts the catalogue does not seem to sell',
    '',
    ...parts.filter((p) => p.confirmed + p.suggested === 0).map((p) => `- ${p.part}`),
    '',
    '## Projects: what the simulator can build',
    '',
    '| Project | Simulated | Missing |',
    '| --- | --- | --- |',
    ...projects.map(
      (p) => `| ${p.id} ${p.name} | ${p.simulated} of ${p.of} | ${p.missing.join('; ')} |`,
    ),
    '',
  );
  return {
    snapshotDate: snapshot.snapshotDate,
    counts,
    ambiguous,
    problems,
    parts,
    projects,
    markdown: md.join('\n'),
  };
}
