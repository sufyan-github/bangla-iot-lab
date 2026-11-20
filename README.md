# বাংলা IoT ল্যাব — Bangla IoT Virtual Lab

A Bangla-first, offline-capable virtual electronics laboratory for students in
Class 6–12 in Bangladesh. Students build circuits on a virtual breadboard,
run them, and see voltages, currents and plain-language explanations.

**Status: Phase 0 (foundation and proof of concept) is complete.**
See [docs/phase-0-report.md](docs/phase-0-report.md) for what works, the test
results and the known limitations. Later phases are not started.

## What works today

- Breadboard editor: battery, resistor, LED and wires; tap to place, drag to move.
- DC circuit simulation, checked against ngspice on ten reference circuits.
- Live readings (voltage, current, power) and explanations of common mistakes, in Bangla and English.
- Automatic saving on the device; the app installs as a PWA and reopens projects with no network.
- An emulated Arduino UNO that runs firmware, and a sandboxed server-side compiler for C source.

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
pnpm db:up          # PostgreSQL 18 in Docker on 127.0.0.1:55440
pnpm db:migrate     # create the tables
pnpm dev            # web :5173, API :4000, compile worker :4100
```

Open http://localhost:5173. The breadboard lab needs only the web app
(`pnpm dev:web`); the API and compile worker are needed only for
"কম্পাইল করে চালাও" (compile and run) on the Arduino test page.

## Checks

```bash
pnpm check              # lint + format + types + unit tests (no services needed)
pnpm test:integration   # needs `pnpm db:up`, avr-gcc and bubblewrap
pnpm test:e2e           # builds the app and drives it in Chromium (desktop + phone)
```

The first e2e run needs a browser: `pnpm --filter @banglalab/web exec playwright install chromium`.

## Layout

```
apps/web              React + Vite PWA: the lab, project list, Arduino test page
apps/api              Fastify API: health, compile proxy, PostgreSQL schema and migrations
apps/compile-worker   Sandboxed avr-gcc service with a content-addressed cache
packages/shared       Circuit document schema, breadboard model, editing rules
packages/circuit-engine   MNA + Newton-Raphson DC solver (no UI or board knowledge)
packages/simulation   Document → netlist → readings and diagnostics
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
- [প্রথম সার্কিট (student guide)](docs/user-guides/first-circuit.bn.md)
