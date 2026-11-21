# Phase 0 report — foundation and proof of concept

Date: 20 November 2026. Status: **complete, awaiting owner review.**

## 1. Starting condition

The working folder was empty: no code, no documentation, no git history. There
was nothing to preserve and no technical debt to assess, so Phase 0 is a
greenfield build. The machine provided Node 22.23, pnpm 12, Docker,
PostgreSQL 18 (image), avr-gcc 14.3 with avr-libc, and bubblewrap. It did not
have ngspice, ArduinoCore-avr or Node 26.

## 2. Acceptance result

> A student can create a basic LED circuit, run it, observe correct behaviour,
> save it, and reopen it offline.

**Passed**, automatically, in Chromium with a desktop profile and an Android
phone profile (`apps/web/e2e/acceptance.spec.ts`):

| Step           | Evidence                                                                                                                                                       |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create         | Battery, resistor, LED and four wires placed by tapping holes                                                                                                  |
| Run            | LED state `on`; current 21.8 mA, within 2 % of the hand calculation (9 V − 1.8 V) / 330 Ω                                                                      |
| Observe        | Meter shows current and voltage; message "LED জ্বলছে!"                                                                                                          |
| Save           | Rename, wait for "সেভ হয়েছে"                                                                                                                                   |
| Reopen offline | Network disabled, page reloaded: app loads from the service worker, project reopens from IndexedDB, runs with the same current, and is listed on the home page |

## 3. Phase 0 task list

| #   | Task                                | Result                                                                     |
| --- | ----------------------------------- | -------------------------------------------------------------------------- |
| 1   | Inspect repository                  | Empty; recorded above                                                      |
| 2   | Technical requirements document     | `docs/requirements/technical-requirements.md`                              |
| 3   | Architecture and data-flow diagrams | `docs/architecture/overview.md` (Mermaid)                                  |
| 4   | TypeScript monorepo                 | pnpm workspace: 3 apps, 5 packages                                         |
| 5   | Lint, format, types, tests          | ESLint 10, Prettier, TypeScript 6 strict, Vitest 5, Playwright             |
| 6   | React/Vite application              | `apps/web`, Tailwind 4, React 19, PWA                                      |
| 7   | Fastify API                         | `apps/api`: health, readiness, compile proxy                               |
| 8   | PostgreSQL and migrations           | 9 tables, Drizzle migration, constraint tests on PostgreSQL 18             |
| 9   | Breadboard workspace                | 30-column board, tap to place, drag to move, zoom                          |
| 10  | Battery, resistor, LED              | With colour bands, five LED colours, six battery voltages                  |
| 11  | First DC solver                     | MNA + Newton-Raphson, verified against ngspice 45.2                        |
| 12  | Show current and voltage            | Meter panel, per-part table, on-board labels, current-flow animation       |
| 13  | Minimal UNO emulator test           | avr8js wrapper; blink timing and serial verified                           |
| 14  | Compile-worker proof of concept     | Sandboxed avr-gcc, cache, limits; browser → API → worker → emulator tested |
| 15  | Local saving and offline reopening  | Dexie autosave, service worker precache, e2e test                          |

Beyond the list: Bangla/English switching, ten plain-language diagnostics,
project thumbnails, CI workflow (unrun), student guide in Bangla.

## 4. Automated test results (20 November 2026)

| Suite                                            | Result                                     |
| ------------------------------------------------ | ------------------------------------------ |
| ESLint, Prettier, TypeScript (8 projects)        | clean                                      |
| Unit (Vitest)                                    | 102 passed, 0 failed, 0 skipped — 11 files |
| Integration (PostgreSQL 18, avr-gcc, bubblewrap) | 12 passed, 0 failed, 0 skipped             |
| End to end (Playwright, 2 profiles)              | 14 passed, 0 failed, 0 skipped             |
| `pnpm audit --prod`                              | no known vulnerabilities                   |

Solver agreement with ngspice on the ten golden circuits: every node voltage
within 1 µV and every source current within 1 nA (plus 10 ppm).

## 5. How to see it working

```bash
pnpm install && pnpm db:up && pnpm db:migrate && pnpm dev
```

Open http://localhost:5173 → "উদাহরণ খোলো: LED জ্বালাও" → "চালু করো". Then try:
swap the LED's legs, pick a 100 Ω resistor, delete a wire, drag a wire end to
the wrong column. Each produces a different explanation. "আরডুইনো পরীক্ষা" runs
the emulated UNO; change `_delay_ms(500)` and press "কম্পাইল করে চালাও".

## 6. Known issues and limitations

Simulation

