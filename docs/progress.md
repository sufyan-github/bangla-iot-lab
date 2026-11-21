# Development progress

Updated 21 November 2026. This report lists only what is implemented and covered
by automated tests. "Not checked on hardware" applies to everything until the
bench records in [validation/](validation/README.md) exist.

## Where the project is

The project is in **Phase 0** of its current plan: putting the foundations in
place before the next large piece of work. Some later pieces were built earlier
and are already working.

| Phase                    | What it covers                                                                     | State                                                               |
| ------------------------ | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 0                        | Repository, licences, CI, catalogue importer, part format, ESP32 feasibility study | **In progress**                                                     |
| 1                        | Editor: canvas, wiring, both views, saving, undo, offline                          | Mostly built and tested; not yet measured at 200 parts on a phone   |
| ESP32 and the school kit | ESP32 board, the kit's sensors and display, the kit's lessons                      | Not started; next after Phase 0                                     |
| Digital logic            | Gates, flip-flops, real logic chips, logic analyser                                | Not started                                                         |
| 4                        | Analog solver and basic parts                                                      | Built and tested on 18 reference circuits; the target is 30 or more |
| 5                        | Instruments and visual explanations                                                | Partly built                                                        |
| 6                        | Programmable boards                                                                | UNO-compatible board built and tested; ESP32 not started            |
| Later                    | Systems of several boards, radio, energy; lessons and classes; enclosures          | Not started                                                         |

The order differs from the numbering on purpose: the ESP32 and the school kit
come before digital logic, because most of the planned projects and the school
curriculum depend on that board.

## Phase 0 tasks

| Task                                                                                                                           | State                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| Public repository, Apache-2.0 licence, notices                                                                                 | Done                                                                                                                                    |
| LGPL compliance for the starter firmware: source in the repository, notices in the application, a test that the source matches | Done and tested                                                                                                                         |
| Licence check that refuses copyleft in shipped dependencies                                                                    | Done and tested                                                                                                                         |
| Continuous integration running on every pull request                                                                           | In progress                                                                                                                             |
| Hardware testing checklist, equipment list and procedures                                                                      | Written; no test run yet                                                                                                                |
| Catalogue importer                                                                                                             | Done and tested on made-up data; run on the real export, whose figures all match the brief. See [catalogue.md](catalogue.md)            |
| Part definition format and parts list                                                                                          | Done and tested: 64 definitions; three parts read their shape from them. See [parts.md](parts.md)                                       |
| ESP32 feasibility study                                                                                                        | Started: steps 1 and 2 of 6 done; all 141 reference sketches compile with the real toolchain. See [the study](decisions/esp32-study.md) |

## Test results

| Suite                                                                      | Result on 21 November 2026                             |
| -------------------------------------------------------------------------- | ------------------------------------------------------ |
| Lint, formatting, types, licence check                                     | Clean                                                  |
| Unit tests                                                                 | 268 passed                                             |
| Integration tests (database, compiler sandbox, emulators, firmware source) | 32 passed                                              |
| Browser tests, desktop and phone sizes                                     | 66 tests. Last full run: 65 passed; see the note below |
| Hardware tests                                                             | None run                                               |

**Known issue with the browser tests.** A few tests wait a fixed number of
seconds for something the simulation does in real time (a servo sweep, a compile,
a blink). On a computer that is busy with other work the simulation slows down
and one of them can time out. Each passes when rerun on its own. They need limits
tied to simulated time, not wall-clock time.

## History

Earlier reports, from before the current plan and using its older phase names:
[first milestone](history-first-milestone.md),
[core simulator](history-core-simulator.md).
