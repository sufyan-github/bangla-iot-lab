# ESP32 feasibility study

**Status: in progress. Steps 1 and 2 of 6 are done and step 3 is partly done. No
decision has been made.**

## The question

The ESP32 30-pin board is the default board of the school kit and of most
planned projects. The lab has no ESP32. How should it run ESP32 programs, so that
a student's sketch behaves in the lab as it does on the real board, on a low-cost
phone, without internet?

## The three options

|     | Option                                       | How it works                                                                                                                                                | Known cost                                                                                                                                          |
| --- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | Emulate the chip in the browser              | Run the real compiled firmware on an emulated ESP32, as the lab already does for the UNO-compatible board                                                   | Depends on how complete and how fast an existing browser emulator is; to be measured                                                                |
| B   | Emulate the chip on a server                 | Run the firmware in Espressif's QEMU fork on a server and stream the pins                                                                                   | Needs a server for every running student and does not work offline. QEMU is GPL, so it must stay a separate server program                          |
| C   | Run the sketch against our own board library | Compile the student's sketch to WebAssembly against our own implementation of the board's functions (pins, timing, serial, I2C, the kit's libraries, Wi-Fi) | Not the real firmware: timing inside a function is approximate. Must be labelled "API-level, not cycle-accurate". We write and maintain the library |

Nothing here is decided by preference. Each option is run against the same
sketches and scored on the same criteria.

## Criteria

| Criterion        | What is measured                                                                                                    | Why it matters                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Coverage         | How many reference sketches compile and run with the expected pin and serial behaviour                              | The lab is only useful if the lessons run             |
| Fidelity         | For timing-sensitive devices (DHT11, ultrasonic echo, servo pulses, I2C), does the device model see correct signals | Wrong timing teaches wrong lessons                    |
| Speed on a phone | Simulated seconds per real second on a low-cost Android phone                                                       | A lab that runs at a tenth of real time is not usable |
| Offline          | Does it run with no network after the first visit                                                                   | Schools have weak internet                            |
| Download size    | Bytes added to the first visit                                                                                      | Mobile data is paid for                               |
| Licence          | Can it ship in an Apache-2.0 client                                                                                 | No copyleft in the client                             |
| Upkeep           | Work to keep it running as the board's software changes                                                             | One or two developers                                 |
| Honesty          | Can its limits be stated simply and shown to the student                                                            | The lab never implies accuracy it does not have       |

## The reference sketches

The school handbook's sketches are the yardstick: 141 programs, about 12,500
lines, all written for this board and this kit. (A 142nd folder holds eight
deliberately broken bug-hunt exercises and is not a sketch.) They are private until their
licence is settled, so only counts are given here. The tool that produces them is
`scripts/esp32-study/corpus.mjs`.

Each sketch is placed at the lowest level of board support that could run it:

| Level | Support needed                                    | Sketches | Running total |
| ----- | ------------------------------------------------- | -------- | ------------- |
| 1     | Pins, time and serial text                        | 30       | 30 (21 %)     |
| 2     | Analog input, PWM, pulse timing, interrupts       | 44       | 74 (52 %)     |
| 3     | The kit's devices: I2C display, DHT sensor, servo | 29       | 103 (73 %)    |
| 4     | Saved settings, sleep and restart                 | 19       | 122 (87 %)    |
| 5     | Wi-Fi and the internet                            | 19       | 141 (100 %)   |

What this already tells us:

- **Half the curriculum needs no device library at all**, and three quarters
  needs only three: the display, the DHT sensor and the servo.
- **Wi-Fi is needed by one sketch in seven**, all in the later chapters. An option
  that cannot do Wi-Fi honestly can still carry most of the course, as long as it
  says so.
- The whole set uses eleven library headers. That bounds the size of option C's
  library, and of the peripheral work for A and B.

## Method

| Step | What                                                                                                                                                                  | State                                                                                                                                 |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Sort the reference sketches by what they need                                                                                                                         | **Done**                                                                                                                              |
| 2    | Baseline: compile every sketch with the real toolchain and record which succeed, so a later failure is known to be ours                                               | **Done**                                                                                                                              |
| 3    | Option C prototype: the board library for levels 1 and 2, a sketch compiled to WebAssembly, pins connected to the existing circuit solver. Measure coverage and speed | **Partly done:** built and measured on a desk computer. Not yet compiled to WebAssembly, connected to the solver, or timed on a phone |
| 4    | Option A: find and assess existing browser emulators; run the level 1 to 3 sketches; measure coverage and speed                                                       | Not started                                                                                                                           |
| 5    | Option B: run one sketch in QEMU; measure server cost per student and the delay to the browser                                                                        | Not started                                                                                                                           |
| 6    | Score the options against the criteria and write the decision                                                                                                         | Not started                                                                                                                           |

Speed will be measured on a laptop first. The figure that counts is from a real
low-cost phone, which needs the lab team; until then any speed result is marked
as a laptop result.

## Step 2 result: the baseline

Run on 21 November 2026 with `scripts/esp32-study/baseline.mjs`: PlatformIO with
the `espressif32` platform 8.0.0 (Arduino core 3.3.12) and the six libraries at
the versions the handbook pins.

**All 141 sketches compile.** So from here on, a sketch that fails under one of
the options fails because of that option.

| Level | Sketches | Firmware size, median | Largest  | Memory for data, median |
| ----- | -------- | --------------------- | -------- | ----------------------- |
| 1     | 30       | 261 kB                | 262 kB   | 21 kB                   |
| 2     | 44       | 267 kB                | 280 kB   | 21 kB                   |
| 3     | 29       | 276 kB                | 318 kB   | 21 kB                   |
| 4     | 19       | 278 kB                | 325 kB   | 21 kB                   |
| 5     | 19       | 975 kB                | 1,089 kB | 48 kB                   |

Compiling one sketch takes 4 seconds at the median and under 20 seconds for nine
in ten, once the core has been built. (One build in the run stalled for about
96 minutes while every other took seconds; the same sketch took 7 seconds in a
separate run, so that figure is treated as the computer being suspended, not as
a compile time.)

What this adds:

- **Firmware is a quarter of a megabyte even for Blink**, and about a megabyte
  with Wi-Fi. An option that runs the real firmware (A or B) starts from that
  size and from the whole board software inside it. Option C runs only the
  student's code.
- **Wi-Fi quadruples the firmware and doubles the memory.** It is the dividing
  line in cost as well as in difficulty.
- **Compiling on a server is fast enough** for a lesson, at seconds per sketch
  with a warm cache.

### A finding about preparing sketches

In a first run, 9 sketches failed. The cause was not the sketches but the usual
automatic step that turns an Arduino sketch into C++ by inventing function
declarations: it mistook JavaScript inside the web pages some sketches embed for
C++ functions, and it placed a declaration before the type it used. Joining the
sketch's files in the Arduino order and generating nothing compiles all of them.

This matters for the lab's own compile service, which also generates
declarations. It must be tested against sketches like these before ESP32 sketches
are accepted, whichever option is chosen.

## Step 3 so far: option C on a desk computer

Run on 22 November 2026. The prototype is in
[`spikes/esp32-api`](../../spikes/esp32-api/README.md): a board library of about
870 lines of C++ written for this project, whose every action goes through
sixteen functions it expects from the world. Here the world is a test program
with a virtual clock and scripted inputs. In the browser it would be the lab's
circuit simulation.

### Coverage

| Level | Sketches | Compile and link | Run to the end of 5 s of board time |
| ----- | -------- | ---------------- | ----------------------------------- |
| 1     | 30       | 30               | 30                                  |
| 2     | 44       | 44               | 44                                  |
| 3     | 29       | 0                | —                                   |
| 4     | 19       | 0                | —                                   |
| 5     | 19       | 0                | —                                   |

Levels 3 to 5 stop at the first header the library does not have yet. Counting
that first missing header per sketch: `DHT.h` 18, `WiFi.h` 18, `Wire.h` 16,
`ESP32Servo.h` 9, `Preferences.h` 6. That list is the remaining work for this
option, in order.

### Behaviour

Running is not the same as being right. Twelve of the 74 sketches, chosen so
that every kind of feature at these levels is exercised, were given scripted
inputs and checked against what the program should do: 63 checks in all, such as
"the lamp is on 100 ms after the button is pressed", "a 5 ms contact bounce
does not count as a press", "the display reads 20.0 cm for an 1,166 µs echo" and
"asking for 40 kHz at 12 bits is refused".

**All 63 checks hold.** The other 62 sketches compile and run but their
behaviour was not checked one by one, and six of them wait for an input that the
unscripted run never gave.

One check found a fault in the first version of the library: it accepted any PWM
frequency, where the board refuses one its timer cannot reach, and a lesson
depends on that refusal. The library now applies the limit.

The public repository carries its own version of this test: seven sketches
written for the project with 37 checks, plus checks that the checker itself
reports a wrong result.

### Speed

Five seconds of board time take 2 ms at the median on this laptop, and 594 ms
for the slowest sketch, one that loops without waiting. That is a native build,
so **it is not the figure that matters.** It shows the approach itself is cheap:
the cost is the student's own code, with no chip to emulate. The figure that
matters, WebAssembly on a low-cost phone, is not measured yet.

### What this option cannot do

Found while building it, and written into the prototype's README as limits a
student would be told:

- Code takes no time to run: each library call is charged a fixed two
  microseconds. A trigger pulse meant to last 10 µs lasts 12.
- Interrupts arrive only while time is passing, not in the middle of a
  calculation.
- It is not the real firmware, so a fault that lives in the real board software
  will not appear.

### Still to do in step 3

Compile the same library to WebAssembly and time it in a browser and on a phone;
connect the sixteen world functions to the circuit solver, so a sketch drives a
real simulated circuit; decide how far up the levels to take the prototype before
the options are compared.

## What the study will not do

It will not pick an option because it is the easiest to build, and it will not
report a sketch as running unless its pin and serial output were checked against
what the program should do.
