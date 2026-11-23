# LoRa (Sandeep Mistry)

These files are **not** part of the Apache-2.0 code of this project. They are
unmodified copies of the Arduino LoRa library for Semtech SX1276/77/78/79
radios (the Ra-02's SX1278 among them), under the MIT licence (`LICENSE`,
Copyright 2016 Sandeep Mistry).

| File | Upstream | Release | Commit |
| ---- | -------- | ------- | ------ |
| `src/LoRa.h`, `src/LoRa.cpp`, `LICENSE` (kept here without the `src/` folder) | https://github.com/sandeepmistry/arduino-LoRa | 0.8.0 | `5e0e6f0794eae6829315233db5d1257f5cae373b` |

The lab builds `LoRa.cpp` into every ESP32 sketch compiled against its own
board library. The radio itself is simulated by the lab
(`packages/simulation/src/lora.ts`), register by register, from Semtech's
datasheet.

A test (`apps/compile-worker/src/esp32-starters.test.ts`) fails if these files
change without the ready-made programs being rebuilt.
