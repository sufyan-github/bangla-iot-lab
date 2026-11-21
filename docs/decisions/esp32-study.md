# ESP32 feasibility study

**Status: in progress. Steps 1 and 2 of 6 are done. Step 3 is done except for one
measurement that needs a real phone. Steps 4 and 5 are measured on this laptop. Nothing is measured on a phone. The
owner has since asked for both option A and option C to be offered in the
editor, switchable, as experiments (22 November 2026).**

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

| Step | What                                                                                                                                                                  | State                                                                                                                                                              |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | Sort the reference sketches by what they need                                                                                                                         | **Done**                                                                                                                                                           |
| 2    | Baseline: compile every sketch with the real toolchain and record which succeed, so a later failure is known to be ours                                               | **Done**                                                                                                                                                           |
| 3    | Option C prototype: the board library for levels 1 and 2, a sketch compiled to WebAssembly, pins connected to the existing circuit solver. Measure coverage and speed | **Done on a laptop:** built, run as WebAssembly in a browser, and connected to the circuit solver through a stand-in board. Still to do: the speed on a real phone |
| 4    | Option A: find and assess existing browser emulators; run the level 1 to 3 sketches; measure coverage and speed                                                       | **Done natively:** esp32sim runs all 103 level 1 to 3 sketches. Its browser build and a phone are not measured                                                     |
| 5    | Option B: run one sketch in QEMU; measure server cost per student and the delay to the browser                                                                        | **Done on a laptop:** memory and processor cost measured. The delay over the internet is not                                                                       |
| 6    | Score the options against the criteria and write the decision                                                                                                         | Not started                                                                                                                                                        |

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

## Step 3 so far: option C on a desk computer and in a browser

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
every header those 67 sketches include, beyond the board's own, there are
twelve:

| Header                                    | Sketches that include it | Needed from level |
| ----------------------------------------- | ------------------------ | ----------------- |
| `DHT.h`                                   | 38                       | 3                 |
| `Wire.h`                                  | 26                       | 3                 |
| `Adafruit_GFX.h` and `Adafruit_SSD1306.h` | 24                       | 3                 |
| `Preferences.h`                           | 24                       | 4                 |
| `ESP32Servo.h`                            | 14                       | 3                 |
| `WiFi.h`                                  | 19                       | 5                 |
| `WebServer.h`                             | 10                       | 5                 |
| `ESPmDNS.h`                               | 9                        | 5                 |
| `HTTPClient.h`                            | 6                        | 5                 |
| `WiFiClientSecure.h`                      | 5                        | 5                 |
| `time.h`                                  | 3                        | 5                 |

The first six cover every sketch at levels 3 and 4, 48 sketches. The last six are
the network, level 5. That list is the remaining work for this option; how much
work each is has not been estimated yet.

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
matters is the one for WebAssembly on a low-cost phone; see below.

### What this option cannot do

Found while building it, and written into the prototype's README as limits a
student would be told:

- Code takes no time to run: each library call is charged a fixed two
  microseconds. A trigger pulse meant to last 10 µs lasts 12.
- Interrupts arrive only while time is passing, not in the middle of a
  calculation.
- It is not the real firmware, so a fault that lives in the real board software
  will not appear.

### As WebAssembly

The same library and sketches were then built as WebAssembly modules, the form
they would have in the browser, and run with the world outside the module in
JavaScript. The compiler is clang with the standard WebAssembly C library; no
part of it is under a licence the project rules out.

| Measure                                                                 | Result                                                        |
| ----------------------------------------------------------------------- | ------------------------------------------------------------- |
| Sketches at levels 1 and 2 that build                                   | 74 of 74                                                      |
| Runs compared with the desk-computer build (pin events and serial text) | 86, of which 84 identical                                     |
| Scripted behaviour checks                                               | 63 of 63 hold                                                 |
| Module size                                                             | median 29 kB, largest 39 kB (13 kB and 19 kB when compressed) |
| Memory a module starts with                                             | 128 kB                                                        |
| Time to build one sketch on this laptop                                 | about 0.4 to 0.8 s at the median                              |

