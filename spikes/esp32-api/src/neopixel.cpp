// WS2812B LEDs: see include/Adafruit_NeoPixel.h. The lab's own code.
#include <Adafruit_NeoPixel.h>

// The line must rest LOW this long before the LEDs take the next colours. The
// WS2812B's datasheet asks for more than 280 microseconds.
static const uint32_t LATCH_MICROS = 300;

/** Sends bytes down an LED data line and charges the time they take: 1.25 µs a bit at 800 kHz. */
static void sendLedBytes(int pin, const uint8_t* data, size_t length, bool khz400) {
  host_led_strip(pin, data, length, khz400 ? 400 : 800);
  const uint64_t nanos = (uint64_t)length * 8 * (khz400 ? 2500 : 1250);
  host_delay_micros(nanos / 1000);
}

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
  return !sent_ || host_micros() - sentAt_ >= LATCH_MICROS;
}

void Adafruit_NeoPixel::show() {
  if (!pixels_ || pin_ < 0) return;
  while (!canShow()) host_tick();
  const size_t length = (size_t)count_ * bytesPerPixel();
  uint8_t* scaled = (uint8_t*)malloc(length);
  if (!scaled) return;
  for (size_t i = 0; i < length; i++) {
    scaled[i] = (uint8_t)(((uint32_t)pixels_[i] * brightness_ + 127) / 255);
  }
  sendLedBytes(pin_, scaled, length, (type_ & NEO_KHZ400) != 0);
  free(scaled);
  sentAt_ = host_micros();
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

uint8_t Adafruit_NeoPixel::sine8(uint8_t x) {
  const long v = lround(127.5 + 127.5 * sin(x * (2 * M_PI / 256)));
  return (uint8_t)(v < 0 ? 0 : v > 255 ? 255 : v);
}

uint8_t Adafruit_NeoPixel::gamma8(uint8_t x) {
  static uint8_t table[256];
  static bool made = false;
  if (!made) {
    for (int i = 0; i < 256; i++) table[i] = (uint8_t)lround(pow(i / 255.0, 2.6) * 255);
    made = true;
  }
  return table[x];
}

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

// The chip's own call for a single WS2812 LED, such as the one built onto some
// boards: green, red and blue, at 800 kHz.
void rgbLedWrite(uint8_t pin, uint8_t red_val, uint8_t green_val, uint8_t blue_val) {
  const uint8_t bytes[3] = {green_val, red_val, blue_val};
  pinMode(pin, OUTPUT);
  sendLedBytes(pin, bytes, 3, false);
  host_delay_micros(LATCH_MICROS);
}
void neopixelWrite(uint8_t pin, uint8_t red_val, uint8_t green_val, uint8_t blue_val) {
  rgbLedWrite(pin, red_val, green_val, blue_val);
}
