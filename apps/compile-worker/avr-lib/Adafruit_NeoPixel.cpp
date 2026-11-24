// WS2812B LEDs on the UNO-compatible board: see Adafruit_NeoPixel.h. The lab's own code.
#include <Adafruit_NeoPixel.h>
#include <avr/pgmspace.h>

// The line must rest LOW this long before the LEDs take the next colours. The
// WS2812B's datasheet asks for more than 280 microseconds.
static const uint32_t LATCH_MICROS = 300;

// One bit: the pin goes HIGH, stays HIGH a short time for a 0 or a long time
// for a 1, then goes LOW until the next bit. The eight bits of a byte go out
// from a few lines of assembly, so every time is a fixed number of clock
// cycles (62.5 ns each at 16 MHz), counted between the two writes to the port:
//   800 kHz: 0 is 6 cycles (0.38 us) HIGH, 1 is 13 (0.81 us); a bit every 20 or 21;
//   400 kHz: 0 is 8 cycles (0.5 us) HIGH, 1 is 19 (1.19 us); a bit every 40 or 41.
// A write to the port takes 2 cycles, a skip over one 2, "rjmp .+0" waits 2
// and "nop" 1. These counts were checked by timing the pulses in the emulator.
#define WAIT2 "rjmp .+0\n\t"
#define WAIT1 "nop\n\t"

static inline void sendByte800(volatile uint8_t* port, uint8_t high, uint8_t low, uint8_t byte) {
  uint8_t bits;
  asm volatile(
      "ldi %[bits], 8\n\t"
      "1:\n\t"
      "st %a[port], %[high]\n\t"  // HIGH
      WAIT2 WAIT1                 // 3
      "sbrs %[byte], 7\n\t"       // a 1 skips the next write
      "st %a[port], %[low]\n\t"   // a 0 ends here: 3 + 1 + 2 = 6
      "lsl %[byte]\n\t"
      WAIT2 WAIT2 WAIT1           // 5
      "st %a[port], %[low]\n\t"   // a 1 ends here: 3 + 2 + 1 + 5 + 2 = 13
      WAIT2                       // LOW a little longer, for a bit every 20 or 21
      "dec %[bits]\n\t"
      "brne 1b\n\t"
      : [byte] "+r"(byte), [bits] "=&d"(bits)
      : [port] "e"(port), [high] "r"(high), [low] "r"(low)
      : "memory");
}

static inline void sendByte400(volatile uint8_t* port, uint8_t high, uint8_t low, uint8_t byte) {
  uint8_t bits;
  asm volatile(
      "ldi %[bits], 8\n\t"
      "1:\n\t"
      "st %a[port], %[high]\n\t"
      WAIT2 WAIT2 WAIT1           // 5
      "sbrs %[byte], 7\n\t"
      "st %a[port], %[low]\n\t"   // a 0: 5 + 1 + 2 = 8
      "lsl %[byte]\n\t"
      WAIT2 WAIT2 WAIT2 WAIT2 WAIT1  // 9
      "st %a[port], %[low]\n\t"   // a 1: 5 + 2 + 1 + 9 + 2 = 19
      WAIT2 WAIT2 WAIT2 WAIT2 WAIT2 WAIT2 WAIT2 WAIT2  // 16 more LOW, for the slower rate
      "dec %[bits]\n\t"
      "brne 1b\n\t"
      : [byte] "+r"(byte), [bits] "=&d"(bits)
      : [port] "e"(port), [high] "r"(high), [low] "r"(low)
      : "memory");
}

/**
 * Sends bytes down an LED data line, highest bit first. The port's other pins
 * keep the levels they had when it began; interrupts wait until it ends.
 * Between bytes the line rests LOW a little longer, which the LEDs allow.
 */
