# Espressif's Arduino core for the ESP32: source of the ESP32 firmware

These files are **not** part of the Apache-2.0 code of this project. They are
unmodified copies of the LGPL-2.1-or-later sources that real ESP32 firmware is
built from when the lab's compile worker builds a sketch for the chip-emulator
engine (experimental). They are here so that anyone who receives such firmware
can also get its corresponding source, as the LGPL requires.

| Directory or file | Upstream | Release | Commit |
| ----------------- | -------- | ------- | ------ |
| `cores/esp32/` | https://github.com/espressif/arduino-esp32 | 3.3.12 | `94afccf35fb1e401facddbcf9e13bcf7c76a31d8` |
| `variants/esp32/` | the same | 3.3.12 | the same |
| `tools/partitions/default.csv` | the same | 3.3.12 | the same |
| `platform.txt` | the same | 3.3.12 | the same |
| `LICENSE.md` | the same | 3.3.12 | the same |

Only what is compiled into the firmware is copied: the core (`cores/esp32`) and
the pin definitions of the plain ESP32 board (`variants/esp32`). The core's
libraries (Wi-Fi, I2C and the rest) are not built into firmware by the lab yet
and are not copied. `platform.txt` is the core's own build recipe, which the
lab's build follows.

One file is not from the upstream repository: `cores/esp32/core_version.h`. The
core's release process generates it; this copy is the one PlatformIO's package
of the same release carries.

The licence is LGPL-2.1-or-later, stated in `LICENSE.md` here and in the header
of the source files. The full text is also in
[`LICENSES/LGPL-2.1.txt`](../../LICENSES/LGPL-2.1.txt).

## What else is in a firmware image

Besides this core and the student's sketch, a firmware image is linked with
Espressif's precompiled ESP-IDF libraries (release 5.5.5, as packaged for
Arduino core 3.3.12). They are not kept in this repository; the script below
fetches them. ESP-IDF is Apache-2.0 and carries parts under other permissive
licences (FreeRTOS, lwIP, mbedTLS, newlib and others); Espressif lists them in
its own copyright notice: https://docs.espressif.com/projects/esp-idf/en/v5.5.5/esp32/COPYRIGHT.html

## Rebuilding the firmware

```bash
apps/compile-worker/scripts/fetch-esp32-toolchain.sh   # compiler and libraries, about 1.6 GB
pnpm --filter @banglalab/compile-worker start
```

Then send a sketch to the worker with `"board": "esp32", "engine": "emulator"`.
The exact compiler and linker commands are in
`apps/compile-worker/src/esp32-firmware.ts`; they are the core's own recipes
from `platform.txt`.

## Changing the core and relinking

Edit the sources under this folder and build again. The worker compiles the core
from here, notices the change, and links your sketch against the modified core.

## Keeping this copy honest

An integration test (`apps/compile-worker/src/esp32-firmware.itest.ts`) compares
every file here with the same release as packaged for the toolchain. If it
fails, the firmware and this source no longer match and must not be released.
