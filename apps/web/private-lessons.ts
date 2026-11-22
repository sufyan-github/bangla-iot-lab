import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

/**
 * Gives the app the handbook text kept in the git-ignored `private/lessons`
 * folder, as the module `virtual:private-lessons`, for comparing the lab's
 * own lessons with the handbook on the owner's computer.
 *
 * Off unless BANGLALAB_PRIVATE_LESSONS=1: the handbook's rights are not yet
 * confirmed, so an ordinary build, and every build in CI, contains none of it.
 */
export const PRIVATE_LESSONS_MODULE = 'virtual:private-lessons';

export function privateLessonsSource(enabled: boolean, folder: string): string {
  if (!enabled || !existsSync(folder)) return 'export default {};';
  const lessons: Record<string, { title: string; text: string }> = {};
  for (const file of readdirSync(folder).filter((name) => name.endsWith('.handbook.json'))) {
    const content = JSON.parse(readFileSync(path.join(folder, file), 'utf8')) as {
      lesson: string;
      title: string;
      text: string;
    };
    lessons[content.lesson] = { title: content.title, text: content.text };
  }
  return `export default ${JSON.stringify(lessons)};`;
}

export function privateLessons(folder: string): Plugin {
  const resolved = `\0${PRIVATE_LESSONS_MODULE}`;
  return {
    name: 'banglalab-private-lessons',
    resolveId: (id) => (id === PRIVATE_LESSONS_MODULE ? resolved : undefined),
    load: (id) =>
      id === resolved
        ? privateLessonsSource(process.env.BANGLALAB_PRIVATE_LESSONS === '1', folder)
        : undefined,
  };
}
