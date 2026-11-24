# Arduino AVR core and libraries: source of the UNO firmware

These files are **not** part of the Apache-2.0 code of this project. They are
unmodified copies of the LGPL-2.1-or-later sources that the starter firmware in
`packages/board-emulators/fixtures/starters/`, and every program the lab builds
for the UNO-compatible board, are built from. They are here so that anyone who
receives the firmware also receives its corresponding source, as the LGPL
requires.

| Directory                | Upstream                                         | Release | Commit                                     |
| ------------------------ | ------------------------------------------------ | ------- | ------------------------------------------ |
| `ArduinoCore-avr-1.8.8/` | https://github.com/arduino/ArduinoCore-avr       | 1.8.8   | `86df345b3cf46754a5db38fb983ec2808ce31303` |
| `Servo-1.3.0/`           | https://github.com/arduino-libraries/Servo       | 1.3.0   | `2862ad9864d0dda5669b264857deafbba624940d` |
| `LiquidCrystal-1.0.7/`   | https://github.com/arduino-libraries/LiquidCrystal | 1.0.7 | `a89b4d46b28878557670440f2c35385c19307b69` |

Only the parts that are compiled into the firmware are copied: the core
(`cores/arduino`), the UNO pin definitions (`variants/standard`), the Wire (I²C)
and SPI libraries that come with the core (`libraries/*/src`, from the same
release) and each other library's `src`. SPI is offered under either GPL-2.0 or
LGPL-2.1; the project uses it under LGPL-2.1. Bootloaders, drivers and examples are not used and not copied.

The licence is LGPL-2.1-or-later, stated in the header of each source file and in
`Servo-1.3.0/LICENSE.txt` and `LiquidCrystal-1.0.7/README.adoc`. The full text is
in [`LICENSES/LGPL-2.1.txt`](../../LICENSES/LGPL-2.1.txt).

## Rebuilding the firmware

The sketches are the `.ino` files beside each `.hex`. To rebuild them all with
the same compiler flags the project uses:

```bash
pnpm --filter @banglalab/compile-worker core:fetch
pnpm fixtures:firmware
```

You need `avr-gcc`, `avr-libc` and `binutils-avr`. The flags are in
`apps/compile-worker/src/arduino-core.ts`.

## Changing the library and relinking

Edit the sources under `apps/compile-worker/vendor/` after `core:fetch`, then run
`pnpm fixtures:firmware` again. A program of your own is relinked the same way
with the compile worker running from that modified copy. The build links your sketch against the modified
library. In the running application you can also replace any starter program:
open the code tab, change the program and upload it.

## Keeping this copy honest

An integration test (`apps/compile-worker/src/third-party.itest.ts`) compares
every file here with the pinned upstream fetch, and another keeps each `.hex` in
step with its sketch. If either fails, the firmware and this source no longer
match and must not be released.
