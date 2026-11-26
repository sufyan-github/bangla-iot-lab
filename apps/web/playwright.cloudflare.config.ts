import { defineConfig } from '@playwright/test';
import base from './playwright.config';
import { panelsKeptOpen } from './e2e/panels';

/**
 * The browser tests against the build for Cloudflare (D-118), served by
 * Cloudflare's own runtime (wrangler) with its headers: its content security
 * policy, caching and page routing. The API and compile worker are the same
 * as for the ordinary run. Start it with `pnpm build:cloudflare` first.
 */
const PORT = 4175;
const origin = `http://localhost:${PORT}`;
const [, compileWorker, api] = base.webServer as NonNullable<
  Extract<typeof base.webServer, unknown[]>
>;

export default defineConfig({
  ...base,
  use: { ...base.use, baseURL: origin },
  projects: base.projects!.map((project) =>
    project.name === 'desktop'
      ? { ...project, use: { ...project.use, storageState: panelsKeptOpen(origin) } }
      : project,
  ),
  webServer: [
    {
      command: `pnpm exec wrangler dev --port ${PORT}`,
      url: origin,
      reuseExistingServer: true,
      timeout: 120_000,
    },
    compileWorker!,
    { ...api!, env: { ...api!.env, WEB_ORIGIN: origin } },
  ],
});
