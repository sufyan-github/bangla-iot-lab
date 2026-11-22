# Adafruit BME280 library

These files are **not** part of the Apache-2.0 code of this project. They are
unmodified copies of Adafruit's library for Bosch's BME280 sensor, under the BSD 3-clause licence (`LICENSE`).

| File | Upstream | Release | Commit |
| ---- | -------- | ------- | ------ |
| `Adafruit_BME280.h`, `Adafruit_BME280.cpp`, `LICENSE` | https://github.com/adafruit/Adafruit_BME280_Library | 2.3.0 | `ef712e95147de926b4545e379f6296ad271529b5` |

The lab builds `Adafruit_BME280.cpp` into every ESP32 sketch compiled against its own
board library, so a sketch that says `#include <Adafruit_BME280.h>` runs the same
library code as on a real board. The sensor itself is simulated by the lab
(`packages/simulation/src/i2c-sensors.ts`), register by register.

A test (`apps/compile-worker/src/esp32-starters.test.ts`) fails if these files
change without the ready-made programs being rebuilt.
