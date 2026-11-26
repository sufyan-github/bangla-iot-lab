# Running the lab on Cloudflare

The plan (D-118) moves the lab to Cloudflare in five stages, each tested here
first and deployed only on the owner's approval:

1. **The web app on Workers**, as static files. Built.
2. The compile service in Cloudflare Containers. Not started.
3. The server on Workers and D1. Not started; waits for the owner's choice of
   where children's data is stored, and of password hashing.
4. Email through Cloudflare's email service. Not started.
5. A staging site, then production. Not started.

## Stage 1: the web app

From `apps/web`:

```sh
VITE_API_URL=https://api.example.org pnpm build:cloudflare
pnpm preview:cloudflare   # Cloudflare's own runtime, on http://localhost:4175
```

`build:cloudflare` is the ordinary build with two steps around it:

- **Before**, it refuses to run with `BANGLALAB_PRIVATE_LESSONS=1`, which would
  put the handbook in the build.
- **After**, it writes `dist/_headers`, then looks through the build for any
  passage of the private material on this computer (`private/lessons`,
  `data/private`) and stops if it finds one.

The headers it writes:

| Path                                                           | Headers                                                                                                                                                                                                                                                                            |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Everything                                                     | A content security policy (scripts only from the site, WebAssembly allowed for the chip emulator, requests only to the site and the server at `VITE_API_URL`, never in a frame), `nosniff`, a referrer policy, and a permissions policy that allows serial ports to this site only |
| `index.html`, `sw.js`, `registerSW.js`, `manifest.webmanifest` | `no-cache`, so a new version reaches students on their next visit                                                                                                                                                                                                                  |
| `/assets/*`                                                    | Cached for a year: their names change whenever they do                                                                                                                                                                                                                             |

`wrangler.jsonc` serves `dist` with single-page routing: an address that is not
a file is one of the app's own pages.

The browser tests run against this build, served by Cloudflare's runtime:

```sh
pnpm build:cloudflare
pnpm exec playwright test -c playwright.cloudflare.config.ts
```

Deploying needs the owner's Cloudflare account (Workers Paid, for stages 2 to 4) and the owner's approval. No script here deploys.