static void sendLedBytes(int16_t pin, const uint8_t* data, size_t length, bool khz400) {
  volatile uint8_t* port = portOutputRegister(digitalPinToPort(pin));
  const uint8_t mask = digitalPinToBitMask(pin);
  if (!port || !mask) return;
  const uint8_t sreg = SREG;
  cli();
  const uint8_t high = *port | mask;
  const uint8_t low = *port & ~mask;
  for (size_t i = 0; i < length; i++) {
    if (khz400) {
      sendByte400(port, high, low, data[i]);
    } else {
      sendByte800(port, high, low, data[i]);
    }
  }
  SREG = sreg;
}

// Worked out from their documented meaning (see the header) and kept in flash.
static const uint8_t GAMMA[256] PROGMEM = {
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1,
    1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3,
    3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 5, 6, 6, 6, 6, 7,
    7, 7, 8, 8, 8, 9, 9, 9, 10, 10, 10, 11, 11, 11, 12, 12,
    13, 13, 13, 14, 14, 15, 15, 16, 16, 17, 17, 18, 18, 19, 19, 20,
    20, 21, 21, 22, 22, 23, 24, 24, 25, 25, 26, 27, 27, 28, 29, 29,
    30, 31, 31, 32, 33, 34, 34, 35, 36, 37, 38, 38, 39, 40, 41, 42,
    42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57,
    58, 59, 60, 61, 62, 63, 64, 65, 66, 68, 69, 70, 71, 72, 73, 75,
    76, 77, 78, 80, 81, 82, 84, 85, 86, 88, 89, 90, 92, 93, 94, 96,
    97, 99, 100, 102, 103, 105, 106, 108, 109, 111, 112, 114, 115, 117, 119, 120,
    122, 124, 125, 127, 129, 130, 132, 134, 136, 137, 139, 141, 143, 145, 146, 148,
    150, 152, 154, 156, 158, 160, 162, 164, 166, 168, 170, 172, 174, 176, 178, 180,
    182, 184, 186, 188, 191, 193, 195, 197, 199, 202, 204, 206, 209, 211, 213, 215,
    218, 220, 223, 225, 227, 230, 232, 235, 237, 240, 242, 245, 247, 250, 252, 255,
};
static const uint8_t SINE[256] PROGMEM = {
    128, 131, 134, 137, 140, 143, 146, 149, 152, 155, 158, 162, 165, 167, 170, 173,
    176, 179, 182, 185, 188, 190, 193, 196, 198, 201, 203, 206, 208, 211, 213, 215,
    218, 220, 222, 224, 226, 228, 230, 232, 234, 235, 237, 238, 240, 241, 243, 244,
    245, 246, 248, 249, 250, 250, 251, 252, 253, 253, 254, 254, 254, 255, 255, 255,
    255, 255, 255, 255, 254, 254, 254, 253, 253, 252, 251, 250, 250, 249, 248, 246,
    245, 244, 243, 241, 240, 238, 237, 235, 234, 232, 230, 228, 226, 224, 222, 220,
    218, 215, 213, 211, 208, 206, 203, 201, 198, 196, 193, 190, 188, 185, 182, 179,
    176, 173, 170, 167, 165, 162, 158, 155, 152, 149, 146, 143, 140, 137, 134, 131,
    128, 124, 121, 118, 115, 112, 109, 106, 103, 100, 97, 93, 90, 88, 85, 82,
    79, 76, 73, 70, 67, 65, 62, 59, 57, 54, 52, 49, 47, 44, 42, 40,
    37, 35, 33, 31, 29, 27, 25, 23, 21, 20, 18, 17, 15, 14, 12, 11,
    10, 9, 7, 6, 5, 5, 4, 3, 2, 2, 1, 1, 1, 0, 0, 0,
    0, 0, 0, 0, 1, 1, 1, 2, 2, 3, 4, 5, 5, 6, 7, 9,
    10, 11, 12, 14, 15, 17, 18, 20, 21, 23, 25, 27, 29, 31, 33, 35,
    37, 40, 42, 44, 47, 49, 52, 54, 57, 59, 62, 65, 67, 70, 73, 76,
    79, 82, 85, 88, 90, 93, 97, 100, 103, 106, 109, 112, 115, 118, 121, 124,
};

