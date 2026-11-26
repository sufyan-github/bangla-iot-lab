// The steps around `vite build` for Cloudflare (D-118).
//
//   node scripts/cloudflare.mjs before   refuses a build that would carry private text
//   node scripts/cloudflare.mjs after    writes dist/_headers, then checks dist again
//
// The server's address is VITE_API_URL, as for every build of the app.
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const web = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dist = path.join(web, 'dist');
const repository = path.resolve(web, '../..');
const step = process.argv[2];

function fail(message) {
  console.error(`cloudflare build: ${message}`);
  process.exit(1);
}

/** Everything under a folder, as paths. */
function files(folder) {
  return readdirSync(folder).flatMap((name) => {
    const full = path.join(folder, name);
    return statSync(full).isDirectory() ? files(full) : [full];
  });
}

/**
 * The handbook text and other private material on this computer, as short
 * passages to look for in the build: none may be in a public site.
 */
function privatePassages() {
  const passages = [];
  for (const folder of ['private/lessons', 'data/private']) {
    const root = path.join(repository, folder);
    if (!existsSync(root)) continue;
    for (const file of files(root).filter((f) => f.endsWith('.json'))) {
      try {
        const content = JSON.parse(readFileSync(file, 'utf8'));
        for (const value of [content.title, content.text]) {
          if (typeof value === 'string' && value.trim().length >= 24) {
            passages.push(value.trim().slice(0, 48));
          }
        }
      } catch {
        // Not a file of passages.
      }
    }
  }
  return passages;
}

/** The response headers for every file, and the caching each kind needs to work offline. */
function headers(apiUrl) {
  const api = new URL(apiUrl).origin;
  const policy = [
    "default-src 'self'",
    // The simulation's WebAssembly (the ESP32 chip emulator) needs this, and nothing else does.
    "script-src 'self' 'wasm-unsafe-eval'",
    "worker-src 'self'",
    `connect-src 'self' ${api}`,
    "img-src 'self' data: blob:",
    // The code editor adds its own style elements.
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
  return `/*
  Content-Security-Policy: ${policy}
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), serial=(self)

/index.html
  Cache-Control: no-cache
/sw.js
  Cache-Control: no-cache
/registerSW.js
  Cache-Control: no-cache
/manifest.webmanifest
  Cache-Control: no-cache

/assets/*
  Cache-Control: public, max-age=31536000, immutable
`;
}

if (step === 'before') {
  if (process.env.BANGLALAB_PRIVATE_LESSONS === '1') {
    fail(
      'BANGLALAB_PRIVATE_LESSONS=1 puts the handbook in the build; a public site must not have it.',
    );
  }
} else if (step === 'after') {
  if (!existsSync(path.join(dist, 'index.html'))) fail('no dist/index.html: run the build first.');
  const apiUrl = process.env.VITE_API_URL ?? 'http://localhost:4000';
  if (!process.env.VITE_API_URL) {
    console.warn(
      'cloudflare build: VITE_API_URL is not set; this build talks to a server on this computer.',
    );
  }
  writeFileSync(path.join(dist, '_headers'), headers(apiUrl));
  const passages = privatePassages();
  for (const file of files(dist)) {
    if (!/\.(html|js|json|css|txt|webmanifest)$/.test(file)) continue;
    const text = readFileSync(file, 'utf8');
    const found = passages.find((passage) => text.includes(passage));
    if (found) fail(`${path.relative(web, file)} carries private text; it is not repeated here.`);
  }
  console.log(
    `cloudflare build: dist is ready, with headers for ${new URL(apiUrl).origin}; ` +
      `checked against ${passages.length} private passages on this computer.`,
  );
} else {
  fail('say "before" or "after".');
}
