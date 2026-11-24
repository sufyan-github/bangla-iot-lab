import {
  PART_DEFINITIONS,
  matchPart,
  type PartDefinition,
  type PartStatus,
} from '@banglalab/parts';
import type { CatalogProduct, CatalogProject } from './types';

/**
 * Links between the store's products and the lab's parts master (the part
 * definitions in packages/parts). A link is first suggested from the part's
 * keywords; a person then confirms it, moves it to another part, or says the
 * product is no lab part at all. Those decisions are kept by product id, apart
 * from any one snapshot, so they carry over to the next export.
 *
 * Product ids come from the store, so the links and decisions are private data:
 * they live in data/private/, never in the repository.
 */

/** A person's word on one product: the lab part it is, or null for none. */
export interface LinkDecision {
  part: string | null;
  /** One of the part's `variants`, when the product is a particular version of it. */
  variant?: string;
  /** When it was decided (ISO time). */
  decidedAt: string;
}

export interface LinkDecisions {
  formatVersion: 1;
  decisions: Record<string, LinkDecision>;
}

export const NO_DECISIONS: LinkDecisions = { formatVersion: 1, decisions: {} };

/**
 * - `suggested`: matched by keyword, not yet looked at;
 * - `confirmed`: a person linked it to a part (the suggestion or another);
 * - `rejected`: a person said it is no lab part;
 * - `none`: no keyword matched and nobody has linked it.
 */
export type LinkState = 'suggested' | 'confirmed' | 'rejected' | 'none';

export interface ProductLink {
  productId: string;
  /** The part the keywords point to, or null. */
  suggested: string | null;
  /** Every part with a keyword in the name, longest keyword first. */
  candidates: string[];
  /** The part the product counts as: the decision if there is one, else the suggestion. */
  part: string | null;
  variant: string | null;
  state: LinkState;
}

const isWordCharacter = (character: string | undefined) =>
  character !== undefined && /[a-z0-9]/.test(character);

/**
 * True when the keyword stands as whole words in the text: "led" is found in
 * "5mm red led" and "leds" but not in "oled" or "soldering". A keyword of
 * several words, each of three letters or more, also counts when each word
 * stands somewhere in the text, in any order, as store names often put them:
 * "5mm led" is found in "5mm red led".
 */
export function hasKeyword(text: string, keyword: string): boolean {
  if (hasPhrase(text, keyword)) return true;
  // Only for words long enough to mean something alone: "1/4 w" is not "w" anywhere.
  const parts = keyword.split(' ').filter(Boolean);
  return (
    parts.length > 1 &&
    parts.every((part) => part.length >= 3) &&
    parts.every((part) => hasPhrase(text, part))
  );
}

const isDigit = (character: string | undefined) =>
  character !== undefined && /[0-9]/.test(character);

/**
 * Whether the keyword's edge at this point is a word boundary. Next to a digit
 * only another digit continues the word, so part numbers are found with a
 * maker's letters before them and a package's after: "74hc00" in "SN74HC00N".
 */
const joins = (edge: string | undefined, beside: string | undefined) =>
  isWordCharacter(edge) && (isDigit(edge) ? isDigit(beside) : isWordCharacter(beside));

function hasPhrase(text: string, keyword: string): boolean {
  const haystack = text.toLowerCase();
  for (let at = haystack.indexOf(keyword); at >= 0; at = haystack.indexOf(keyword, at + 1)) {
    const end = at + keyword.length;
    if (joins(keyword[0], haystack[at - 1])) continue;
    if (!joins(keyword[keyword.length - 1], haystack[end])) return true;
    // A plural is the same part.
    for (const ending of ['s', 'es']) {
      if (haystack.startsWith(ending, end) && !isWordCharacter(haystack[end + ending.length])) {
        return true;
      }
    }
  }
  return false;
}

/** The parts whose keywords stand in a product's name, the longest keyword first. */
export function candidateParts(
  name: string,
  definitions: readonly PartDefinition[] = PART_DEFINITIONS,
): string[] {
  const found = new Map<string, number>();
  for (const definition of definitions) {
    for (const keyword of definition.catalog.keywords) {
      if (hasKeyword(name, keyword)) {
        found.set(definition.id, Math.max(found.get(definition.id) ?? 0, keyword.length));
      }
    }
  }
  return [...found.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([id]) => id);
}

/** Every product's link, from the keywords and the decisions so far. */
export function linkProducts(
  products: readonly CatalogProduct[],
  decisions: LinkDecisions = NO_DECISIONS,
  definitions: readonly PartDefinition[] = PART_DEFINITIONS,
): Map<string, ProductLink> {
  const links = new Map<string, ProductLink>();
  for (const product of products) {
    const candidates = candidateParts(product.name, definitions);
    const suggested = candidates[0] ?? null;
    const decision = decisions.decisions[product.id];
    links.set(product.id, {
      productId: product.id,
      suggested,
      candidates,
      part: decision ? decision.part : suggested,
      variant: decision?.variant ?? null,
      state: decision
        ? decision.part === null
          ? 'rejected'
          : 'confirmed'
        : suggested
          ? 'suggested'
          : 'none',
    });
  }
  return links;
}

