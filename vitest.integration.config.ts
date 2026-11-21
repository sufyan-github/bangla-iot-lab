import { defineConfig } from 'vitest/config';

// Integration tests need local services: Postgres (`pnpm db:up`), the AVR toolchain (avr-gcc)
// and, for the ESP32 library prototype, g++.
// They fail loudly when a service is missing; they are never skipped.
export default defineConfig({
  test: {
    include: ['apps/*/src/**/*.itest.ts', 'packages/*/src/**/*.itest.ts', 'spikes/*/*.itest.mjs'],
    environment: 'node',
    testTimeout: 30_000,
    fileParallelism: false,
  },
});
