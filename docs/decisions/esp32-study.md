# ESP32 feasibility study

**Status: in progress. Step 1 of 6 is done. No decision has been made.**

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

The school handbook's sketches are the yardstick: 142 programs, about 12,500
lines, all written for this board and this kit. They are private until their
licence is settled, so only counts are given here. The tool that produces them is
`scripts/esp32-study/corpus.mjs`.

Each sketch is placed at the lowest level of board support that could run it:

| Level | Support needed                                    | Sketches | Running total |
| ----- | ------------------------------------------------- | -------- | ------------- |
| 1     | Pins, time and serial text                        | 30       | 30 (21 %)     |
| 2     | Analog input, PWM, pulse timing, interrupts       | 45       | 75 (53 %)     |
| 3     | The kit's devices: I2C display, DHT sensor, servo | 29       | 104 (73 %)    |
| 4     | Saved settings, sleep and restart                 | 19       | 123 (87 %)    |
| 5     | Wi-Fi and the internet                            | 19       | 142 (100 %)   |

What this already tells us:

- **Half the curriculum needs no device library at all**, and three quarters
  needs only three: the display, the DHT sensor and the servo.
- **Wi-Fi is needed by one sketch in seven**, all in the later chapters. An option
  that cannot do Wi-Fi honestly can still carry most of the course, as long as it
  says so.
- The whole set uses eleven library headers. That bounds the size of option C's
  library, and of the peripheral work for A and B.

## Method

| Step | What                                                                                                                                                                  | State       |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| 1    | Sort the reference sketches by what they need                                                                                                                         | **Done**    |
| 2    | Baseline: compile every sketch with the real toolchain and record which succeed, so a later failure is known to be ours                                               | Not started |
| 3    | Option C prototype: the board library for levels 1 and 2, a sketch compiled to WebAssembly, pins connected to the existing circuit solver. Measure coverage and speed | Not started |
| 4    | Option A: find and assess existing browser emulators; run the level 1 to 3 sketches; measure coverage and speed                                                       | Not started |
| 5    | Option B: run one sketch in QEMU; measure server cost per student and the delay to the browser                                                                        | Not started |
| 6    | Score the options against the criteria and write the decision                                                                                                         | Not started |

Speed will be measured on a laptop first. The figure that counts is from a real
low-cost phone, which needs the lab team; until then any speed result is marked
as a laptop result.

## What the study will not do

It will not pick an option because it is the easiest to build, and it will not
report a sketch as running unless its pin and serial output were checked against
what the program should do.
