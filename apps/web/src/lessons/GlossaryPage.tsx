import {
  GLOSSARY,
  GLOSSARY_TOPICS,
  LESSONS,
  lessonsUsing,
  namesOf,
  type GlossaryTerm,
  type GlossaryTopic,
} from '@banglalab/lessons';
import { useMemo, useState } from 'react';

/** Lessons named before the rest are folded away behind a button. */
const FIRST_LESSONS = 4;
import { Link } from 'react-router';
import { useT } from '../i18n';
import { useHashScroll } from '../shell/useHashScroll';

const other = (locale: 'bn' | 'en') => (locale === 'bn' ? 'en' : 'bn');

/** Terms in the order of the reader's language. */
function sorted(terms: readonly GlossaryTerm[], locale: 'bn' | 'en') {
  return [...terms].sort((a, b) => a.term[locale].localeCompare(b.term[locale], locale));
}

/**
 * Terms matching a search, best first: a name that is the search, then a name
 * that starts with it, then one that contains it, then a match in the meaning.
 */
function search(query: string, locale: 'bn' | 'en') {
  const q = query.trim().toLocaleLowerCase();
  const rank = (term: GlossaryTerm) => {
    const names = namesOf(term).map((name) => name.toLocaleLowerCase());
    if (names.includes(q)) return 0;
    if (names.some((name) => name.startsWith(q))) return 1;
    if (names.some((name) => name.includes(q))) return 2;
    return term.meaning[locale].toLocaleLowerCase().includes(q) ? 3 : null;
  };
  return GLOSSARY.map((term) => ({ term, rank: rank(term) }))
    .filter((found): found is { term: GlossaryTerm; rank: number } => found.rank !== null)
    .sort(
      (a, b) => a.rank - b.rank || a.term.term[locale].localeCompare(b.term.term[locale], locale),
    )
    .map((found) => found.term);
}

/**
 * The glossary (G-1): every technical term the lab uses, in Bangla and English
 * side by side, with its meaning, the lessons it comes up in and related terms.
 * It is part of the app, so it works offline like the lessons.
 */
export function GlossaryPage() {
  const { t, locale, number } = useT();
  const [query, setQuery] = useState('');
  const [topic, setTopic] = useState<GlossaryTopic | 'all'>('all');
  useHashScroll();

  const searching = query.trim().length > 0;
  const shown = useMemo(() => {
    const found = searching ? search(query, locale) : sorted(GLOSSARY, locale);
    return topic === 'all' ? found : found.filter((term) => term.topic === topic);
  }, [query, searching, topic, locale]);
  const topics = GLOSSARY_TOPICS.filter((id) => shown.some((term) => term.topic === id));

  return (
    <main className="flex-1" data-testid="glossary">
      <div className="bg-mat text-chalk">
        <div className="mx-auto max-w-4xl px-4 pt-8 pb-10 sm:pt-12">
          <h1 className="text-3xl font-bold sm:text-[2.5rem] sm:leading-tight">
            {t('glossary.title')}
          </h1>
          <p className="mt-2 max-w-xl text-lg text-chalk/80">{t('glossary.intro')}</p>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-4 py-6">
        <div className="pb-3">
          <label className="relative block">
            <span className="sr-only">{t('glossary.search')}</span>
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-faint"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="6.5" />
              <path d="M16 16l4 4" strokeLinecap="round" />
            </svg>
            <input
              type="search"
              data-testid="glossary-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('glossary.search')}
              className="field pl-9"
            />
          </label>
          <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={t('glossary.title')}>
            {(['all', ...GLOSSARY_TOPICS] as const).map((id) => (
              <button
                key={id}
                type="button"
                className="chip"
                aria-pressed={topic === id}
                data-topic={id}
                onClick={() => setTopic(id)}
              >
                {id === 'all' ? t('glossary.all') : t(`glossary.topic.${id}`)}
              </button>
            ))}
          </div>
          <p className="mt-2 text-sm text-ink-faint tabular-nums" role="status">
            {t('glossary.count', { count: number(shown.length) })}
          </p>
        </div>

        {shown.length === 0 ? (
          <p className="mt-6 rounded-[var(--radius-card)] border border-line bg-surface p-4">
            {t('glossary.none')}
          </p>
        ) : searching ? (
          <ol className="mt-3 space-y-3">
            {shown.map((term) => (
              <Entry key={term.id} term={term} />
            ))}
          </ol>
        ) : (
          topics.map((id) => (
            <section key={id} className="mt-6" aria-labelledby={`topic-${id}`}>
              <h2 id={`topic-${id}`} className="mb-3 text-lg font-semibold">
                {t(`glossary.topic.${id}`)}
              </h2>
              <ol className="space-y-3">
                {shown
                  .filter((term) => term.topic === id)
                  .map((term) => (
                    <Entry key={term.id} term={term} />
                  ))}
              </ol>
            </section>
          ))
        )}
      </div>
    </main>
  );
}

