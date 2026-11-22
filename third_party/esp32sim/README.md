# esp32sim, as the lab builds it

[esp32sim](https://github.com/mikroverk/esp32sim) is an emulator of Espressif's
chips, written in Rust by its own authors and released under the MIT licence.
It runs a board's real firmware: the chip's start-up code, the bootloader,
FreeRTOS, the Arduino core and the student's sketch.

The lab uses it, as an experiment, as a second way to run ESP32 programs. None
of its source is kept in this repository. `build.sh` fetches release 0.4.0,
checks that it is the commit this folder was written for, adds one file and
builds the emulator as a WebAssembly module.

## What the lab adds: `lab.rs`

The emulator's core can record pin edges, report a pin's programmed state and
its PWM, read a register, and take a pin level or a voltage from outside. Its
own browser build does not offer these to the page. A circuit simulator needs
exactly these, so `lab.rs` exports them. It adds no behaviour. It is the lab's
own work, under the MIT licence so that it can be offered back to the project.

## What gets built

```bash
third_party/esp32sim/build.sh .cache/esp32sim
```

| File | What it is | Licence |
| ---- | ---------- | ------- |
| `esp32sim.wasm` | The emulator, about 4.5 MB (1.3 MB compressed) | MIT |
| `esp32_rev300_rom.elf` | The ESP32's own start-up code, from Espressif | Apache-2.0 |

Needs Rust. The build needs no network once the source is fetched: the emulator
has no outside dependencies.

## What was measured

On 22 November 2026, on one laptop, with firmware built from Arduino sketches by
the real toolchain:

- It boots and runs every one of the 103 reference sketches tried (levels 1 to 3).
- As a board in the lab's simulation it lit an LED through the solved circuit,
  read a button through the chip's pull-up, and read a potentiometer at half of
  3.3 V as 1872, the value the lab's own pin model gives.
- A sketch that waits between actions ran 2 to 9 times faster than a real
  board. **A sketch whose loop never waits ran at about 0.18 times real time**,
  in WebAssembly as in its native build.

Nothing has been measured on a phone or compared with a real board.

## In the lab

A student chooses this engine in the ESP32 board's Code tab. The compile server
then builds the sketch into real firmware (see `third_party/arduino-esp32`), and
the browser fetches the emulator the first time it is needed. `pnpm build` in
`apps/web` includes the emulator when `.cache/esp32sim` holds it, and leaves the
choice out of the editor when it does not.

## Limits

- Core only: firmware is not yet built with the Arduino core's libraries (Wi-Fi,
  I2C and the rest), and no display or sensor is connected to the emulated chip.
- A sketch whose loop never waits runs in slow motion; the editor says so.
- Nothing has been measured on a phone or compared with a real board.
