/**
 * Compiles the starter sketches to the .hex files shipped with the web app, so
 * a starter program runs immediately, even offline. Run after editing a
 * starter: pnpm --filter @banglalab/compile-worker starters:build
 */
import { execFileSync } from 'node:child_process';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { Compiler } from '../src/compiler';
import { loadConfig } from '../src/config';

const dir = new URL('../../../packages/board-emulators/fixtures/starters/', import.meta.url);
const toolchain = `avr-gcc ${execFileSync('avr-gcc', ['-dumpfullversion']).toString().trim()}`;
const compiler = new Compiler(loadConfig(), toolchain);

for (const file of (await readdir(dir)).filter((f) => f.endsWith('.ino')).sort()) {
  const source = await readFile(new URL(file, dir), 'utf8');
  const result = await compiler.compile({ board: 'uno', language: 'arduino', source });
  if (!result.ok) throw new Error(`${file}: ${JSON.stringify(result.diagnostics)}`);
  await writeFile(new URL(file.replace(/\.ino$/, '.hex'), dir), result.hex);
  console.log(`${file}: ${result.flashBytes} bytes flash, ${result.ramBytes} bytes RAM`);
}