/** Decisions that no longer fit: a product gone from the snapshot, or a part or variant that does not exist. */
export function decisionProblems(
  products: readonly CatalogProduct[],
  decisions: LinkDecisions,
  definitions: readonly PartDefinition[] = PART_DEFINITIONS,
): string[] {
  const ids = new Set(products.map((product) => product.id));
  const parts = new Map(definitions.map((definition) => [definition.id, definition]));
  const problems: string[] = [];
  for (const [productId, decision] of Object.entries(decisions.decisions)) {
    if (!ids.has(productId)) problems.push(`${productId}: not in this snapshot`);
    if (decision.part === null) {
      if (decision.variant) problems.push(`${productId}: a variant without a part`);
      continue;
    }
    const part = parts.get(decision.part);
    if (!part) problems.push(`${productId}: no part "${decision.part}"`);
    else if (decision.variant && !part.variants.some((v) => v.id === decision.variant)) {
      problems.push(`${productId}: part "${decision.part}" has no variant "${decision.variant}"`);
    }
  }
  return problems;
}

/**
 * Records a decision, or with `null` for `decision` forgets it. Returns a new
 * set of decisions; throws if the part or variant does not exist.
 */
export function decide(
  decisions: LinkDecisions,
  productId: string,
  decision: { part: string | null; variant?: string } | null,
  now: Date = new Date(),
  definitions: readonly PartDefinition[] = PART_DEFINITIONS,
): LinkDecisions {
  const next = { ...decisions.decisions };
  if (decision === null) {
    delete next[productId];
    return { formatVersion: 1, decisions: next };
  }
  if (decision.part !== null) {
    const part = definitions.find((definition) => definition.id === decision.part);
    if (!part) throw new Error(`No part "${decision.part}".`);
    if (decision.variant && !part.variants.some((v) => v.id === decision.variant)) {
      throw new Error(`Part "${decision.part}" has no variant "${decision.variant}".`);
    }
  } else if (decision.variant) {
    throw new Error('A variant needs a part.');
  }
  next[productId] = {
    part: decision.part,
    ...(decision.variant ? { variant: decision.variant } : {}),
    decidedAt: now.toISOString(),
  };
  return { formatVersion: 1, decisions: next };
}

export interface PartProducts {
  part: string;
  status: PartStatus;
  confirmed: string[];
  suggested: string[];
}

/** For every part in the master, the products linked to it. Parts with none are kept, with empty lists. */
export function productsByPart(
  links: ReadonlyMap<string, ProductLink>,
  definitions: readonly PartDefinition[] = PART_DEFINITIONS,
): PartProducts[] {
  const byPart = new Map<string, PartProducts>(
    definitions.map((d) => [d.id, { part: d.id, status: d.status, confirmed: [], suggested: [] }]),
  );
  for (const link of links.values()) {
    if (!link.part) continue;
    const entry = byPart.get(link.part);
    if (!entry) continue;
    if (link.state === 'confirmed') entry.confirmed.push(link.productId);
    else if (link.state === 'suggested') entry.suggested.push(link.productId);
  }
  return [...byPart.values()];
}

export interface ProjectLineCoverage {
  component: string;
  productId: string | null;
  part: string | null;
  /** How the part was found: through the product's link, or from the line's words. */
  via: 'link' | 'text' | null;
  status: PartStatus | 'undefined';
}

/**
 * What the simulator can build of a project's required lines: each line's part
 * through its product's link when it has one, otherwise from its words.
 */
export function projectCoverage(
  project: CatalogProject,
  links: ReadonlyMap<string, ProductLink>,
  definitions: readonly PartDefinition[] = PART_DEFINITIONS,
): ProjectLineCoverage[] {
  const parts = new Map(definitions.map((definition) => [definition.id, definition]));
  return project.lines
    .filter((line) => !line.optional)
    .map((line) => {
      const linked = line.productId ? links.get(line.productId) : undefined;
      if (linked?.part && parts.has(linked.part)) {
        return {
          component: line.component,
          productId: line.productId,
          part: linked.part,
          via: 'link' as const,
          status: parts.get(linked.part)!.status,
        };
      }
      const matched = matchPart(`${line.component} ${line.storeProduct}`);
      return {
        component: line.component,
        productId: line.productId,
        part: matched?.id ?? null,
        via: matched ? ('text' as const) : null,
        status: matched?.status ?? 'undefined',
      };
    });
}
