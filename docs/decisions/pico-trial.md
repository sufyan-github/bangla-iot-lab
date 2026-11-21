# Pico trial: can the emulated Pico run MicroPython well enough to build on?

Date: 21 November 2026. Phase 1, task 10 ("Integrate and validate Pico
emulation"). This was a time-boxed trial, not an integration.

## Verdict: go, with two conditions

rp2040js 1.4.2 runs the **current official MicroPython firmware (v1.29.0)**
correctly for everything a school program on a plain Pico uses. Proceed to put
the Pico in the lab, provided that:

1. **Speed is measured on a real low-end Android phone first.** Programs that
   mostly wait are cheap; programs that compute continuously are not (below).
2. **The scope is the plain Pico.** The Pico W's radio is not emulated, so the
   IoT lab must use a behavioural Wi-Fi model, as the brief already assumes.

## What was tested

Automated in `packages/board-emulators/src/pico.itest.ts` (7 tests, all passing),
against firmware fetched and checksum-verified by `pnpm pico:fetch`.

| Question                                  | Result                                                                                                            |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Does the official firmware boot?          | Yes: v1.29.0 and v1.26.1 both reach the `>>>` prompt in 14 ms of simulated time                                   |
| Can a program be run and its output read? | Yes, through the raw REPL over emulated USB serial, the mechanism Thonny uses                                     |
| Is timing right?                          | `time.sleep_ms(200)` toggles a pin every 200.0 ms; PWM at 1 kHz, 25 % measures 1.0000 ms and 0.2500 ms on the pin |
| Do inputs work?                           | `ADC.read_u16()` returns half scale for 1.65 V; a pin with `PULL_UP` reads the level it is given                  |
| Are errors usable?                        | A traceback comes back with the line number and exception                                                         |
| Can a runaway program be stopped?         | Yes: Ctrl-C raises `KeyboardInterrupt`, and the board runs the next program normally                              |

## The one real problem found, and its fix

As shipped, rp2040js's USB serial port answers every read request from the
firmware immediately, with zero bytes when nothing has been typed. A real
computer makes the board wait. The firmware therefore re-asked in a tight loop
and **the processor never slept**: a blink program that sleeps 99 % of the time
cost as much to emulate as one computing flat out, about 0.2 to 0.3 times real
time on the development laptop.

`PicoBoard` holds a read request until there is something to deliver. With that,
the processor is awake for 5 ms of a 5-second blink program, and the program
emulates 20 to 40 times faster than real time.

This fix lives in our wrapper, not in rp2040js. It should be offered upstream;
until then it relies on one private field of rp2040js's `USBCDC` class, so the
rp2040js version is pinned exactly.

## Speed

Measured with `pnpm --filter @banglalab/board-emulators pico:benchmark` on the
development laptop, which was under varying load; treat these as rough.

| Program                               | Processor awake | Emulation speed            |
| ------------------------------------- | --------------- | -------------------------- |
| Blink, `sleep_ms(500)`                | 5 ms of 5 s     | 20 to 40 times real time   |
| Read a sensor, print, `sleep_ms(100)` | 11 ms of 5 s    | about 20 times real time   |
| Arithmetic loop, never sleeps         | all of it       | 0.1 to 0.3 times real time |

The last row is the risk. MicroPython is an interpreter, and here it runs on an
emulated processor written in JavaScript. A loop that takes half a second on a
real Pico takes two to five seconds on this laptop, and would take several
times longer on a low-end phone. Typical lessons (blink, read, wait) are in the
first two rows; a lesson that computes for long stretches would crawl.

For comparison, the emulated UNO runs its compiled programs at about real time
or better on the same machine.

## Size

| Item                    | Size                   |
| ----------------------- | ---------------------- |
| MicroPython flash image | 340 kB, 244 kB gzipped |
| rp2040js                | about 63 kB gzipped    |
| Boot ROM                | 16 kB                  |

About 320 kB more to download for a circuit that uses a Pico. It should load only
when one is used, as the code editor does, and be cached for offline use.

## What the trial did not cover

- Connecting the Pico to the circuit simulation, the editor or the lab UI.
- Saving programs to the board's file system (`main.py`). Programs are sent
  through the REPL each time, which is enough for "upload and run".
- I²C, SPI, PIO and the second processor core.
- Any phone or browser measurement; everything ran in Node.js on a laptop.

## What integrating it would involve

1. Generalise the session's board handling, which today assumes an UNO: pin
   counts, 3.3 V logic, and a board that boots firmware and is then sent a
   program, rather than one flashed with a compiled program.
2. A Pico part for the canvas, and a MicroPython mode for the code editor.
   No compile server is needed: MicroPython programs run offline.
3. A 3.3 V pin model, and a warning when 5 V reaches a Pico pin.
4. Pacing: sleeping programs must be held back to real time, and the UI must
   say so when a busy program is running slower than real time.
5. Ship the firmware and boot ROM as lazily loaded, cached assets, with their
   licences (MIT and BSD-3-Clause) acknowledged.
