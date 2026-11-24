import type { GlossaryTerm } from '@banglalab/lessons';
import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useT } from '../i18n';

/**
 * A technical term in lesson text: shown in bold with its name in the other
 * language beside it, and a tap opens its meaning, with a link to the glossary.
 * The link opens a new tab, so the lesson in the lab stays as it is.
 */
export function Term({ text, term }: { text: string; term: GlossaryTerm }) {
  const { t, locale } = useT();
  const [open, setOpen] = useState(false);
  const id = useId();
  const box = useRef<HTMLSpanElement>(null);
  const second = locale === 'bn' ? 'en' : 'bn';
  const otherName = term.term[second];
  const sameName = otherName.toLocaleLowerCase() === text.trim().toLocaleLowerCase();

  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent && event.key !== 'Escape') return;
      if (event instanceof PointerEvent && box.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('keydown', close);
    document.addEventListener('pointerdown', close);
    return () => {
      document.removeEventListener('keydown', close);
      document.removeEventListener('pointerdown', close);
    };
  }, [open]);

  return (
    <span ref={box} className="relative">
      <button
        type="button"
        className="term"
        aria-expanded={open}
        aria-controls={id}
        data-testid="term"
        data-term={term.id}
        onClick={() => setOpen((was) => !was)}
      >
        <strong>{text}</strong>
        {!sameName && (
          <span lang={second} className="term-other">
            {' '}
            ({otherName})
          </span>
        )}
      </button>
      <span id={id} role="note" hidden={!open} className="term-tip" data-testid="term-tip">
        {term.meaning[locale]}{' '}
        <Link
          to={`/glossary#${term.id}`}
          target="_blank"
          rel="noopener"
          className="font-medium text-accent underline underline-offset-2"
        >
          {t('glossary.open')}
        </Link>
      </span>
    </span>
  );
}
