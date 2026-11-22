# Adafruit SSD1306 library

These files are **not** part of the Apache-2.0 code of this project. They are
unmodified copies of Adafruit's library for SSD1306 OLED displays, under the BSD
3-clause licence (`license.txt`).

| File | Upstream | Release | Commit |
| ---- | -------- | ------- | ------ |
| `Adafruit_SSD1306.h`, `Adafruit_SSD1306.cpp`, `splash.h`, `license.txt` | https://github.com/adafruit/Adafruit_SSD1306 | 2.5.17 | `d94f699451d72286357cba7259055ffff2c2940b` |

The lab builds `Adafruit_SSD1306.cpp` into every ESP32 sketch compiled against
its own board library; only sketches that use the display keep it. What the
library sends over I2C is received by the lab's model of the display's
controller (`packages/simulation/src/ssd1306.ts`).

`splash.h` is the picture the library puts on a display when it starts: the
Adafruit logo. It is part of the library and under the same licence, and a
sketch that shows it in the lab shows what the same sketch shows on a real
display. The logo is Adafruit's; its use here does not mean that Adafruit
endorses this project.

The library can also drive the display over SPI. The lab has no SPI: that part
compiles and does nothing.

A test (`apps/compile-worker/src/esp32-starters.test.ts`) fails if these files
change without the ready-made programs being rebuilt.
