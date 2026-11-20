# Phase 1 progress report — core simulator

Date: 20 November 2026. Branch: `phase-1-core-simulator`.
Status: **in progress. Phase 1 is not complete** — see section 3 for what remains.

## 1. What now works

A student can put an Arduino UNO beside the breadboard, wire it to parts, write
or pick a program, upload it, and watch the program drive the circuit:

- **Arduino sketches compile.** `setup()`/`loop()`, `digitalWrite`, `analogWrite`,
  `analogRead`, `delay`, `millis`, `Serial` — built in the sandbox against the
  pinned ArduinoCore-avr 1.8.8. Functions may be used before they are defined;
  errors point at the student's own line.
- **The processor and the circuit run together.** Output pins drive the circuit
  through a 25 Ω pin model; inputs read the circuit's voltages (with pull-ups
  and logic thresholds); `analogRead` sees the real node voltage. PWM is
  averaged the way the eye and a meter see it.
- **New parts:** UNO board, push button (press and hold while running),
  potentiometer (knob slider), capacitor.
- **Time-dependent behaviour:** capacitors charge and discharge in real time.
- **Instruments:** oscilloscope (two voltage channels, four time spans, lowest /
  highest / average) and logic analyser (every wired board pin).
- **Code editor** (CodeMirror 6, C++ highlighting), four starter programs with
  Bangla comments, serial monitor.
- **Offline:** starter programs ship with firmware, and uploaded firmware is
  saved with the project, so a board circuit runs again with no network.

## 2. Phase 1 task list

| #   | Task                                           | Status                                                                                        |
| --- | ---------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 1   | Circuit data structures and netlist generation | Done for the parts listed above                                                               |
| 2   | Component models                               | **Partial — 7 of 20** (battery, resistor, LED, button, potentiometer, capacitor, UNO)         |
| 3   | Connection and validation rules                | Done for those parts                                                                          |
| 4   | MNA DC solver                                  | Done (Phase 0), extended with source-with-resistance                                          |
| 5   | Compare against ngspice                        | Done: 12 DC and 3 transient reference circuits                                                |
| 6   | Transient analysis                             | Done: backward Euler, capacitors only. Trapezoidal not started                                |
| 7   | MCU scheduler                                  | Done: 1 ms processor slices, event-ordered circuit updates                                    |
| 8   | MCU pins connected to the circuit              | Done: digital out, digital in, pull-up, analog in, PWM                                        |
| 9   | UNO emulation                                  | Done. Not emulated: SPI, I²C, EEPROM, external interrupts from the circuit                    |
| 10  | Pico emulation                                 | **Not started**                                                                               |
| 11  | Blockly                                        | **Not started**                                                                               |
| 12  | CodeMirror                                     | Done                                                                                          |
| 13  | Code generation (blocks → code)                | **Not started**                                                                               |
| 14  | Virtual upload                                 | Done                                                                                          |
| 15  | Compilation caching                            | Done; Arduino core prebuilt at worker start                                                   |
| 16  | Multimeter, oscilloscope, logic analyser       | Oscilloscope and logic analyser done. Meter reads per part; free-probe multimeter not started |
| 17  | Simulation error handling                      | Done for current parts: 13 diagnostics                                                        |
| 18  | Golden test cases                              | Done for current scope                                                                        |

## 3. What remains before the Phase 1 gate

1. Thirteen parts: switch, diode, NPN transistor, buzzer, DC motor, servo, LDR,
   ultrasonic sensor, temperature sensor, LCD, relay, soil-moisture sensor, IR sensor.
   The transistor needs a new solver device; servo, LCD and ultrasonic need
   protocol-level models and Arduino libraries in the sandbox.
2. Blockly, block-to-code generation, and the rule for how blocks and hand-edited
   text coexist without overwriting a student's work.
3. Pico: a time-boxed trial of rp2040js with MicroPython firmware, then a go/no-go.
4. Pause and single-step controls; free-probe multimeter.
5. Real-board upload (also listed under Phase 3).

## 4. Phase 1 acceptance, as far as it can be judged today

> Students can create circuits, execute virtual board programs, and observe
> consistent electrical and digital behaviour.

Met **for the parts that exist**, and proven by browser tests on desktop and
phone profiles: build a board circuit by tapping, run a program, see the LED
blink with the current the pin model predicts, hold a button and see the
program react, turn a knob and see `analogRead` change, see the same signal on
the oscilloscope and logic analyser. Not met for the phase as a whole, because
of section 3.

## 5. Test results (20 November 2026)

| Suite                                                          | Result                          |
| -------------------------------------------------------------- | ------------------------------- |
| ESLint, Prettier, TypeScript                                   | clean                           |
| Unit                                                           | 153 passed, 0 failed, 0 skipped |
| Integration (PostgreSQL 18, avr-gcc, bubblewrap, Arduino core) | 20 passed                       |
| End to end (Chromium; desktop and phone profiles)              | 22 passed                       |

Electrical agreement with ngspice 45.2: DC within 1 µV / 1 nA on 12 circuits;
transient within 12 mV on three circuits (the limit is set by the first-order
time-stepping method, and is stated per circuit in `transient-cases.ts`).

Timing checked on the emulated UNO: `delay(500)` within 5 ms per second;
`analogWrite` duty within 5 % on all three timers; PWM on pin 9 at 490 Hz.

## 6. Known issues and limitations

Simulation

- A program that reads a pin it also drives sees the result up to 1 ms late.
- Circuits with capacitors use a fixed 0.1 ms step; a time constant below about
  1 ms is followed only roughly. Capacitor polarity and leakage are not modelled.
- An unconnected input reads LOW; a real floating pin reads noise.
- "Why is this LED dark?" explanations are switched off while a program runs or
  a capacitor is present, because a dark LED is then usually intentional.
- The pin model is typical datasheet values (25 Ω output, 35 kΩ pull-up).

Editor

- No undo/redo. The UNO and batteries cannot be repositioned. One UNO per circuit.
- The UNO sits below the breadboard, so on most screens you scroll to see it.
- The logic analyser's rows are inside the oscilloscope picture and are not
  yet readable by screen readers; the oscilloscope has no cursors or trigger.
- Compiler messages are shown in English.

Platform

- Unchanged from Phase 0: no accounts, API is localhost-only, the compile-worker
  container image and CI workflow are written but have never been built or run.
- The web bundle grew: about 170 kB gzip for the app plus 168 kB gzip for the
  code editor, which loads only when the Code tab is opened.

## 7. Performance observations (development laptop, not target devices)

- A blink circuit solves the circuit 3 to 4 times in total, however long it
  runs, because each distinct pin state is solved once and remembered.
- Capacitor circuits solve 10 000 steps per simulated second.
- Not yet measured on a low-end Android phone. This is now the biggest
  unknown, because the processor emulation runs continuously.

## 8. Security observations

- Arduino builds run in the same per-job sandbox as before; the core is mounted
  read-only. Tests confirm a sketch cannot read host files.
- ArduinoCore-avr is fetched by script at a pinned release and commit, verified
  after download, and is not committed to this repository (LGPL-2.1).
- Firmware loaded into the emulator is parsed and bounds-checked; invalid
  firmware is rejected without stopping the session.

## 9. Decisions needed from the owner

- [ ] Order of the remaining work: more parts first, or Blockly first?
- [ ] Is a Pico trial still wanted in Phase 1, or should it move later?
- [ ] Bangla wording review, now including the starter-program comments
      (`packages/board-emulators/fixtures/starters/*.ino`).
