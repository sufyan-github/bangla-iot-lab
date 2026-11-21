# Testing guide

| Suite       | Command                                            | Needs                                                                                        | What it proves                                                                                                                                |
| ----------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit        | `pnpm test`                                        | nothing                                                                                      | Solver, device models, breadboard, editing rules, simulation diagnostics, UNO emulator, i18n, storage, API routes (worker stubbed)            |
| Integration | `pnpm test:integration`                            | `pnpm db:up`, avr-gcc, bubblewrap, Arduino core (`core:fetch`), Pico firmware (`pico:fetch`) | Migrations and constraints on real PostgreSQL 18; real compiles inside the sandbox; sandbox escape attempts; MicroPython on the emulated Pico |
| End to end  | `pnpm test:e2e`                                    | avr-gcc, bubblewrap, Chromium                                                                | The production build in a browser, desktop and phone profiles, including the offline reload                                                   |
| Static      | `pnpm lint`, `pnpm format:check`, `pnpm typecheck` | nothing                                                                                      | Style, layering rule, types                                                                                                                   |

Integration tests fail loudly when a service is missing. No test is skipped.

## Golden circuit tests

`packages/circuit-engine/src/golden-cases.ts` defines the reference circuits.
`pnpm golden:regen` solves them with ngspice and rewrites `golden/*.json`;
review the diff before committing. The test compares every node voltage and
source current, and also checks the stored SPICE deck still matches the circuit.

To add a case: add it to `GOLDEN_CASES`, run `pnpm golden:regen`, commit the new JSON.

## Golden firmware tests

`packages/board-emulators/fixtures/blink.c` is compiled to `blink.hex`
(`pnpm fixtures:firmware`, needs avr-gcc) and checked in, so the emulator's unit
test needs no toolchain. The compile-worker integration test compiles the same
source and runs the result in the emulator.

## Starter firmware

The four starter sketches in `packages/board-emulators/fixtures/starters/` ship
with compiled `.hex` files so they run offline. An integration test recompiles
each sketch and fails if the shipped firmware is stale; rebuild with
`pnpm --filter @banglalab/compile-worker starters:build`.

## Board and instrument tests

`packages/simulation/src/session.test.ts` runs real firmware against circuits
with a simulated clock: blink timing and current, button, PWM brightness,
potentiometer, capacitor curves, recorded signals. `apps/web/e2e/uno.spec.ts`
covers the same workflows in the browser, including upload through the real
API and sandboxed worker.

## Phase 0 acceptance test

`apps/web/e2e/acceptance.spec.ts`, first test. It builds the LED circuit by
tapping, runs it, checks the LED current against the hand calculation
(21.8 mA ± 2 %), renames the project, waits for the save, disables the network,
reloads, and checks the project reopens and runs.

## Not covered yet

- Real touch gestures (the phone profile uses emulated mouse input) and real devices.
- Automated accessibility audit; keyboard-only operation of the canvas.
- Load and performance tests on low-end Android.
- The compile-worker Docker image and the CI workflow have been written but not run.
