import { defineConfig } from 'vitest/config';

// Integration tests need local services: Postgres (`pnpm db:up`) and the AVR toolchain (avr-gcc).
// They fail loudly when a service is missing; they are never skipped.
export default defineConfig({
  test: {
    include: ['apps/*/src/**/*.itest.ts', 'packages/*/src/**/*.itest.ts'],
    environment: 'node',
    testTimeout: 30_000,
    fileParallelism: false,
  },
});