- DC only; no capacitors or time-dependent behaviour.
- The LED model has no series resistance, so current is overestimated when an
  LED is badly overdriven. Burn-out is reported but not permanent.
- Part values are typical figures, not measurements.

Editor

- No undo/redo, no copy, no rotate control (drag a lead instead).
- Batteries cannot be repositioned; at most two.
- The canvas cannot be operated by keyboard alone.
- On a phone the board is wider than the screen and must be scrolled; a new
  example opens with the LED off-screen to the right.
- Touch dragging is implemented with pointer events but was tested only with
  emulated mouse input, not a real touch screen.

Microcontroller

- The UNO emulator is a separate page; it is not connected to the breadboard.
- Only plain avr-libc C compiles. No Arduino functions, no Blockly, no Pico.
- The LED indicator samples pin 13 once per frame, so blinking faster than
  about 30 Hz is not shown faithfully.

Platform

- No accounts, roles, sync, lessons, classes, AI tutor or gallery.
- The API is unauthenticated and therefore localhost-only (decision D-014).
- The compile-worker Docker image and the CI workflow were written but never built or run.
- Node 22 instead of Node 26; TypeScript 6 instead of 7 (decisions D-001, D-002).

## 7. Performance observations

Measured on the development laptop (8 cores), not on target devices.

| Measure                                        | Value                                            |
| ---------------------------------------------- | ------------------------------------------------ |
| Solve the LED example (simulate())             | about 19 µs, 5 Newton iterations                 |
| UNO emulation, 2.1 s of simulated time in Node | about 1.5 s wall clock                           |
| Compile blink (cold / cached)                  | about 50 ms / under 10 ms                        |
| Web bundle                                     | 503 kB JS (158 kB gzip), 27 kB CSS, 198 kB fonts |
| Offline precache                               | 15 files, about 805 kB                           |

The main bundle is larger than it should be for low-bandwidth use; splitting
the Arduino page and the schema validator out of the first load is an easy
Phase 1 win. No measurement has been made on a low-end Android phone.

## 8. Security observations

- Submitted code is compiled only in the worker, inside a per-job bubblewrap
  namespace: no network, no home directory, no `/etc`, empty environment,
  10-second limit, 64 kB source limit, bounded queue. Tests confirm that
  `#include "/etc/passwd"` and `.incbin` cannot read host files.
- Not yet limited per job: CPU and memory (only time). Add before any exposure.
- No shell is ever invoked with user input (`execFile` with argument arrays).
- API: schema validation on every body, unknown properties stripped, rate
  limits, CORS restricted to the web origin, internal errors never echoed.
- Database: learners cannot be given an email or a platform role (CHECK
  constraints, tested). No personal data is collected by the Phase 0 app at all;
  projects stay on the device.
- Development credentials in `infra/docker/compose.dev.yml` are throwaway and
  bound to localhost. No secrets are in the repository.
- Three moderate advisories exist in build-time tooling only (esbuild inside
  drizzle-kit; glob and minimatch inside workbox-build). Nothing shipped to
  users is affected.

## 9. Risks and dependencies for Phase 1

| Risk                                         | Why it matters                                                  | Mitigation                                                                     |
| -------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Co-simulating the MCU with the analog solver | Pin changes at MHz rates cannot each trigger a circuit solve    | Event-driven scheduler with a fixed analog step; design it before adding parts |
| Transient analysis stability                 | Capacitors plus diodes stress Newton-Raphson                    | Backward Euler first, step control, golden transient cases from ngspice        |
| ArduinoCore-avr in the sandbox               | Build time and cache size grow; licence is LGPL                 | Precompile the core once per toolchain; keep it a separate artefact            |
| rp2040js + MicroPython                       | Firmware compatibility is unproven                              | Time-boxed spike with a go/no-go before committing                             |
| Blockly ↔ text code relationship             | Silent overwrites lose student work                             | Decide the one-way/two-way model before building either editor                 |
| Low-end Android performance                  | Unmeasured                                                      | Get two real target phones early; set budgets                                  |
| Bangla wording                               | Written by the development assistant, not reviewed by a teacher | Have a Bangla-medium science teacher review all strings                        |
| Sandbox in production containers             | bubblewrap usually cannot nest                                  | Container-as-boundary mode exists; test the image in Phase 1                   |

## 10. Owner review checklist

- [ ] Run the demonstration in section 5 on your own machine.
- [ ] Read the Bangla strings (`packages/i18n/src/messages.ts`) for tone and terminology.
- [ ] Confirm or change: Node 22 for now (D-001), plain-C compile for Phase 0 (D-011), unit symbols (D-013).
- [ ] Confirm the proposed data-retention periods in `docs/architecture/database.md`.
- [ ] Approve moving to Phase 1.
