# Adafruit GFX graphics library

These files are **not** part of the Apache-2.0 code of this project. They are
unmodified copies from Adafruit's graphics library, under the BSD 2-clause
licence (`license.txt`).

| File | Upstream | Release | Commit |
| ---- | -------- | ------- | ------ |
| `Adafruit_GFX.h`, `Adafruit_GFX.cpp`, `gfxfont.h`, `glcdfont.c`, `license.txt` | https://github.com/adafruit/Adafruit-GFX-Library | 1.13.0 | `85ce269b270eb1241e36a22cceec2c5e0905f48c` |

The lab builds `Adafruit_GFX.cpp` (with the built-in 5 × 7 letters of
`glcdfont.c`) into every ESP32 sketch compiled against its own board library.
Only sketches that use a display keep any of it. A sketch that draws with this
library runs the same drawing code in the lab as on a real board.

**Not copied:**

- the `Fonts/` folder. Several of those fonts are made from the GNU FreeFont
  files, which are under the GPL, and this project ships no GPL material. A
  sketch that includes one of them does not compile in the lab;
- `Adafruit_SPITFT` and `Adafruit_GrayOLED`, for displays the lab does not have.

A test (`apps/compile-worker/src/esp32-starters.test.ts`) fails if these files
change without the ready-made programs being rebuilt.
