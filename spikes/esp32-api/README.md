# ESP32 board library: study prototype

**This is a prototype for the [ESP32 feasibility study](../../docs/decisions/esp32-study.md),
not part of the lab.** It exists to measure one of the study's three options. No
decision has been made, and nothing here is used by the application.

## What it is

Option C of the study: instead of emulating the ESP32 chip, compile the student's
sketch against our own implementation of the board's functions.

- `include/Arduino.h`, `src/arduino.cpp`: the board library. It offers what a
  sketch for the ESP32 calls (`pinMode`, `digitalWrite`, `analogRead`,
  `ledcWrite`, `pulseIn`, `Serial`, `String`, …), written from the public
  behaviour of those functions. It contains no code from the ESP32 Arduino core.
- `include/host.h`: the sixteen functions the library needs from the world
  (set a pin, read a voltage, let time pass, send serial text). Everything the
  library does goes through them.
- `harness/world.cpp`: a world for a desk computer, with a **virtual clock** and
  inputs that arrive from a script. `delay(1000)` takes no real time; it moves
  the clock on a second. A run is exact and repeatable.
- `tests/`: seven small sketches written for this project, each with a scenario
  (scripted inputs and what the sketch must then do). `api.itest.mjs` runs them.

## What it covers

Levels 1 and 2 of the study: pins, time, serial text, analog input, PWM, pulse
timing, interrupts and touch. Not yet: the I2C display, the DHT sensor, the
servo, saved settings, sleep, Wi-Fi.

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
- **The analog converter is ideal and linear.** The real one is not. A proper
  model is being prepared separately.
- **Chip facts are fixed values** (`ESP.getFreeHeap()` and the like).
- **`ESP.restart()` ends the run.**

## Running it

```bash
pnpm test:integration        # includes api.itest.mjs; needs g++
```

By hand, for one of the test sketches:

```bash
node -e "
import('./scripts/esp32-study/lib.mjs').then(({ buildLibrary, buildSketch, runSketch }) => {
  buildLibrary('/tmp/esp32-api');
  const { program } = buildSketch('/tmp/esp32-api', 'spikes/esp32-api/tests/blink');
  console.log(runSketch(program, { runMs: 2000 }).events);
});"
```
