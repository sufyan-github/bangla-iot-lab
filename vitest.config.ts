import { defineConfig } from 'vitest/config';

// Unit tests: no database, no compiler toolchain, no network.
// Tests that need Postgres or avr-gcc are named *.itest.ts and run with `pnpm test:integration`.
export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts', 'apps/*/src/**/*.test.{ts,tsx}'],
    environment: 'node',
    // Several tests run seconds of emulated processor time. They are deterministic, so the
    // limit only needs to catch a hang; the default 5 s fails them on a busy machine.
    testTimeout: 30_000,
  },
});
