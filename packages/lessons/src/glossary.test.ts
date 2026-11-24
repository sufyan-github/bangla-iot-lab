import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  GLOSSARY,
  GLOSSARY_TOPICS,
  LESSONS,
  glossaryProblems,
  lessonText,
  lessonsUsing,
  termNamed,
  usesWord,
} from './index';

// The lab's own screens, in each language: the message catalogue as text.
const messages = readFileSync(new URL('../../i18n/src/messages.ts', import.meta.url), 'utf8');
const [bnMessages, enMessages] = messages.split(/^export const en\b/m) as [string, string];
const labText = {
  bn: bnMessages + LESSONS.map((lesson) => lessonText(lesson, 'bn')).join('\n'),
  en: enMessages + LESSONS.map((lesson) => lessonText(lesson, 'en')).join('\n'),
};

describe('the glossary', () => {
  it('is well formed: unique ids and names, related terms that exist', () => {
    expect(glossaryProblems({ terms: GLOSSARY })).toEqual([]);
    expect(GLOSSARY.length).toBeGreaterThanOrEqual(40);
    for (const topic of GLOSSARY_TOPICS) {
      expect(GLOSSARY.some((term) => term.topic === topic)).toBe(true);
    }
  });

  it('refuses a broken glossary, and says why', () => {
    const [first, second] = GLOSSARY as [(typeof GLOSSARY)[0], (typeof GLOSSARY)[0]];
    expect(glossaryProblems({ terms: [first, first] })).toContain(
      `"${first.id}" is in the glossary twice`,
    );
    expect(
      glossaryProblems({ terms: [{ ...first, see: ['nowhere'] }] }).some((p) =>
        p.includes('"nowhere", which is not a term'),
      ),
    ).toBe(true);
    expect(
      glossaryProblems({ terms: [first, { ...second, also: { bn: [first.term.bn] } }] }).some((p) =>
        p.includes('names both'),
      ),
    ).toBe(true);
    expect(glossaryProblems({ terms: [{ ...first, meaning: { bn: '' } }] }).length).toBeGreaterThan(
      0,
    );
  });

  it('uses the lab’s own words: every term appears in its lessons or screens', () => {
    const missing = GLOSSARY.flatMap((term) => [
      ...(usesWord(labText.bn, term.term.bn, 'bn') ? [] : [`bn "${term.term.bn}"`]),
      ...(usesWord(labText.en, term.term.en, 'en') ? [] : [`en "${term.term.en}"`]),
    ]);
    expect(missing).toEqual([]);
  });

  it('finds a term by any of its names, in either language and any case', () => {
    expect(termNamed('রেজিস্টর')?.id).toBe('resistor');
    expect(termNamed('Resistor')?.id).toBe('resistor');
    expect(termNamed(' বিভব পার্থক্য ')?.id).toBe('voltage');
    expect(termNamed('ওহমের সূত্র')?.id).toBe('ohms-law');
    expect(termNamed('D27')).toBeUndefined();
  });

  it('finds a word only where a word starts', () => {
    expect(usesWord('বোর্ডের পিনে', 'বোর্ড', 'bn')).toBe(true);
    expect(usesWord('ব্রেডবোর্ডে বসাও', 'বোর্ড', 'bn')).toBe(false);
    expect(usesWord('two LEDs here', 'LED', 'en')).toBe(true);
    expect(usesWord('ledcWrite(0)', 'LED', 'en')).toBe(false);
    expect(usesWord("by Ohm's law", "Ohm's law", 'en')).toBe(true);
  });

  it('knows which lessons use a term', () => {
    const using = lessonsUsing(termNamed('ওহমের সূত্র')!, LESSONS).map((lesson) => lesson.id);
    expect(using).toContain('led-resistor');
    expect(lessonsUsing(termNamed('truth table')!, LESSONS).length).toBeGreaterThan(0);
  });
});
