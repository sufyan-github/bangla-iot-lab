# Adafruit INA219 library

These files are **not** part of the Apache-2.0 code of this project. They are
unmodified copies of Adafruit's library for TI's INA219 current monitor, under the BSD 3-clause licence (`license.txt`).

| File | Upstream | Release | Commit |
| ---- | -------- | ------- | ------ |
| `Adafruit_INA219.h`, `Adafruit_INA219.cpp`, `license.txt` | https://github.com/adafruit/Adafruit_INA219 | 1.2.3 | `ce59837b4a8feccd767c67d26806a0bd89d1d8eb` |

The lab builds `Adafruit_INA219.cpp` into every ESP32 sketch compiled against its own
board library. The chip itself is simulated by the lab
(`packages/simulation/src/i2c-sensors.ts`), register by register.

A test (`apps/compile-worker/src/esp32-starters.test.ts`) fails if these files
change without the ready-made programs being rebuilt.
