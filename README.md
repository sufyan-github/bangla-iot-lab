# বাংলা IoT ল্যাব (Bangla IoT Lab)

A virtual electronics and IoT lab that runs in the browser, in Bangla and
English, for school students in Bangladesh. Build a circuit on a breadboard,
write a program for the board, switch it on and see what happens, with no
hardware and no internet after the first visit.

**Status: early development.** The parts below work and are covered by automated
tests. Nothing has yet been checked against real hardware; see
[Hardware validation](#hardware-validation).

## What works today

- **Breadboard editor.** Place parts, pull wires from hole to hole, bend them
  round parts, drag anything, undo and redo. Touch and mouse.
- **Circuit simulation.** Our own solver (Modified Nodal Analysis with
  Newton-Raphson, written in TypeScript), checked against ngspice on 18 reference
  circuits. Explains common mistakes in plain words: an LED the wrong way round,
  no resistor, a short circuit.
- **20 parts.** Resistor, LED, button, switch, potentiometer, capacitor, diode,
  transistor, buzzer, motor, relay, servo, character LCD, light, temperature,
  soil, IR and ultrasonic sensors, battery, and an UNO-compatible board.
- **A programmable board.** Write a sketch for the UNO-compatible board, compile
  it in a sandbox and watch it drive the circuit. The board is emulated at the
  instruction level with [avr8js](https://github.com/wokwi/avr8js).
- **Instruments.** Two-probe voltmeter, oscilloscope and logic traces, serial
  monitor, and a meter for every part.
- **Diagram view.** The same circuit drawn as a schematic, with moving dashes
  showing where current flows.
- **Offline.** Installs as a web app and saves on the device. Seven ready-made
  programs run without a server.

## What does not exist yet

An ESP32 board, digital logic chips, lessons, project templates, class accounts,
and uploading to a real board. The plan and the honest state of each piece are in
[docs/progress.md](docs/progress.md).

## Hardware validation

Every part model is, for now, **not yet checked on real hardware**. A part is
called validated only when a bench measurement is stored in
[docs/validation/](docs/validation/README.md) beside the simulated result.

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
pnpm --filter @banglalab/compile-worker core:fetch   # AVR core and libraries, pinned (once)
pnpm --filter @banglalab/board-emulators pico:fetch  # MicroPython firmware, pinned (once)
pnpm db:up          # PostgreSQL 18 in Docker on 127.0.0.1:55440
pnpm db:migrate     # create the tables
pnpm dev            # web :5173, API :4000, compile worker :4100
```

Open http://localhost:5173. The lab and the ready-made programs need only the web
app (`pnpm dev:web`). The API and compile worker are needed only to compile a
program a student has written.

## Checks

```bash
pnpm check              # lint, format, types, licence check, unit tests (no services needed)
pnpm test:integration   # needs `pnpm db:up`, avr-gcc and bubblewrap
pnpm test:e2e           # builds the app and drives it in Chromium (desktop and phone sizes)
```

The first browser-test run needs a browser:
`pnpm --filter @banglalab/web exec playwright install chromium`.

## Layout

```
apps/web                  the lab (React, Vite, offline-capable)
apps/compile-worker       compiles sketches in a per-job sandbox
apps/api                  thin API in front of the compile worker
packages/circuit-engine   the circuit solver, with its ngspice reference results
packages/simulation       parts as circuit models; board and circuit run together
packages/board-emulators  wrappers round avr8js and rp2040js
packages/shared           the saved-circuit format and editing rules
packages/i18n             Bangla and English text
third_party/              source of other people's code that we distribute
docs/                     architecture, decisions, progress, validation
```

## Documentation

- [Progress report](docs/progress.md) and [changelog](CHANGELOG.md)
- [Architecture](docs/architecture/overview.md) and [how the simulation works](docs/architecture/simulation.md)
- [Decision log](docs/decisions/decision-log.md): why things are the way they are
- [Testing](docs/testing/testing.md)
- [Hardware testing checklist](docs/validation/README.md)
- [Contributing](CONTRIBUTING.md)

## Licence

The original code is under the [Apache License 2.0](LICENSE). The repository also
carries a small amount of other people's work under its own licences, kept
separate and described in [NOTICE](NOTICE):

- the ready-made firmware contains LGPL-2.1-or-later code from the Arduino AVR
  core and libraries; its full source is in
  [third_party/arduino-avr](third_party/arduino-avr/README.md);
- the Anek Bangla font is under the SIL Open Font License;
- JavaScript dependencies are listed in
  [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).

Lesson content, store catalogue data and handbook material are **not** in this
repository.

Arduino and UNO are trademarks of Arduino S.r.l. This project is independent and
is not affiliated with or endorsed by Arduino or by any parts supplier.
