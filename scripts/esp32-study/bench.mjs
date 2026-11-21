// ESP32 feasibility study, step 3: a speed test page for a browser or a phone.
//
//   WASI_ROOT=<toolchain> node scripts/esp32-study/bench.mjs --work <build folder>
//        [--serve <port>] [--lan] [--board-ms <n>]
//
// Builds the prototype's own test sketches (spikes/esp32-api/tests) as
// WebAssembly modules and writes a small static site to <build folder>/bench:
// the page, the JavaScript world and the modules, with the result each sketch
// gave on this machine so the browser can prove it gets the same.
//
// --serve starts a web server for it on this computer only. Add --lan to let a
// phone on the same network open it; that makes the page visible to that
// network for as long as the command runs.
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { library } from './lib.mjs';
import { buildLibraryWasm, buildSketchWasm, missingTools, runSketchWasm } from './wasm.mjs';

const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
};
const work = option('work');
if (!work) {
  console.error(
    'usage: node scripts/esp32-study/bench.mjs --work <build folder> [--serve port] [--lan] [--board-ms n]',
  );
  process.exit(2);
}
const missing = missingTools();
if (missing.length) {
  console.error(`The WebAssembly toolchain is incomplete. Missing:\n  ${missing.join('\n  ')}`);
  process.exit(2);
}

const site = path.join(work, 'bench');
mkdirSync(site, { recursive: true });
buildLibraryWasm(work);
const tests = path.join(library, 'tests');
const sketches = [];
for (const name of readdirSync(tests).sort()) {
  const built = buildSketchWasm(work, path.join(tests, name), name);
  if (!built.ok) throw new Error(`${name} did not build:\n${built.log}`);
  const scenario = JSON.parse(readFileSync(path.join(tests, name, 'scenario.json'), 'utf8'));
  const run = runSketchWasm(built.module, scenario);
  cpSync(built.module, path.join(site, `${name}.wasm`));
  sketches.push({
    name,
    file: `${name}.wasm`,
    scenario: { runMs: scenario.runMs, script: scenario.script },
    trace: run.trace,
    serial: run.serial,
  });
}
writeFileSync(
  path.join(site, 'manifest.json'),
  JSON.stringify({ boardMs: Number(option('board-ms') ?? 60000), sketches }),
);
for (const file of ['bench/index.html', 'bench/bench.mjs', 'world.mjs'])
  cpSync(path.join(library, 'wasm', file), path.join(site, path.basename(file)));
console.log(`Speed test site written to ${site} (${sketches.length} sketches).`);

const port = option('serve');
if (port) {
  const TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.wasm': 'application/wasm',
  };
  const host = args.includes('--lan') ? '0.0.0.0' : '127.0.0.1';
  createServer((request, response) => {
    const name = path.basename(new URL(request.url, 'http://x').pathname) || 'index.html';
    const file = path.join(site, name);
    if (!TYPES[path.extname(name)] || !existsSync(file) || !statSync(file).isFile()) {
      response.writeHead(404).end('not found');
      return;
    }
    response.writeHead(200, {
      'content-type': TYPES[path.extname(name)],
      'cache-control': 'no-store',
    });
    response.end(readFileSync(file));
  }).listen(Number(port), host, () => {
    console.log(`Open http://localhost:${port}/ on this computer.`);
    if (host === '0.0.0.0')
      for (const addresses of Object.values(networkInterfaces()))
        for (const address of addresses ?? [])
          if (address.family === 'IPv4' && !address.internal)
            console.log(`On a phone on the same network: http://${address.address}:${port}/`);
  });
}
