import { Value } from 'typebox/value';
import { RAW_DEFINITIONS } from './registry';
import { PartDefinitionSchema, type PartDefinition, type PartStatus } from './schema';

export { PartDefinitionSchema, PinSchema, type PartDefinition, type PartStatus } from './schema';

/** Why a definition file is not acceptable, or an empty list when it is. */
export function definitionProblems(value: unknown): string[] {
  if (!Value.Check(PartDefinitionSchema, value)) {
    return [...Value.Errors(PartDefinitionSchema, value)].map(
      (error) => `${error.instancePath || '(root)'}: ${error.message}`,
    );
  }
  const problems: string[] = [];
  if (value.status !== 'simulated' && !value.statusNote) {
    problems.push('a part that is not fully simulated must say what is missing in statusNote');
  }
  if ((value.status === 'simulated' || value.status === 'generic') && value.simulates === null) {
    problems.push('a simulated or generic part must name the component type that models it');
  }
  if (value.status === 'planned' && value.model.level !== 'none') {
    problems.push('a planned part has no model yet, so model.level must be "none"');
  }
  if (value.status === 'simulated' && value.model.simplified.length === 0) {
    problems.push('every model leaves something out: list it in model.simplified');
  }
  if (value.validation.state === 'validated' && !value.validation.record) {
    problems.push('"validated" needs the bench record that proves it');
  }
  if (value.placement && value.placement.offsets.length !== value.pins.length) {
    problems.push('placement.offsets must have one entry per pin');
  }
  if (value.placement?.rows && value.placement.rows.length !== value.pins.length) {
    problems.push('placement.rows must have one entry per pin');
  }
  if (new Set(value.pins.map((pin) => pin.id)).size !== value.pins.length) {
    problems.push('two pins have the same id');
  }
  return problems;
}

function load(): PartDefinition[] {
  const definitions: PartDefinition[] = [];
  for (const raw of RAW_DEFINITIONS) {
    const problems = definitionProblems(raw);
    const id = (raw as { id?: string }).id ?? '(no id)';
    if (problems.length > 0) throw new Error(`Part definition ${id}: ${problems.join('; ')}`);
    definitions.push(raw as PartDefinition);
  }
  return definitions.sort((a, b) => a.id.localeCompare(b.id));
}

/** Every part the project knows about, built or not. */
export const PART_DEFINITIONS: readonly PartDefinition[] = load();
const BY_ID = new Map(PART_DEFINITIONS.map((definition) => [definition.id, definition]));

export function partDefinition(id: string): PartDefinition {
  const definition = BY_ID.get(id);
  if (!definition) throw new Error(`No part definition "${id}".`);
  return definition;
}

/**
 * The part a line of a parts list refers to, found by its keywords. The longest
 * matching keyword wins, so "relay module" is preferred to "relay".
 */
export function matchPart(text: string): PartDefinition | null {
  const haystack = text.toLowerCase();
  let best: { definition: PartDefinition; length: number } | null = null;
  for (const definition of PART_DEFINITIONS) {
    for (const keyword of definition.catalog.keywords) {
      if (haystack.includes(keyword) && (!best || keyword.length > best.length)) {
        best = { definition, length: keyword.length };
      }
    }
  }
  return best?.definition ?? null;
}

export interface CoverageLine {
  text: string;
  part: PartDefinition | null;
  /** The part's status, or "undefined" when no definition matches the line. */
  status: PartStatus | 'undefined';
}

export interface Coverage {
  lines: CoverageLine[];
  counts: Record<PartStatus | 'undefined', number>;
  /** True when every line that can be simulated has a full model. */
  ready: boolean;
}

/** How much of a parts list the simulator can build: the "missing in the simulator" report. */
export function coverage(lines: readonly string[]): Coverage {
  const counts = { simulated: 0, generic: 0, planned: 0, 'not-simulated': 0, undefined: 0 };
  const matched = lines.map((text): CoverageLine => {
    const part = matchPart(text);
    const status: CoverageLine['status'] = part?.status ?? 'undefined';
    counts[status]++;
    return { text, part, status };
  });
  return {
    lines: matched,
    counts,
    ready: counts.generic === 0 && counts.planned === 0 && counts.undefined === 0,
  };
}
