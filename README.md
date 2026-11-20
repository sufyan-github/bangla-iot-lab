# বাংলা IoT ল্যাব — Bangla IoT Virtual Lab

A Bangla-first, offline-capable virtual electronics laboratory for students in
Class 6–12 in Bangladesh. Students build circuits on a virtual breadboard,
run them, and see voltages, currents and plain-language explanations.

**Status: Phase 0 is complete; Phase 1 (core simulator) is in progress.**
See [docs/phase-1-progress.md](docs/phase-1-progress.md) for what works now,
what is still missing from Phase 1, the test results and the known limitations.

## What works today

- Breadboard editor: battery, resistor, LED, push button, potentiometer, capacitor and wires.
- An Arduino UNO beside the board: write a sketch, upload it, and it drives the circuit.
- Circuit simulation checked against ngspice (12 steady and 3 time-dependent reference circuits).
- Live readings, an oscilloscope, a logic analyser and a serial monitor.
- Plain-language explanations of common mistakes, in Bangla and English.
- Automatic saving on the device; the app installs as a PWA and reopens projects, with their programs, offline.

## Requirements

| Tool                            | Version        | Needed for                   |
| ------------------------------- | -------------- | ---------------------------- |
| Node.js                         | 22.18 or newer | everything                   |
| pnpm                            | 12             | everything                   |
| Docker                          | any recent     | local PostgreSQL 18          |
| avr-gcc, avr-libc, binutils-avr | gcc 14 tested  | compile worker and its tests |
| bubblewrap (`bwrap`)            | any recent     | per-job compiler sandbox     |

On Ubuntu: `sudo apt install gcc-avr avr-libc binutils-avr bubblewrap`.

## Quick start

```bash
pnpm install
pnpm --filter @banglalab/compile-worker core:fetch   # Arduino core, pinned release (once)
pnpm db:up          # PostgreSQL 18 in Docker on 127.0.0.1:55440
pnpm db:migrate     # create the tables
pnpm dev            # web :5173, API :4000, compile worker :4100
```

Open http://localhost:5173. The lab and the ready-made programs need only the
web app (`pnpm dev:web`); the API and compile worker are needed only to compile
code a student has written ("বোর্ডে আপলোড করো").

## Checks

```bash
pnpm check              # lint + format + types + unit tests (no services needed)
pnpm test:integration   # needs `pnpm db:up`, avr-gcc and bubblewrap
pnpm test:e2e           # builds the app and drives it in Chromium (desktop + phone)
```

The first e2e run needs a browser: `pnpm --filter @banglalab/web exec playwright install chromium`.

## Layout

```
apps/web              React + Vite PWA: the lab, code editor, instruments, project list
apps/api              Fastify API: health, compile proxy, PostgreSQL schema and migrations
apps/compile-worker   Sandboxed avr-gcc service with a content-addressed cache
packages/shared       Circuit document schema, breadboard model, editing rules
packages/circuit-engine   MNA + Newton-Raphson solver, DC and time steps (no UI or board knowledge)
packages/simulation   Document → netlist → readings; session that runs boards and circuit together
packages/board-emulators  Arduino UNO wrapper around avr8js
packages/i18n         Bangla and English text, number and unit formatting
infra/docker          Local development services
docs                  Requirements, architecture, decisions, testing, reports
```

Packages planned in the master brief but not created yet because they would be
empty: `ui`, `lesson-engine`, `content-schema`, `config` (see
[docs/decisions/decision-log.md](docs/decisions/decision-log.md), D-004).

## Troubleshooting

- **`COMPILE_SANDBOX=bwrap but bubblewrap could not start avr-gcc`** — install
  `bubblewrap` and the AVR toolchain. For a quick local try only, start the
  worker with `COMPILE_SANDBOX=none` (never in production).
- **`ArduinoCore-avr is missing`** — run `pnpm --filter @banglalab/compile-worker core:fetch`.
- **Integration tests say PostgreSQL is not reachable** — run `pnpm db:up`.
- **Port already in use** — the web dev server uses 5173, preview 4173, e2e 4174,
  API 4000, worker 4100, Postgres 55440.
- **Changes do not show up in the installed app** — it is served by a service
  worker; reload twice or clear site data.
- **"এই ব্রাউজারে সেভ করা যাচ্ছে না"** — private browsing blocks IndexedDB.

## Documentation

- [Technical requirements](docs/requirements/technical-requirements.md)
- [Architecture and data flow](docs/architecture/overview.md)
- [Simulation design](docs/architecture/simulation.md)
- [Database design](docs/architecture/database.md)
- [API reference](docs/architecture/api.md)
- [Decision log](docs/decisions/decision-log.md)
- [Testing guide](docs/testing/testing.md)
- [Phase 0 report](docs/phase-0-report.md)
- [Phase 1 progress report](docs/phase-1-progress.md)
- [প্রথম সার্কিট (student guide)](docs/user-guides/first-circuit.bn.md)
