import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests run against the production build (with its service worker),
 * plus a real API and compile worker for the compile round trip.
 * Needs avr-gcc and bubblewrap installed; Postgres is not required.
 */
const WEB_PORT = 4174;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${WEB_PORT}`, trace: 'retain-on-failure' },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 768 } },
    },
    { name: 'android-phone', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    {
      command: `pnpm build && pnpm exec vite preview --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: 'pnpm --filter @banglalab/compile-worker start',
      url: 'http://127.0.0.1:4100/health',
      reuseExistingServer: !process.env.CI,
      env: { LOG_LEVEL: 'warn', COMPILE_CACHE_DIR: 'test-results/compile-cache' },
    },
    {
      command: 'pnpm --filter @banglalab/api start',
      url: 'http://127.0.0.1:4000/health',
      reuseExistingServer: !process.env.CI,
      // Every test comes from this one machine, and many of them compile: far more in a
      // minute than one student would.
      env: {
        LOG_LEVEL: 'warn',
        WEB_ORIGIN: `http://localhost:${WEB_PORT}`,
        COMPILES_PER_MINUTE: '600',
        // Each test signs up afresh, on two screen sizes at once.
        SIGN_INS_PER_MINUTE: '200',
        // Every browser of every test shares one address.
        REQUESTS_PER_MINUTE: '5000',
        // The local mailbox, readable by tests, so they can follow emailed links.
        DEV_MAILBOX: '1',
        // Schools work at once here; their approval by an owner is tested in the API's tests.
        SCHOOL_APPROVAL: 'automatic',
      },
    },
  ],
});