Adafruit_NeoPixel::Adafruit_NeoPixel(uint16_t n, int16_t pin, neoPixelType type)
    : pin_(pin), type_(type) {
  updateLength(n);
}
Adafruit_NeoPixel::Adafruit_NeoPixel() {}
Adafruit_NeoPixel::~Adafruit_NeoPixel() { free(pixels_); }

void Adafruit_NeoPixel::begin() {
  if (pin_ >= 0) {
    pinMode(pin_, OUTPUT);
    digitalWrite(pin_, LOW);
  }
  begun_ = true;
}

void Adafruit_NeoPixel::setPin(int16_t pin) {
  if (begun_ && pin_ >= 0) pinMode(pin_, INPUT);
  pin_ = pin;
  if (begun_ && pin_ >= 0) {
    pinMode(pin_, OUTPUT);
    digitalWrite(pin_, LOW);
  }
}

void Adafruit_NeoPixel::updateLength(uint16_t n) {
  free(pixels_);
  const size_t bytes = (size_t)n * bytesPerPixel();
  pixels_ = bytes ? (uint8_t*)calloc(bytes, 1) : nullptr;
  count_ = pixels_ ? n : 0;
}

void Adafruit_NeoPixel::updateType(neoPixelType type) {
  const bool wasWhite = (type_ & NEO_HAS_WHITE_) != 0;
  type_ = type;
  // A change between three and four colours a pixel needs room for the other number of bytes.
  if (wasWhite != ((type_ & NEO_HAS_WHITE_) != 0)) updateLength(count_);
}

bool Adafruit_NeoPixel::canShow() {
  return !sent_ || (uint32_t)(micros() - sentAt_) >= LATCH_MICROS;
}

void Adafruit_NeoPixel::show() {
  if (!pixels_ || pin_ < 0) return;
  while (!canShow()) {
  }
  const size_t length = (size_t)count_ * bytesPerPixel();
  if (brightness_ == 255) {
    sendLedBytes(pin_, pixels_, length, (type_ & NEO_KHZ400) != 0);
  } else {
    // Scaled a pixel at a time, so a long strip needs no second copy in the UNO's small memory.
    const uint8_t per = bytesPerPixel();
    uint8_t scaled[4];
    for (uint16_t i = 0; i < count_; i++) {
      for (uint8_t c = 0; c < per; c++) {
        scaled[c] = (uint8_t)(((uint16_t)pixels_[i * per + c] * brightness_ + 127) / 255);
      }
      sendLedBytes(pin_, scaled, per, (type_ & NEO_KHZ400) != 0);
    }
  }
  sentAt_ = micros();
  sent_ = true;
}

void Adafruit_NeoPixel::setPixelColor(uint16_t n, uint8_t r, uint8_t g, uint8_t b) {
  setPixelColor(n, r, g, b, 0);
}

void Adafruit_NeoPixel::setPixelColor(uint16_t n, uint8_t r, uint8_t g, uint8_t b, uint8_t w) {
  if (n >= count_) return;
  uint8_t* p = pixels_ + (size_t)n * bytesPerPixel();
  p[type_ & 3] = r;
  p[(type_ >> 2) & 3] = g;
  p[(type_ >> 4) & 3] = b;
  if (type_ & NEO_HAS_WHITE_) p[(type_ >> 6) & 3] = w;
}

void Adafruit_NeoPixel::setPixelColor(uint16_t n, uint32_t c) {
  setPixelColor(n, (uint8_t)(c >> 16), (uint8_t)(c >> 8), (uint8_t)c, (uint8_t)(c >> 24));
}

