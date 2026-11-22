# Adafruit DHT sensor library

These files are **not** part of the Apache-2.0 code of this project. They are
unmodified copies of Adafruit's library for the DHT11 and DHT22 sensors, under
the MIT licence (`license.txt`).

| File | Upstream | Release | Commit |
| ---- | -------- | ------- | ------ |
| `DHT.h`, `DHT.cpp`, `license.txt` | https://github.com/adafruit/DHT-sensor-library | 1.4.7 | `f7d625462e6033f373e51f8c67f88fc429535b47` |

The lab builds `DHT.cpp` into every ESP32 sketch compiled against its own board
library, so a sketch that says `#include <DHT.h>` runs the same library code in
the lab as on a real board. The sensor itself is simulated by the lab
(`packages/simulation/src/peripherals.ts`): it answers the library's request
with the pulses a DHT11 sends.

The unified-sensor half of the library (`DHT_U.h`) is not copied; the kit's
lessons do not use it.

A test (`apps/compile-worker/src/esp32-starters.test.ts`) fails if these files
change without the ready-made programs being rebuilt.
