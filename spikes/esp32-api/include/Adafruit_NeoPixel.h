// WS2812B LEDs ("NeoPixels"), for the lab's board library.
//
// The lab's own implementation of the programming interface of Adafruit's
// NeoPixel library, written from that library's public documentation. It
// contains no code of that library, which is under the LGPL. A sketch written
// for it compiles and runs here unchanged.
//
// Differences a program may notice:
// - colours are kept as set and scaled by the brightness only when sent, so
//   getPixelColor() gives back exactly what was set (the original keeps the
//   scaled values and gives back an approximation);
// - ColorHSV(), gamma8() and sine8() are worked out here from their documented
//   meaning, and may differ from the original's tables by a step or so.
#pragma once
#include <Arduino.h>

typedef uint16_t neoPixelType;

// Where each colour goes in the bytes sent for a pixel: red, green and blue
// (and white) each take a position 0 to 3. The names say the order on the wire.
#define NEO_ORDER_(r, g, b, w) ((r) | (g) << 2 | (b) << 4 | (w) << 6)
#define NEO_HAS_WHITE_ 0x0200
#define NEO_RGB NEO_ORDER_(0, 1, 2, 0)
#define NEO_RBG NEO_ORDER_(0, 2, 1, 0)
#define NEO_GRB NEO_ORDER_(1, 0, 2, 0)
#define NEO_GBR NEO_ORDER_(2, 0, 1, 0)
#define NEO_BRG NEO_ORDER_(1, 2, 0, 0)
#define NEO_BGR NEO_ORDER_(2, 1, 0, 0)
#define NEO_RGBW (NEO_ORDER_(0, 1, 2, 3) | NEO_HAS_WHITE_)
#define NEO_GRBW (NEO_ORDER_(1, 0, 2, 3) | NEO_HAS_WHITE_)
#define NEO_RBGW (NEO_ORDER_(0, 2, 1, 3) | NEO_HAS_WHITE_)
#define NEO_BRGW (NEO_ORDER_(1, 2, 0, 3) | NEO_HAS_WHITE_)
#define NEO_BGRW (NEO_ORDER_(2, 1, 0, 3) | NEO_HAS_WHITE_)
#define NEO_GBRW (NEO_ORDER_(2, 0, 1, 3) | NEO_HAS_WHITE_)
#define NEO_WRGB (NEO_ORDER_(1, 2, 3, 0) | NEO_HAS_WHITE_)
#define NEO_WGRB (NEO_ORDER_(2, 1, 3, 0) | NEO_HAS_WHITE_)
#define NEO_RGWB (NEO_ORDER_(0, 1, 3, 2) | NEO_HAS_WHITE_)
#define NEO_GRWB (NEO_ORDER_(1, 0, 3, 2) | NEO_HAS_WHITE_)
// 800 kHz for WS2812B; 400 kHz for the older WS2811.
#define NEO_KHZ800 0x0000
#define NEO_KHZ400 0x0100

class Adafruit_NeoPixel {
 public:
  Adafruit_NeoPixel(uint16_t n, int16_t pin = 6, neoPixelType type = NEO_GRB + NEO_KHZ800);
  Adafruit_NeoPixel();
  ~Adafruit_NeoPixel();

  void begin();
  /** Sends every pixel's colour down the data line. */
  void show();
  void setPin(int16_t pin);
  void setPixelColor(uint16_t n, uint8_t r, uint8_t g, uint8_t b);
  void setPixelColor(uint16_t n, uint8_t r, uint8_t g, uint8_t b, uint8_t w);
  void setPixelColor(uint16_t n, uint32_t c);
  void fill(uint32_t c = 0, uint16_t first = 0, uint16_t count = 0);
  /** 0 (off) to 255 (as set), applied when the colours are sent. */
  void setBrightness(uint8_t brightness);
  void clear();
  void updateLength(uint16_t n);
  void updateType(neoPixelType type);
  /** True once the line has rested long enough since the last show() for the LEDs to take new colours. */
  bool canShow();
  /** The colour bytes, in the order they are sent. */
  uint8_t* getPixels() const { return pixels_; }
  uint8_t getBrightness() const { return brightness_; }
  int16_t getPin() const { return pin_; }
  uint16_t numPixels() const { return count_; }
  uint32_t getPixelColor(uint16_t n) const;
  void rainbow(uint16_t first_hue = 0, int8_t reps = 1, uint8_t saturation = 255,
               uint8_t brightness = 255, bool gammify = true);

  /** One full circle of a sine wave: 0 to 255 in, 0 to 255 out, 128 at 0. */
  static uint8_t sine8(uint8_t x);
  /** Brightness as the eye sees it: x scaled by a gamma of 2.6. */
  static uint8_t gamma8(uint8_t x);
  static uint32_t gamma32(uint32_t x);
  static uint32_t Color(uint8_t r, uint8_t g, uint8_t b) {
    return (uint32_t)r << 16 | (uint32_t)g << 8 | b;
  }
  static uint32_t Color(uint8_t r, uint8_t g, uint8_t b, uint8_t w) {
    return (uint32_t)w << 24 | (uint32_t)r << 16 | (uint32_t)g << 8 | b;
  }
  /** A colour from its hue (0 to 65535 round the circle, red at 0), saturation and value. */
  static uint32_t ColorHSV(uint16_t hue, uint8_t sat = 255, uint8_t val = 255);
  /** The type for an order written as text, such as "GRB" or "RGBW". */
  static neoPixelType str2order(const char* v);

 private:
  uint8_t bytesPerPixel() const { return (type_ & NEO_HAS_WHITE_) ? 4 : 3; }

  uint16_t count_ = 0;
  int16_t pin_ = -1;
  neoPixelType type_ = NEO_GRB + NEO_KHZ800;
  uint8_t brightness_ = 255;
  uint8_t* pixels_ = nullptr;
  bool begun_ = false;
  /** When the last colours finished going out, in microseconds. */
  uint64_t sentAt_ = 0;
  bool sent_ = false;
};