The two runs that differ are both explained, and neither is a fault. One sketch
prints the time it was compiled, and the two builds were a second apart. The
other prints the size of `long`: 8 bytes on this 64-bit laptop, 4 bytes as
WebAssembly. The real board's compiler says 4. So for data sizes the
WebAssembly build is the faithful one: `int`, `long`, pointers, `size_t` and
`double` all have the board's sizes. Checking this against the board's compiler
found one difference to correct: plain `char` is unsigned on the board and
signed by default here, so both builds now set it to unsigned. A remaining
difference is `wchar_t` (2 bytes on the board, 4 here), which school sketches do
not use.

A sketch that crashes stops its own module and is reported; it cannot disturb
the page that loaded it.

### Speed in a browser

Measured in headless Chromium 158 on this laptop, with the project's seven own
test sketches, each run for one minute of board time. Every sketch gave the
correct result in the browser, in a worker and on the page's own thread.

| Processor                         | Slowest sketch, times faster than a real board | Kind of figure |
| --------------------------------- | ---------------------------------------------- | -------------- |
| This laptop, in a worker          | 56                                             | Measured       |
| This laptop, on the page's thread | 52                                             | Measured       |
| Slowed 4 times by the browser     | 13                                             | Estimate       |
| Slowed 6 times by the browser     | 8                                              | Estimate       |

The slowest sketch is the worst case for this design: a loop that reads a
button without ever waiting, which crosses from the module to the world 50
million times in a minute of board time. Sketches that wait between actions, as
most do, run thousands of times faster than real time.

Because every library call is charged a little board time, there is a ceiling
on how much work one second of board time can hold. That makes the worst case
bounded, which is why the slowed figures stay well above 1.

