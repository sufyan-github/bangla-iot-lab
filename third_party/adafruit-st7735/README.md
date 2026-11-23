# Adafruit ST7735 and ST7789 library

These files are **not** part of the Apache-2.0 code of this project. They are
unmodified copies from Adafruit's library for displays driven by ST77xx chips,
under the MIT licence.

| File | Upstream | Release | Commit |
| ---- | -------- | ------- | ------ |
| `Adafruit_ST77xx.h`, `Adafruit_ST77xx.cpp`, `Adafruit_ST7789.h`, `Adafruit_ST7789.cpp` | https://github.com/adafruit/Adafruit-ST7735-Library | 1.12.0 | `d568339f957380ceb05dda57f6712c2704a6394f` |

The library has no separate licence file. Its licence is stated in the comment
at the top of each source file ("MIT license, all text above must be included
in any redistribution"), which the copies keep. `NOTICE.txt` is that comment,
taken from `Adafruit_ST77xx.cpp` unchanged, so it can be shown with the lab's
other licences.

The lab builds `Adafruit_ST77xx.cpp` and `Adafruit_ST7789.cpp` into every ESP32
sketch compiled against its own board library, with `Adafruit_SPITFT.cpp` from
the GFX library (`third_party/adafruit-gfx`). The display itself is simulated by
the lab (`packages/simulation/src/st7789.ts`), command by command, from the
ST7789's datasheet.

**Not copied:** the ST7735 and ST7796S drivers and the examples, for displays
and boards the lab does not have.

A test (`apps/compile-worker/src/esp32-starters.test.ts`) fails if these files
change without the ready-made programs being rebuilt.
