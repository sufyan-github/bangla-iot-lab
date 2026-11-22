import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { privateLessonsSource } from '../../private-lessons';

describe('private handbook text', () => {
  const folder = mkdtempSync(path.join(tmpdir(), 'private-lessons-'));
  afterAll(() => rmSync(folder, { recursive: true, force: true }));
  writeFileSync(
    path.join(folder, 'esp32-blink.handbook.json'),
    JSON.stringify({ lesson: 'esp32-blink', title: 'T', text: 'handbook words' }),
  );

  it('is left out of the app unless it is asked for', () => {
    expect(privateLessonsSource(false, folder)).toBe('export default {};');
    expect(privateLessonsSource(true, path.join(folder, 'missing'))).toBe('export default {};');
  });

  it('is read from the private folder when asked for', () => {
    const source = privateLessonsSource(true, folder);
    expect(source).toContain('"esp32-blink"');
    expect(source).toContain('handbook words');
  });
});