**The slowed rows are estimates, not measurements of a phone.** The same test
is a page that can be opened on a real phone (see the prototype's README). That
measurement has not been made. And these figures have an almost empty world
behind them; the circuit solver will add its own cost each time a pin changes.

### Connected to the circuit solver

Last, a sketch module was connected to the lab's own circuit solver in place of
the scripted inputs. The lab has no ESP32 board part yet, so the circuit was the
existing example built round the UNO-compatible board, used as a stand-in. This
shows how a sketch module and the solver work together and what that costs. **It
says nothing about how an ESP32 pin behaves electrically**; that needs the board
part and its pin model, which are separate work.

What the test shows, with a sketch that blinks an LED, reads a button and reads
a potentiometer:

- The LED carries the current the circuit gives it, within 2 % of the figure the
  UNO emulator's own test expects for the same circuit.
- The sketch reads the potentiometer's voltage and the button's level from the
  solved circuit, including its own loaded output pin.
- A pin change reaches the circuit at the moment the sketch makes it, and a
  read sees the circuit as it is at that moment. The UNO emulator exchanges with
  the circuit once a millisecond; this design has no such step.
- Each distinct state of the circuit is solved once and remembered. Ten minutes
  of board time, 2,402 pin changes and 2,399 reads, needed 5 solves and took
  about 20 ms on this laptop.

A circuit with capacitors has to be stepped through time whatever drives it, so
there the cost is the solver's, as it is today with the UNO.

### Still to do in step 3

One measurement: the speed test page on a real low-cost phone. It needs the
phone and a person; the page and the procedure are ready (see the prototype's
README).

Two things were learned that belong to building the option, if it is chosen,
rather than to choosing it:

- In the browser a sketch's `delay()` must also be able to wait in real time, so
  the student sees a lamp blink at the right pace. The world can do that from
  inside a worker.
- The solver knows one kind of board. An ESP32 needs its own board part, with a
  3.3 V supply and its own pin behaviour.

## Steps 4 and 5 so far: what already exists

Read on 22 November 2026. Each fact was read on the project's own page or
repository (VERIFIED) unless marked REPORTED. **Nothing in this section has been
run.** A project's own description of itself is not a measurement.

### Emulators that run in a browser

| Project                                                               | Licence                                             | The classic ESP32                           | What it says it does                                                                                                                                                                                                                                                                                                                     |
| --------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [esp32sim](https://github.com/mikroverk/esp32sim)                     | MIT                                                 | Listed as "early"; the ESP32-S3 is "mature" | Written in Rust, built as one WebAssembly module for a worker. Boots the chip's own start-up code, FreeRTOS and an unmodified program. Its table of peripherals is for the S3 only. Its classic ESP32 examples are MicroPython and one Arduino sketch on a display board. First published August 2026, version 0.4.0 on 15 November 2026 |
| [esp-emulator](https://github.com/espressif/esp-emulator) (Espressif) | Apache-2.0                                          | Not in its list of chips                    | Covers the ESP32-S3 and the newer RISC-V chips. Runs programs built with Espressif's own framework; Arduino is not mentioned. Has a browser build                                                                                                                                                                                        |
| Wokwi                                                                 | Not open: no public repository for its ESP32 engine | Supported                                   | Pins, serial, I2C, SPI, PWM, analog input, timers and Wi-Fi; runs Arduino projects. Its [terms](https://wokwi.com/legal/terms) allow personal, non-commercial use and forbid copying and distributing it. No published licence for putting it inside another product was found                                                           |
| [Velxio](https://github.com/davidmonterocrespo24/velxio)              | AGPL-3.0, or a paid licence                         | Supported, but on a server                  | Its ESP32 runs in QEMU on a server and talks to the browser. This is option B, not option A                                                                                                                                                                                                                                              |
| Cirkit Designer                                                       | No licence or repository stated                     | Stated as supported                         | A closed product                                                                                                                                                                                                                                                                                                                         |

For comparison, the emulator the lab already uses for the UNO-compatible board
(avr8js) is MIT, as is its sibling for the Pico.

What this means for option A. It is no longer a question of whether anyone
could write such an emulator: an MIT one exists and is being worked on. Two
things stand between it and the lab and both must be measured, not assumed. Its
support for the board the kit uses is the part its authors call "early". And an
emulator of the whole chip must run the whole of the board's software, so its
speed on a low-cost phone is the open question that option C does not have.

### Espressif's QEMU, for option B

- Licence: GPL-2.0. On a server, as a separate program, that is compatible with
  the project's rules; in the browser it would not be.
- Its [list of what it emulates](https://github.com/espressif/esp-toolchain-docs/blob/main/qemu/README.md)
  for the classic ESP32 includes the processor, serial, timers, flash and PWM.
  It lists I2C, general SPI, Wi-Fi and Bluetooth as **not supported**, and does
  not mention analog input.
- No way to set or watch a pin from outside is documented, and the pin model in
  its source only loops outputs back to inputs.
- A community version of QEMU (the one Velxio and PICSimLab use, also GPL) adds
  more, including Wi-Fi. Its coverage has not been read in detail.

What this means for option B. The school kit's display speaks I2C. Espressif's
QEMU as published would not reach it, so option B would rest on the community
version or on our own additions to a GPL program, as well as on a server and an
internet connection for every student.

## Step 4 result: option A, an emulator of the whole chip

Run on 22 November 2026 with esp32sim 0.4.0 (MIT), its checksum verified, inside
a sandbox with no network. Each sketch was built with the real toolchain, as in
the baseline, and booted as real firmware from the chip's own start-up code.
This is the emulator's native build on this laptop, not its browser build.

### Coverage

| Level | Sketches | Build | Boot and run 5 s without a crash |
| ----- | -------- | ----- | -------------------------------- |
| 1     | 30       | 30    | 30                               |
| 2     | 44       | 44    | 44                               |
| 3     | 29       | 29    | 29                               |

Running without a crash is a low bar at level 3: those sketches talk to a
display, a sensor or a servo, and none was connected. Whether the emulator's
I2C and timing would carry them was not tested.

### Behaviour

The scripted checks written for option C were given to the emulator where its
tools allow: scripted pin levels, voltages and serial input, and a record of
pin changes. Of 54 checks it could be held to, 41 hold. **None of the 13 that
fail is a fault found in the emulator**:

| Checks | Why they fail                                                                                                                            |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 7      | The check expects the ideal analog converter of the option C prototype. The emulator reads as Espressif's calibration says the chip does |
| 1      | The check allows no slack on a first `delay()`. The board counts delays in 1 ms ticks, so the first can be up to 1 ms short              |
| 4      | The input the check needs (a touch value, an echo pulse) could not be given with the emulator's script                                   |
| 1      | The scenario left a sensor line unconnected; the two worlds read an unconnected input differently. The scenario has been corrected       |

Nine more checks, on PWM duty over time, could not be observed with this tool
and were set aside.

So the emulator did what the real software does in every case examined, and it
showed four places where the option C prototype does not: the analog converter,
the 1 ms tick, the way numbers are written in other bases (`String(255, HEX)` is
`ff` on the board; since fixed in the prototype), and a lamp pin name the plain
board definition does not have. A library written by us will have faults of this
kind until each is found; an emulator of the chip does not have them at all.

Two models of the analog converter now disagree at the top of its range: the
emulator reads 3.3 V as 3920, and the pin model in this repository says the
reading sticks at 4095 above about 3.13 V. Neither has been checked on a board;
hardware test C2 settles it.

### Speed

| Kind of sketch                          | Speed on this laptop, native build                                     |
| --------------------------------------- | ---------------------------------------------------------------------- |
| Waits between actions (68 of 103)       | 5 to 10 times faster than a real board                                 |
| Has a loop that never waits (35 of 103) | 33 of them at about 0.2 times: five times **slower** than a real board |

The emulator runs about 30 to 60 million instructions a second here, and a real
ESP32 running flat out does far more. A third of the reference sketches are
written with a loop that never waits. The browser build cannot be faster than
the native one on the same machine, and a low-cost phone is several times slower
again. The emulator's own authors report "real time" in a browser on a fast
laptop for programs that mostly wait; that is their figure, not measured here.

The emulator used about 23 MB of memory.

### What option A would need

- A build with the whole ESP32 toolchain for every sketch, on a server: about
  4 s at the median in the baseline, with firmware of 260 kB or more.
- Models of the kit's parts (display, sensors) written against the emulator, as
  option C needs them written against its library.
- The speed above to be acceptable, or sketches to be written with waits.

Not measured: the emulator's browser build, and anything on a phone.

## Step 5 result: option B, QEMU on a server

Run on 22 November 2026 with Espressif's QEMU, release
`esp-develop-9.2.2-20261109`, on this laptop (Intel Core i5-1135G7, 8 threads),
inside a sandbox with no network. Two small sketches written for the test were
built with the real toolchain and booted as real firmware.

| Sketch                                              | Result                   | Processor used                             | Memory |
| --------------------------------------------------- | ------------------------ | ------------------------------------------ | ------ |
| Prints its clock once a second and waits in between | Boots and prints on time | About 20 % of one core                     | 172 MB |
| The same, with a loop that never waits              | Boots and prints on time | A little over one whole core, all the time | 172 MB |

What this shows:

- Real firmware built from an Arduino sketch boots in it and its serial text
  comes out. The board's clock keeps to real time.
- Each running board needs 172 MB of memory. A server with 8 GB could hold about
  40 at once on memory alone. That is an estimate from one measurement.
- A student whose sketch has a loop without a wait takes a whole processor core
  for as long as it runs.
- The code itself runs slower than on the board while the clock keeps real
  time: the loop went round 200,000 to 300,000 times a second here. The emulator of
  step 4, which counts the board's clock cycles, puts the board at about 1.9
  million. Neither figure has been checked on a real board.

What was not measured: the delay between a student's action and the browser,
which needs a server on the internet; and anything to do with pins, because this
QEMU has no documented way to set or watch one from outside (see the survey
above).

For the criteria, the facts are these. Option B needs a server and a connection
for every student, at the cost above; with Espressif's QEMU as published it
cannot show a pin, read a sensor or drive the kit's display without additions to
a GPL program.

## What the study will not do

It will not pick an option because it is the easiest to build, and it will not
report a sketch as running unless its pin and serial output were checked against
what the program should do.
