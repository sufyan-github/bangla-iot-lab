# ESP32 board library: study prototype

**This began as a prototype for the [ESP32 feasibility study](../../docs/decisions/esp32-study.md).
Since 22 November 2026 the lab uses the board library here, as an experiment, to
run ESP32 programs in the editor.** The study itself has not reached its decision.

## What it is

Option C of the study: instead of emulating the ESP32 chip, compile the student's
sketch against our own implementation of the board's functions.

- `include/Arduino.h`, `src/arduino.cpp`: the board library. It offers what a
  sketch for the ESP32 calls (`pinMode`, `digitalWrite`, `analogRead`,
  `ledcWrite`, `pulseIn`, `Serial`, `String`, …), written from the public
  behaviour of those functions. It contains no code from the ESP32 Arduino core.
- `include/host.h`: the eighteen functions the library needs from the world
  (set a pin, read a voltage, let time pass, send serial text). Everything the
  library does goes through them.
- `harness/world.cpp`: a world for a desk computer, with a **virtual clock** and
  inputs that arrive from a script. `delay(1000)` takes no real time; it moves
  the clock on a second. A run is exact and repeatable.
- `wasm/entry.cpp`: the start of a sketch built as a WebAssembly module. The
  world is not in the module; every host function is an import.
- `wasm/world.mjs`: the same world as `harness/world.cpp`, in JavaScript, for a
  module. It needs nothing from Node, so it runs in a browser or a worker.
- `wasm/bench/`: a page that runs the test sketches in a browser and reports how
  fast, for measuring a real phone.
- `circuit.itest.ts`: a sketch module connected to the lab's circuit solver in
  place of scripted inputs, with the UNO-compatible example circuit as a
  stand-in board. It measures how the two work together, not how an ESP32 pin
  behaves.
- `tests/`: seven small sketches written for this project, each with a scenario
  (scripted inputs and what the sketch must then do). `api.itest.mjs` runs them
  natively and as WebAssembly, and requires both to give exactly the same pin
  events and serial text.

## What it covers

Pins, time, serial text, analog input, PWM, pulse timing, interrupts and touch;
the servo (`ESP32Servo.h`, the lab's own version of that interface); and, built
in from `third_party`, Adafruit's DHT library. Not yet: the I2C display, saved
settings, sleep, Wi-Fi.

## What it does not get right

These are limits of the approach or of the prototype, and would be shown to the
student:

- **It is not the real firmware.** The student's own code runs exactly; what the
  board does in response is a model.
- **Code takes no time to run.** Each library call is charged a fixed two
  microseconds. A sketch that measures how fast its own loop runs will get a
  different answer from a real board.
- **Interrupts arrive only while time is passing**, that is inside a library
  call or a delay, not in the middle of a calculation.
- **In the study's two test worlds the analog converter is ideal and linear.** In
  the lab's simulation it follows the chip's calibration curve instead.
- **Chip facts are fixed values** (`ESP.getFreeHeap()` and the like).
- **`ESP.restart()` ends the run.**

## Running it

The tests need `g++` and, for the WebAssembly half, clang with the wasm32-wasi
target, `wasm-ld`, wasi-libc and libc++ for wasm32. On Ubuntu:

```bash
sudo apt-get install clang lld wasi-libc libc++-dev-wasm32 libclang-rt-dev-wasm32 binaryen
```

If those packages are unpacked somewhere else instead of installed, name that
folder in `WASI_ROOT` (the study's tools) and `ESP32_TOOLCHAIN_ROOT` (the compile
worker). The tests fail, and say what is missing, when the
toolchain is not there; they are never skipped.

```bash
pnpm test:integration
```

## Measuring a phone

The speed that matters is on a real low-cost phone. To measure one, on a
computer on the same network as the phone:

```bash
node scripts/esp32-study/bench.mjs --work /tmp/esp32-bench --serve 8080 --lan
```

The command prints an address. Open it in the phone's browser, wait for "Done",
and copy the text in the box at the bottom: it holds the device, the browser and
every figure. `--lan` makes the page visible to that network while the command
runs; stop it with Ctrl+C afterwards. Without `--lan` the page is served to this
computer only.
