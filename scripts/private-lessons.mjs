// Copies the handbook's text for each kit lesson into the git-ignored
// private/lessons folder, so that the owner can compare the lab's own lessons
// with the handbook on their own computer. The handbook's rights are not yet
// confirmed: nothing this script writes may be committed or published.
//
//   node scripts/private-lessons.mjs --handbook <folder of chapter files> --map <map.json>
//
// The map names, for each lesson id, the handbook chapter file to read. It is
// kept in the private folder too, because it describes the handbook.
// Then serve the app with BANGLALAB_PRIVATE_LESSONS=1 to see the text in each lesson.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const option = (name) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : undefined;
};
const handbook = option('handbook');
const mapFile = option('map') ?? path.join(root, 'private/lessons/handbook-map.json');
const out = path.join(root, 'private/lessons');
if (!handbook) {
  console.error('usage: node scripts/private-lessons.mjs --handbook <folder> [--map <file>]');
  process.exit(2);
}

/** The chapter's text without front matter, comments or pictures. */
function clean(markdown) {
  return (
    markdown
      .replace(/^---\n[\s\S]*?\n---\n/, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      // The chapters carry some HTML for the printed book; only its words are kept.
      .replace(/<(br|\/p|\/div|\/li|\/h\d)\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}

const map = JSON.parse(readFileSync(mapFile, 'utf8'));
mkdirSync(out, { recursive: true });
for (const [lesson, chapter] of Object.entries(map)) {
  const text = clean(readFileSync(path.join(handbook, chapter), 'utf8'));
  const title = /^#{1,3}\s+(.+)$/m.exec(text)?.[1]?.trim() ?? chapter;
  writeFileSync(
    path.join(out, `${lesson}.handbook.json`),
    `${JSON.stringify({ lesson, title, text }, null, 2)}\n`,
  );
  console.log(`${lesson}: ${text.length} characters`);
}
