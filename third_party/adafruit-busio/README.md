# Adafruit BusIO

These files are **not** part of the Apache-2.0 code of this project. They are
unmodified copies of Adafruit's BusIO library, under the MIT licence
(`LICENSE`).

| File | Upstream | Release | Commit |
| ---- | -------- | ------- | ------ |
| `Adafruit_I2CDevice.h`, `Adafruit_I2CDevice.cpp`, `Adafruit_SPIDevice.h`, `Adafruit_SPIDevice.cpp`, `Adafruit_BusIO_Register.h`, `Adafruit_BusIO_Register.cpp`, `Adafruit_GenericDevice.h`, `Adafruit_GenericDevice.cpp`, `Adafruit_I2CRegister.h`, `LICENSE` | https://github.com/adafruit/Adafruit_BusIO | 1.17.4 | `3b8364267c3ee6e16bad91bc2101aefbd5b5915f` |

BusIO is the I2C and SPI device layer that Adafruit's sensor libraries (BME280,
INA219) and its graphics library use. The lab builds these sources into every
ESP32 sketch compiled against its own board library; the linker keeps only what
a sketch uses.

Its SPI half compiles against the board library's `SPI.h`, where SPI is not
modelled: transfers, and pins driven by hand through their registers, go
nowhere.

A test (`apps/compile-worker/src/esp32-starters.test.ts`) fails if these files
change without the ready-made programs being rebuilt.
