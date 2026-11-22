# Adafruit BusIO (two header files)

These files are **not** part of the Apache-2.0 code of this project. They are
unmodified copies of two header files of Adafruit's BusIO library, under the MIT
licence (`LICENSE`).

| File | Upstream | Release | Commit |
| ---- | -------- | ------- | ------ |
| `Adafruit_I2CDevice.h`, `Adafruit_SPIDevice.h`, `LICENSE` | https://github.com/adafruit/Adafruit_BusIO | 1.17.4 | `3b8364267c3ee6e16bad91bc2101aefbd5b5915f` |

They are here because `Adafruit_GFX.h` names them, so a sketch that uses the
graphics library cannot be compiled without them. None of BusIO's code is built:
a sketch that uses `Adafruit_I2CDevice` or `Adafruit_SPIDevice` itself does not
link in the lab.
