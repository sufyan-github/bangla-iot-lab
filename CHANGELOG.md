# Changelog

All notable changes are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions before 1.0
make no promise of compatibility, except that saved circuits are always migrated.

## [Unreleased]

### Added

- **First parts of the school kit on the ESP32** (with the lab's own model of
  the board):
  - **DHT11** temperature and humidity sensor: a new part with two sliders, its
    one-wire protocol simulated bit by bit, read by Adafruit's real DHT library
    (MIT), which is built unmodified into every sketch. Circuit format version 8.
  - **Servo**, through the lab's own version of the ESP32Servo interface. The
    kit's servo needs 5 V, so it moves when powered from VIN and not from 3V3.
  - **Ultrasonic sensor**: its 5 V echo now reaches a 3.3 V pin through a
    voltage divider, and the pin's level is taken from the solved circuit, so a
    divider that takes the signal down too far gives no reading.
  - Ready-made programs for all three.
- **A warning when a pin is given more voltage than it can stand**, for example
  a 5 V signal wired straight into an ESP32 pin. It says which pin, how much,
  the limit, and to use a divider.
- A board can be stopped at the instant a sensor's reply is due, so sensors that
  answer within microseconds are timed exactly.
- **ESP32 development board in the editor (experimental).** The 30-pin board can
  be added, moved, wired and probed, and is drawn in the diagram view; its pins
  work at 3.3 V with pull-ups, pull-downs and input-only pins, from the pin model.
  Programs run on the lab's own board library, built into a WebAssembly module:
  four ready-made programs (blink, button, fade, knob) work offline, and a
  student's own sketch is compiled by the sandboxed compile worker. The editor
  says that this is a model of the board, what works and what does not, and
  links to a page (`/esp32`) with what has been measured and what has not.
  Nothing has been checked against a real board.
- Groundwork for a second way to run ESP32 programs: `Esp32SimBoard` runs the
  board's real firmware in esp32sim, an emulator of the whole chip, behind the
  same interface as the other boards. `third_party/esp32sim` builds the emulator
  from its pinned source with one file of the lab's added.
- The compile worker builds real ESP32 firmware from a sketch, in its sandbox,
  with Espressif's toolchain and the Arduino core kept in
  `third_party/arduino-esp32` (LGPL-2.1, unmodified, with how to rebuild and
  relink). Tests build firmware, boot it in the emulator and run it against the
  example circuit.
- **A second way to run ESP32 programs, chosen in the Code tab (experimental):**
  the board's real firmware in an emulator of the chip. The emulator (4.5 MB) is
  fetched only when a student chooses it, then kept for offline use. Uploading
  with it needs the server. The editor says when the circuit is running slower
  than real time, which it does for any sketch whose loop never waits. A build
  of the lab made without the emulator simply does not offer the choice.
- The simulation tells a board when the circuit is not deciding a pin's level,
  so a pull-up the program enables reads HIGH in the same instant.
- Circuit format version 7 (adds the ESP32 board). A circuit has one board, of
  either kind.
- The simulation runs any board through one interface, from a table of each
  board's electrical behaviour.
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
