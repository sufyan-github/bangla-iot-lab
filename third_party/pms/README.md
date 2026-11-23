# PMS (Plantower particle sensors)

These files are **not** part of the Apache-2.0 code of this project. They are
unmodified copies of the PMS library for Plantower particle sensors (the
PMS5003 among them), under the MIT licence (`LICENSE`, Copyright 2017 Mariusz
Kacki).

| File | Upstream | Release | Commit |
| ---- | -------- | ------- | ------ |
| `PMS.h`, `PMS.cpp`, `LICENSE` | https://github.com/fu-hsi/PMS | 1.1.0 | `f73bb6bee70cedd1998597c1e8db0dfb8799019d` |

The lab builds `PMS.cpp` into every ESP32 sketch compiled against its own board
library. The sensor itself is simulated by the lab
(`packages/simulation/src/uart-devices.ts`), frame by frame, in the format this
library reads.

A test (`apps/compile-worker/src/esp32-starters.test.ts`) fails if these files
change without the ready-made programs being rebuilt.
