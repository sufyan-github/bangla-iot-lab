import { useEffect, useState } from 'react';

/**
 * Handbook text for a lesson, for comparison on the owner's computer only.
 * It is read from the git-ignored `private/lessons` folder, and only when the
 * app is built or served with BANGLALAB_PRIVATE_LESSONS=1; otherwise the
 * module is empty and nothing of the handbook is in the app (see
 * private-lessons.ts). It is loaded as a piece of its own, so that the app
 * itself stays the same size.
 */
export interface HandbookText {
  title: string;
  text: string;
}

let loading: Promise<Record<string, HandbookText>> | null = null;

export function useHandbook(lessonId: string): HandbookText | undefined {
  const [text, setText] = useState<HandbookText | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    loading ??= import('virtual:private-lessons').then((module) => module.default);
    void loading.then((all) => !cancelled && setText(all[lessonId]));
    return () => {
      cancelled = true;
    };
  }, [lessonId]);
  return text;
}
