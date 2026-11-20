import { defineConfig } from 'vitest/config';

// Unit tests: no database, no compiler toolchain, no network.
// Tests that need Postgres or avr-gcc are named *.itest.ts and run with `pnpm test:integration`.
export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts', 'apps/*/src/**/*.test.{ts,tsx}'],
    environment: 'node',
  },
});
