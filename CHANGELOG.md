# Changelog

All notable changes are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions before 1.0
make no promise of compatibility, except that saved circuits are always migrated.

## [Unreleased]

### Added

- `packages/catalog`: imports a supplier's export into dated snapshots, keeping
  the original data, validating it and reporting issues; computes project and
  budget totals; word-prefix search; comparison of two snapshots. No catalogue
  data is published.
- `packages/parts`: one JSON definition per real part, with a validated format
  and honesty rules enforced by tests; 64 definitions covering every built part
  and the parts the shortlisted projects still need; a "missing in the
  simulator" report for a parts list.
- Resistor, LED and HC-SR04 now take their breadboard shape from their
  definitions.
- ESP32 feasibility study, in progress: the plan, the reference sketches sorted
  by what they need, a compile baseline, and a prototype board library
  (`spikes/esp32-api`) with its own tests, built natively and as WebAssembly,
  and a speed test page for a browser or a phone. A study prototype, not part of
  the lab; no decision has been made.
- ESP32 development board (30 pins), groundwork only: an electrical model of its
  pins with every number sourced and labelled (`packages/simulation`,
  `docs/engineering/esp32-pin-model.md`), and a drawing of the board with its
  pin positions for two row spacings (`apps/web/src/lab/esp32`). Not yet in the
  editor or the simulation; nothing checked on real hardware.

### Fixed

- A sketch that keeps a web page in a raw string (`R"HTML( … )HTML"`) no longer
  fails to compile. The JavaScript functions in the page were being mistaken for
  functions of the sketch.

## [0.1.0] - 2026-11-21

First public version. Everything listed is implemented and covered by automated
tests. Nothing has been validated on real hardware.

### Added

- Breadboard editor: placing parts, drag-to-wire and tap-to-wire, bendable wires,
  movable battery and board, undo and redo, placement preview.
- Circuit solver (Modified Nodal Analysis, Newton-Raphson, transient steps for
  capacitors), checked against ngspice 45.2 on 15 DC and 3 transient circuits.
- 20 parts with drawn, shaded visuals and plain-language diagnostics.
- UNO-compatible board emulated with avr8js, running real compiled firmware
  together with the circuit; servo, ultrasonic sensor and character LCD models.
- Sandboxed compile service for sketches, on plain avr-gcc.
- Code editor, serial monitor, oscilloscope and logic traces, two-probe
  voltmeter, hover voltage.
- Diagram view: the breadboard circuit drawn as a schematic, with current flow.
- Bangla and English throughout; offline use; saving on the device with format
  migration (circuit format version 6).
- Apache-2.0 licence, NOTICE, third-party licence list, an in-app licences page,
  and the corresponding source of the LGPL starter firmware.
- A licence check that refuses copyleft in shipped dependencies.

### Known limits

- No ESP32, digital logic, lessons, accounts or upload to a real board.
- One 830-hole breadboard and at most 200 parts per circuit.
- Hover and drag-to-wire need a mouse or pen.
- Not measured on a real phone.
