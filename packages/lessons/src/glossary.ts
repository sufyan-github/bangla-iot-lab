import { Type, type Static } from 'typebox';
import { Value } from 'typebox/value';
import raw from '../content/glossary/terms.json' with { type: 'json' };
import { Text, type Lesson } from './schema';

/**
 * The glossary of technical terms, side by side in Bangla and English (G-1).
 * Each term is the word the lab itself uses (a test checks that it appears in
 * the lab's lessons or screens), with other common names, such as the word a
 * textbook may use, and a short meaning in both languages. Its text is
 * CC BY 4.0, like the lessons (see content/README.md).
 */
export const GLOSSARY_TOPICS = [
  'basics',
  'parts',
  'boards',
  'logic',
  'instruments',
  'iot',
] as const;
export type GlossaryTopic = (typeof GLOSSARY_TOPICS)[number];

const Names = Type.Array(Type.String({ minLength: 1 }), { minItems: 1 });

export const GlossaryTermSchema = Type.Object(
  {
    id: Type.String({ pattern: '^[a-z0-9]+(-[a-z0-9]+)*$' }),
    topic: Type.Union(GLOSSARY_TOPICS.map((topic) => Type.Literal(topic))),
    /** The term as the lab writes it, in each language. */
    term: Text,
    /** Other names in use, such as a textbook's word. */
    also: Type.Optional(
      Type.Object(
        { bn: Type.Optional(Names), en: Type.Optional(Names) },
        { additionalProperties: false },
      ),
    ),
    /** The unit it is measured in, as symbols. */
    unit: Type.Optional(Type.String({ minLength: 1 })),
    meaning: Text,
    /** Related terms, by id. */
    see: Type.Optional(Type.Array(Type.String())),
  },
  { additionalProperties: false },
);
export type GlossaryTerm = Static<typeof GlossaryTermSchema>;

/** Everything wrong with a glossary: its shape, duplicate ids and names, links to nowhere. */
export function glossaryProblems(value: unknown): string[] {
  const list = (value as { terms?: unknown })?.terms;
  if (!Array.isArray(list)) return ['the glossary needs a list of terms'];
  const problems: string[] = [];
  const ids = new Set<string>();
  const names = new Map<string, string>();
  for (const [i, entry] of list.entries()) {
    if (!Value.Check(GlossaryTermSchema, entry)) {
      for (const error of Value.Errors(GlossaryTermSchema, entry)) {
        problems.push(`term ${i + 1}${error.instancePath}: ${error.message}`);
      }
      continue;
    }
    if (ids.has(entry.id)) problems.push(`"${entry.id}" is in the glossary twice`);
    ids.add(entry.id);
    // A word may name only one term, or the lessons could not tell which was meant.
    for (const name of namesOf(entry)) {
      const key = name.toLocaleLowerCase();
      const other = names.get(key);
      if (other !== undefined && other !== entry.id) {
        problems.push(`"${name}" names both "${other}" and "${entry.id}"`);
      }
      names.set(key, entry.id);
    }
  }
  for (const entry of list as GlossaryTerm[]) {
    for (const id of entry.see ?? []) {
      if (id === entry.id) problems.push(`"${entry.id}" refers to itself`);
      else if (!ids.has(id)) problems.push(`"${entry.id}" refers to "${id}", which is not a term`);
    }
  }
  return problems;
}

/** Every name of a term, in both languages. */
export function namesOf(term: GlossaryTerm): string[] {
  return [term.term.bn, term.term.en, ...(term.also?.bn ?? []), ...(term.also?.en ?? [])];
}

function load(): GlossaryTerm[] {
  const problems = glossaryProblems(raw);
  if (problems.length > 0) throw new Error(`Glossary: ${problems.join('; ')}`);
  return [...(raw as { terms: GlossaryTerm[] }).terms];
}

export const GLOSSARY: readonly GlossaryTerm[] = load();

const byName = new Map(
  GLOSSARY.flatMap((term) => namesOf(term).map((name) => [name.toLocaleLowerCase(), term])),
);

/** The term a piece of text names exactly (in either language, any case), if any. */
export function termNamed(text: string): GlossaryTerm | undefined {
  return byName.get(text.trim().toLocaleLowerCase());
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Whether a text uses a word. The word must start a word of the text; in
 * Bangla an ending may follow (বোর্ডে, বোর্ডের), and in English a plural.
 * So "বোর্ড" is not found in "ব্রেডবোর্ড", nor "LED" in "ledc".
 */
export function usesWord(text: string, word: string, locale: 'bn' | 'en'): boolean {
  const ending = locale === 'en' ? '(?:e?s)?(?![\\p{L}\\p{M}\\p{N}])' : '';
  return new RegExp(`(?<![\\p{L}\\p{M}\\p{N}])${escape(word)}${ending}`, 'iu').test(text);
}

/** All the words a student reads in a lesson, in one language. */
export function lessonText(lesson: Lesson, locale: 'bn' | 'en'): string {
  return [
    lesson.title[locale],
    lesson.summary[locale],
    ...lesson.steps.map((step) => step.text[locale]),
    ...lesson.learned[locale],
    lesson.tryNext[locale],
  ].join('\n');
}

/** The lessons that use a term, by the lab's own word for it in either language. */
export function lessonsUsing(term: GlossaryTerm, lessons: readonly Lesson[]): Lesson[] {
  return lessons.filter(
    (lesson) =>
      usesWord(lessonText(lesson, 'bn'), term.term.bn, 'bn') ||
      usesWord(lessonText(lesson, 'en'), term.term.en, 'en'),
  );
}
