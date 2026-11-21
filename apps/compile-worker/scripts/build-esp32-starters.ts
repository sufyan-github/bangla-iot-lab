/**
 * Compiles the ESP32 starter sketches to the modules shipped with the web app,
 * so a starter program runs immediately, even offline. Run after editing a
 * starter or the board library:
 *   pnpm --filter @banglalab/compile-worker esp32-starters:build
 *
 * Each module is written as base64 text beside its sketch, and built.json
 * records what each was built from, so a test can tell when one is out of date
 * without needing the toolchain.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { Compiler } from '../src/compiler';
import { loadConfig } from '../src/config';
import { esp32SourceHash } from '../src/esp32-library';

const dir = new URL('../../../packages/board-emulators/fixtures/esp32-starters/', import.meta.url);
const compiler = new Compiler(loadConfig(), 'esp32-starters');
const { toolchain } = await compiler.prepareEsp32();

const built: Record<string, { sourceHash: string; bytes: number }> = {};
for (const file of (await readdir(dir)).filter((f) => f.endsWith('.ino')).sort()) {
  const source = await readFile(new URL(file, dir), 'utf8');
  const result = await compiler.compile({ board: 'esp32', language: 'arduino', source });
  if (!result.ok) throw new Error(`${file}: ${JSON.stringify(result.diagnostics)}`);
  const name = file.replace(/\.ino$/, '');
  await writeFile(new URL(`${name}.wasm.base64`, dir), `${result.hex}\n`);
  built[name] = { sourceHash: esp32SourceHash(source), bytes: result.flashBytes };
  console.log(`${file}: ${result.flashBytes} bytes`);
}
await writeFile(
  new URL('built.json', dir),
  `${JSON.stringify({ toolchain: toolchain.version, starters: built }, null, 2)}\n`,
);
