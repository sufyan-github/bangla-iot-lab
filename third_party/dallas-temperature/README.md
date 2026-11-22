# DallasTemperature

These files are **not** part of the Apache-2.0 code of this project. They are
unmodified copies of the DallasTemperature library for Dallas/Maxim 1-Wire
thermometers (the DS18B20 among them), under the MIT licence (`LICENSE`,
Copyright 2024 Miles Burton).

| File | Upstream | Release | Commit |
| ---- | -------- | ------- | ------ |
| `DallasTemperature.h`, `DallasTemperature.cpp`, `LICENSE` | https://github.com/milesburton/Arduino-Temperature-Control-Library | 4.0.6 | `3f570bbe2d0ad3cae55663cfaec1fedbc5b4fa50` |

Releases up to 3.9.1 were under the LGPL 2.1 or later (checked in
`DallasTemperature.cpp` at tag 3.9.1). Release 4.0.6 is MIT, as its `LICENSE`
file at that tag says, and none of its files at that tag carries another
licence. Only 4.0.6 is used here.

The lab builds `DallasTemperature.cpp` into every ESP32 sketch compiled against
its own board library. It talks to the bus through `OneWire.h`, which in the
lab is the board library's own implementation of the OneWire library's
functions (no code of the OneWire library is used). The DS18B20 itself is
simulated by the lab (`packages/simulation/src/onewire-sensors.ts`), command by
command, as Maxim's datasheet gives them.

A test (`apps/compile-worker/src/esp32-starters.test.ts`) fails if these files
change without the ready-made programs being rebuilt.