uint32_t Adafruit_NeoPixel::getPixelColor(uint16_t n) const {
  if (n >= count_) return 0;
  const uint8_t* p = pixels_ + (size_t)n * bytesPerPixel();
  const uint8_t w = (type_ & NEO_HAS_WHITE_) ? p[(type_ >> 6) & 3] : 0;
  return Color(p[type_ & 3], p[(type_ >> 2) & 3], p[(type_ >> 4) & 3], w);
}

void Adafruit_NeoPixel::fill(uint32_t c, uint16_t first, uint16_t count) {
  if (first >= count_) return;
  const uint16_t end = (count == 0 || (uint32_t)first + count > count_) ? count_ : first + count;
  for (uint16_t i = first; i < end; i++) setPixelColor(i, c);
}

void Adafruit_NeoPixel::clear() {
  if (pixels_) memset(pixels_, 0, (size_t)count_ * bytesPerPixel());
}

void Adafruit_NeoPixel::setBrightness(uint8_t brightness) { brightness_ = brightness; }

void Adafruit_NeoPixel::rainbow(uint16_t first_hue, int8_t reps, uint8_t saturation,
                                uint8_t brightness, bool gammify) {
  for (uint16_t i = 0; i < count_; i++) {
    const uint16_t hue = (uint16_t)(first_hue + (int32_t)i * reps * 65536L / count_);
    uint32_t colour = ColorHSV(hue, saturation, brightness);
    if (gammify) colour = gamma32(colour);
    setPixelColor(i, colour);
  }
}

uint8_t Adafruit_NeoPixel::sine8(uint8_t x) { return pgm_read_byte(&SINE[x]); }

uint8_t Adafruit_NeoPixel::gamma8(uint8_t x) { return pgm_read_byte(&GAMMA[x]); }

uint32_t Adafruit_NeoPixel::gamma32(uint32_t x) {
  return (uint32_t)gamma8(x >> 24) << 24 | (uint32_t)gamma8(x >> 16) << 16 |
         (uint32_t)gamma8(x >> 8) << 8 | gamma8(x);
}

uint32_t Adafruit_NeoPixel::ColorHSV(uint16_t hue, uint8_t sat, uint8_t val) {
  // Six stretches round the circle, each fading one colour in or out.
  const uint32_t position = (uint32_t)hue * 6;
  const uint8_t stretch = (uint8_t)(position >> 16);
  const uint8_t up = (uint8_t)(position >> 8);
  const uint8_t down = 255 - up;
  uint8_t r, g, b;
  switch (stretch) {
    case 0: r = 255, g = up, b = 0; break;
    case 1: r = down, g = 255, b = 0; break;
    case 2: r = 0, g = 255, b = up; break;
    case 3: r = 0, g = down, b = 255; break;
    case 4: r = up, g = 0, b = 255; break;
    default: r = 255, g = 0, b = down; break;
  }
  // Less saturation mixes in white; the value scales the whole.
  auto shade = [&](uint8_t c) {
    const uint32_t mixed = 255 - (uint32_t)sat * (255 - c) / 255;
    return (uint8_t)((mixed * val + 127) / 255);
  };
  return Color(shade(r), shade(g), shade(b));
}

neoPixelType Adafruit_NeoPixel::str2order(const char* v) {
  int r = -1, g = -1, b = -1, w = -1;
  const size_t n = v ? strlen(v) : 0;
  for (size_t i = 0; i < n && i < 4; i++) {
    switch (toupper((unsigned char)v[i])) {
      case 'R': r = (int)i; break;
      case 'G': g = (int)i; break;
      case 'B': b = (int)i; break;
      case 'W': w = (int)i; break;
    }
  }
  if (r < 0 || g < 0 || b < 0) return NEO_GRB;
  return (neoPixelType)(NEO_ORDER_(r, g, b, w < 0 ? 0 : w) | (w < 0 ? 0 : NEO_HAS_WHITE_));
}
