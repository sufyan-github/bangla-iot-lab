# Adafruit unified sensor library

These files are **not** part of the Apache-2.0 code of this project. They are
unmodified copies of Adafruit's unified sensor interface, under the Apache License 2.0 (`LICENSE.txt`). Its header is
Copyright 2008 The Android Open Source Project, updated by Adafruit Industries.

| File | Upstream | Release | Commit |
| ---- | -------- | ------- | ------ |
| `Adafruit_Sensor.h`, `Adafruit_Sensor.cpp`, `LICENSE.txt` | https://github.com/adafruit/Adafruit_Sensor | 1.1.15 | `0a9127a1e886ff1adb4c1b6f5958b24108d55aa6` |

The BME280 library uses its common types for sensor readings, so it is built
into ESP32 sketches with it.

A test (`apps/compile-worker/src/esp32-starters.test.ts`) fails if these files
change without the ready-made programs being rebuilt.