function Entry({ term }: { term: GlossaryTerm }) {
  const { t, locale, number } = useT();
  const second = other(locale);
  const lessons = lessonsUsing(term, LESSONS);
  const [allLessons, setAllLessons] = useState(false);
  const listed = allLessons ? lessons : lessons.slice(0, FIRST_LESSONS);
  // Other names, leaving out any the heading already shows.
  const also = [...(term.also?.[locale] ?? []), ...(term.also?.[second] ?? [])].filter(
    (name) => name !== term.term.bn && name !== term.term.en,
  );
  const name = (id: string) => GLOSSARY.find((other) => other.id === id)?.term[locale] ?? id;
  return (
    <li
      id={term.id}
      data-testid="glossary-term"
      data-term={term.id}
      className="scroll-mt-4 rounded-[var(--radius-card)] border border-line bg-surface p-4 target:border-accent target:ring-2 target:ring-accent"
    >
      <h3 className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span lang={locale} className="text-xl font-bold">
          {term.term[locale]}
        </span>
        {term.term[second] !== term.term[locale] && (
          <span lang={second} className="text-lg text-ink-soft" data-testid="glossary-other">
            {term.term[second]}
          </span>
        )}
        {term.unit && (
          <span className="rounded-full bg-amber-soft px-2.5 py-0.5 text-sm font-medium text-amber-deep">
            {t('glossary.unit', { unit: term.unit })}
          </span>
        )}
      </h3>
      {also.length > 0 && (
        <p className="mt-1 text-sm text-ink-soft">
          {t('glossary.also', { names: also.join(', ') })}
        </p>
      )}
      <p className="mt-2 max-w-prose">{term.meaning[locale]}</p>
      {(lessons.length > 0 || (term.see ?? []).length > 0) && (
        <dl className="mt-3 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
          {lessons.length > 0 && (
            <>
              <dt className="font-semibold text-ink-soft">{t('glossary.inLessons')}</dt>
              <dd className="flex flex-wrap gap-x-3 gap-y-1">
                {listed.map((lesson) => (
                  <Link
                    key={lesson.id}
                    to={`/lessons#${lesson.id}`}
                    className="text-accent underline underline-offset-2"
                  >
                    {lesson.title[locale]}
                  </Link>
                ))}
                {listed.length < lessons.length && (
                  <button
                    type="button"
                    className="font-medium text-accent"
                    data-testid="glossary-more-lessons"
                    onClick={() => setAllLessons(true)}
                  >
                    {t('glossary.moreLessons', { count: number(lessons.length - listed.length) })}
                  </button>
                )}
              </dd>
            </>
          )}
          {(term.see ?? []).length > 0 && (
            <>
              <dt className="font-semibold text-ink-soft">{t('glossary.see')}</dt>
              <dd className="flex flex-wrap gap-x-3 gap-y-1">
                {term.see!.map((id) => (
                  <Link
                    key={id}
                    to={`/glossary#${id}`}
                    className="text-accent underline underline-offset-2"
                    data-see={id}
                  >
                    {name(id)}
                  </Link>
                ))}
              </dd>
            </>
          )}
        </dl>
      )}
    </li>
  );
}
