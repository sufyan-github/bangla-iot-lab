// The board library's implementation: every function is answered through host.h.
#include "Arduino.h"

#include <cctype>

HardwareSerial Serial;
EspClass ESP;

// ---------------------------------------------------------------- arithmetic
long map(long value, long fromLow, long fromHigh, long toLow, long toHigh) {
  if (fromHigh == fromLow) return toLow;
  return (value - fromLow) * (toHigh - toLow) / (fromHigh - fromLow) + toLow;
}
// A small fixed generator, so a run is repeatable.
static uint32_t random_state = 0x2545F491u;
static uint32_t next_random() {
  random_state ^= random_state << 13;
  random_state ^= random_state >> 17;
  random_state ^= random_state << 5;
  return random_state;
}
void randomSeed(unsigned long seed) { random_state = seed ? (uint32_t)seed : 0x2545F491u; }
long random(long howbig) { return howbig <= 0 ? 0 : (long)(next_random() % (uint32_t)howbig); }
long random(long howsmall, long howbig) {
  return howsmall >= howbig ? howsmall : random(howbig - howsmall) + howsmall;
}
uint32_t esp_random(void) { return next_random(); }
const char* esp_get_idf_version(void) { return "v5.5"; }

// ---------------------------------------------------------------------- pins
static uint8_t adc_bits = 12;
struct Pwm {
  bool attached = false;
  uint32_t frequency = 1000;
  uint8_t bits = 8;
};
static Pwm pwm[40];

void pinMode(uint8_t pin, uint8_t mode) {
  host_tick();
  host_pin_mode(pin, mode);
}
void digitalWrite(uint8_t pin, uint8_t level) {
  host_tick();
  host_digital_write(pin, level ? 1 : 0);
}
int digitalRead(uint8_t pin) {
  host_tick();
  return host_digital_read(pin) ? HIGH : LOW;
}

// The converter is not ideal (it is blind near 0 V and compresses near the top),
// and how it behaves belongs to the chip, so the world answers: the library only
// passes on the resolution and attenuation the sketch chose.
static uint8_t attenuation_of[40];
static bool attenuation_set = false;
static int attenuation(uint8_t pin) {
  if (!attenuation_set) {
    for (uint8_t& value : attenuation_of) value = ADC_11db; // the default
    attenuation_set = true;
  }
  return pin < 40 ? attenuation_of[pin] : ADC_11db;
}
uint32_t analogReadMilliVolts(uint8_t pin) {
  host_tick();
  int millivolts = host_analog_read_millivolts(pin, attenuation(pin));
  return (uint32_t)(millivolts < 0 ? 0 : millivolts);
}
uint16_t analogRead(uint8_t pin) {
  host_tick();
  return (uint16_t)host_analog_read(pin, attenuation(pin), adc_bits);
}
void analogReadResolution(uint8_t bits) { adc_bits = constrain(bits, 1, 16); }
void analogSetAttenuation(adc_attenuation_t value) {
  attenuation(0);
  for (uint8_t& each : attenuation_of) each = (uint8_t)value;
}
void analogSetPinAttenuation(uint8_t pin, adc_attenuation_t value) {
  attenuation(0);
  if (pin < 40) attenuation_of[pin] = (uint8_t)value;
}

static void drive(uint8_t pin, uint32_t duty) {
  if (pin >= 40) return;
  uint32_t top = (1u << pwm[pin].bits) - 1;
  host_pwm(pin, duty > top ? top : duty, top, pwm[pin].frequency);
}
// The PWM timer counts an 80 MHz clock, so N bits of resolution cannot go faster than
// 80 MHz / 2^N. Asking for more fails, as it does on the board.
static bool reachable(uint32_t frequency, uint8_t resolution) {
  return resolution >= 1 && resolution <= 16 && frequency > 0 &&
         frequency <= (80000000u >> resolution);
}
bool ledcAttach(uint8_t pin, uint32_t frequency, uint8_t resolution) {
  host_tick();
  if (pin >= 40 || !reachable(frequency, resolution)) return false;
  pwm[pin] = {true, frequency, resolution};
  drive(pin, 0);
  return true;
}
bool ledcWrite(uint8_t pin, uint32_t duty) {
  host_tick();
  if (pin >= 40 || !pwm[pin].attached) return false;
  drive(pin, duty);
  return true;
}
uint32_t ledcChangeFrequency(uint8_t pin, uint32_t frequency, uint8_t resolution) {
  host_tick();
  if (pin >= 40 || !reachable(frequency, resolution)) return 0;
  pwm[pin].frequency = frequency;
  pwm[pin].bits = resolution;
  return frequency;
}
uint32_t ledcWriteTone(uint8_t pin, uint32_t frequency) {
  host_tick();
  if (pin >= 40) return 0;
  if (!pwm[pin].attached) pwm[pin] = {true, frequency, 10};
  pwm[pin].frequency = frequency;
  drive(pin, frequency == 0 ? 0 : (1u << pwm[pin].bits) / 2);
  return frequency;
}
bool ledcDetach(uint8_t pin) {
  if (pin >= 40) return false;
  pwm[pin].attached = false;
  host_pwm(pin, 0, 255, 0);
  return true;
}
void analogWrite(uint8_t pin, int value) {
  host_tick();
  if (pin >= 40) return;
  if (!pwm[pin].attached) pwm[pin] = {true, 1000, pwm[pin].bits ? pwm[pin].bits : (uint8_t)8};
  drive(pin, value < 0 ? 0 : (uint32_t)value);
}
void analogWriteResolution(uint8_t pin, uint8_t bits) {
  if (pin < 40) pwm[pin].bits = bits;
}
void analogWriteFrequency(uint8_t pin, uint32_t frequency) {
  if (pin < 40) pwm[pin].frequency = frequency;
}
void tone(uint8_t pin, unsigned int frequency, unsigned long duration) {
  ledcWriteTone(pin, frequency);
  if (duration > 0) {
    delay(duration);
    ledcWriteTone(pin, 0);
  }
}
void noTone(uint8_t pin) { ledcWriteTone(pin, 0); }
void dacWrite(uint8_t pin, uint8_t value) {
  host_tick();
  host_pwm(pin, value, 255, 0); // a steady level: frequency 0
}
uint16_t touchRead(uint8_t pin) {
  host_tick();
  return (uint16_t)host_touch_read(pin);
}
unsigned long pulseIn(uint8_t pin, uint8_t level, unsigned long timeout) {
  host_tick();
  return host_pulse_in(pin, level ? 1 : 0, (uint32_t)timeout);
}
unsigned long pulseInLong(uint8_t pin, uint8_t level, unsigned long timeout) {
  return pulseIn(pin, level, timeout);
}
void attachInterrupt(uint8_t pin, void (*handler)(void), int mode) {
  host_attach_interrupt(pin, handler, mode);
}
void detachInterrupt(uint8_t pin) { host_detach_interrupt(pin); }
void interrupts(void) {}
void noInterrupts(void) {}
uint32_t getCpuFrequencyMhz(void) { return 240; }

// ---------------------------------------------------------------------- time
unsigned long millis(void) {
  host_tick();
  return (unsigned long)(host_micros() / 1000);
}
unsigned long micros(void) {
  host_tick();
  return (unsigned long)host_micros();
}
void delay(uint32_t milliseconds) { host_delay_micros((uint64_t)milliseconds * 1000); }
void delayMicroseconds(uint32_t microseconds) { host_delay_micros(microseconds); }
void yield(void) { host_tick(); }
void EspClass::restart() {
  // A restart ends the run: there is no second boot in this prototype.
  host_serial_write("\n[restart]\n", 11);
  host_delay_micros(UINT64_MAX / 4);
}

// -------------------------------------------------------------------- String
// The board's own software writes numbers in two ways, and the two differ:
// String(255, HEX) is "ff" but Serial.print(255, HEX) is "FF". Only base 10 has
// a minus sign; in any other base a negative number shows its 32 bits.
static std::string number(unsigned long long magnitude, bool negative, unsigned char base,
                          bool capitals) {
  if (base < 2) base = 10;
  const char* letters = capitals ? "0123456789ABCDEF" : "0123456789abcdef";
  std::string digits;
  do {
    digits.insert(digits.begin(), letters[magnitude % base]);
    magnitude /= base;
  } while (magnitude > 0);
  return negative ? "-" + digits : digits;
}
static std::string whole(long long n, unsigned char base, bool capitals) {
  if (n >= 0) return number((unsigned long long)n, false, base, capitals);
  if (base == 10) return number((unsigned long long)(-(n + 1)) + 1, true, base, capitals);
  return number((uint32_t)n, false, base, capitals); // int and long are 32 bits on the board
}
static std::string decimal(double value, unsigned int decimals) {
  char buffer[64];
  snprintf(buffer, sizeof buffer, "%.*f", (int)decimals, value);
  return buffer;
}
String::String(int n, unsigned char base) : value_(whole(n, base, false)) {}
String::String(unsigned int n, unsigned char base) : value_(number(n, false, base, false)) {}
String::String(long n, unsigned char base) : value_(whole(n, base, false)) {}
String::String(unsigned long n, unsigned char base) : value_(number(n, false, base, false)) {}
String::String(float n, unsigned int decimals) : value_(decimal(n, decimals)) {}
String::String(double n, unsigned int decimals) : value_(decimal(n, decimals)) {}

bool String::equalsIgnoreCase(const String& other) const {
  if (value_.size() != other.value_.size()) return false;
  for (size_t i = 0; i < value_.size(); i++) {
    if (tolower((unsigned char)value_[i]) != tolower((unsigned char)other.value_[i])) return false;
  }
  return true;
}
bool String::endsWith(const String& suffix) const {
  return value_.size() >= suffix.value_.size() &&
         value_.compare(value_.size() - suffix.value_.size(), suffix.value_.size(), suffix.value_) == 0;
}
int String::indexOf(char c, unsigned int from) const {
  size_t at = value_.find(c, from);
  return at == std::string::npos ? -1 : (int)at;
}
int String::indexOf(const String& text, unsigned int from) const {
  size_t at = value_.find(text.value_, from);
  return at == std::string::npos ? -1 : (int)at;
}
int String::lastIndexOf(char c) const {
  size_t at = value_.rfind(c);
  return at == std::string::npos ? -1 : (int)at;
}
String String::substring(unsigned int from) const {
  return from >= value_.size() ? String() : String(value_.substr(from));
}
String String::substring(unsigned int from, unsigned int to) const {
  if (from > to) std::swap(from, to);
  if (from >= value_.size()) return String();
  return String(value_.substr(from, to - from));
}
void String::trim() {
  size_t first = 0, last = value_.size();
  while (first < last && isspace((unsigned char)value_[first])) first++;
  while (last > first && isspace((unsigned char)value_[last - 1])) last--;
  value_ = value_.substr(first, last - first);
}
void String::toUpperCase() {
  for (char& c : value_) c = (char)toupper((unsigned char)c);
}
void String::toLowerCase() {
  for (char& c : value_) c = (char)tolower((unsigned char)c);
}
void String::replace(const String& find, const String& with) {
  if (find.value_.empty()) return;
  for (size_t at = 0; (at = value_.find(find.value_, at)) != std::string::npos; at += with.value_.size()) {
    value_.replace(at, find.value_.size(), with.value_);
  }
}
void String::remove(unsigned int index, unsigned int count) {
  if (index < value_.size()) value_.erase(index, count);
}
String operator+(const String& a, const String& b) { return String(a) += b; }
String operator+(const String& a, const char* b) { return String(a) += b; }
String operator+(const char* a, const String& b) { return String(a) += b; }
String operator+(const String& a, char b) { return String(a) += b; }
String operator+(const String& a, int b) { return String(a) += b; }
String operator+(const String& a, long b) { return String(a) += b; }
String operator+(const String& a, unsigned long b) { return String(a) += b; }
String operator+(const String& a, float b) { return String(a) += b; }
String operator+(const String& a, double b) { return String(a) += b; }

// -------------------------------------------------------------------- Serial
size_t HardwareSerial::write(uint8_t c) {
  host_serial_write((const char*)&c, 1);
  return 1;
}
size_t HardwareSerial::write(const char* text) {
  size_t length = text ? strlen(text) : 0;
  if (length) host_serial_write(text, length);
  return length;
}
size_t HardwareSerial::write(const uint8_t* buffer, size_t size) {
  host_serial_write((const char*)buffer, size);
  return size;
}
size_t HardwareSerial::print(const String& text) { return write(text.c_str()); }
size_t HardwareSerial::print(const char* text) { return write(text); }
size_t HardwareSerial::print(char c) { return write((uint8_t)c); }
size_t HardwareSerial::print(int n, int base) { return write(whole(n, (unsigned char)base, true).c_str()); }
size_t HardwareSerial::print(unsigned int n, int base) {
  return write(number(n, false, (unsigned char)base, true).c_str());
}
size_t HardwareSerial::print(long n, int base) { return write(whole(n, (unsigned char)base, true).c_str()); }
size_t HardwareSerial::print(unsigned long n, int base) {
  return write(number(n, false, (unsigned char)base, true).c_str());
}
size_t HardwareSerial::print(long long n, int base) {
  if (n >= 0 || base == 10) return write(whole(n, (unsigned char)base, true).c_str());
  return write(number((unsigned long long)n, false, (unsigned char)base, true).c_str());
}
size_t HardwareSerial::print(unsigned long long n, int base) {
  return write(number(n, false, (unsigned char)base, true).c_str());
}
size_t HardwareSerial::print(double n, int decimals) { return print(String(n, (unsigned int)decimals)); }
size_t HardwareSerial::println() { return write("\r\n"); }
size_t HardwareSerial::printf(const char* format, ...) {
  char stack[256];
  va_list args;
  va_start(args, format);
  int length = vsnprintf(stack, sizeof stack, format, args);
  va_end(args);
  if (length < 0) return 0;
  if ((size_t)length < sizeof stack) {
    host_serial_write(stack, (size_t)length);
    return (size_t)length;
  }
  std::string big((size_t)length + 1, '\0');
  va_start(args, format);
  vsnprintf(&big[0], big.size(), format, args);
  va_end(args);
  host_serial_write(big.data(), (size_t)length);
  return (size_t)length;
}
int HardwareSerial::available() {
  host_tick();
  return host_serial_available();
}
int HardwareSerial::read() { return host_serial_read(); }
int HardwareSerial::peek() { return host_serial_peek(); }
int HardwareSerial::timedRead() {
  uint64_t give_up = host_micros() + (uint64_t)timeout_ * 1000;
  while (host_micros() < give_up) {
    int c = host_serial_read();
    if (c >= 0) return c;
    host_delay_micros(1000);
  }
  return -1;
}
String HardwareSerial::readString() {
  String text;
  for (int c = timedRead(); c >= 0; c = timedRead()) text += (char)c;
  return text;
}
String HardwareSerial::readStringUntil(char terminator) {
  String text;
  for (int c = timedRead(); c >= 0 && c != terminator; c = timedRead()) text += (char)c;
  return text;
}
long HardwareSerial::parseInt() {
  int c = timedRead();
  while (c >= 0 && c != '-' && !isdigit(c)) c = timedRead();
  if (c < 0) return 0;
  bool negative = c == '-';
  long value = negative ? 0 : c - '0';
  for (c = host_serial_peek(); c >= 0 && isdigit(c); c = host_serial_peek()) {
    value = value * 10 + (host_serial_read() - '0');
  }
  return negative ? -value : value;
}
float HardwareSerial::parseFloat() {
  String text;
  int c = timedRead();
  while (c >= 0 && c != '-' && c != '.' && !isdigit(c)) c = timedRead();
  for (; c >= 0 && (c == '-' || c == '.' || isdigit(c)); c = timedRead()) text += (char)c;
  return text.toFloat();
}

// -------------------------------------------------------------------- ESP32Servo
#include "ESP32Servo.h"

// GPIO 34 to 39 are inputs only, and 6 to 11 belong to the flash chip.
static bool can_drive_servo(int pin) { return pin >= 0 && pin < 34 && !(pin >= 6 && pin <= 11); }
static int next_servo_channel = 1;

double Servo::tickUs() const { return (1000000.0 / hertz_) / (double)(1 << bits_); }
int Servo::attach(int pin) { return attach(pin, DEFAULT_uS_LOW, DEFAULT_uS_HIGH); }
int Servo::attach(int pin, int minUs, int maxUs) {
  if (!can_drive_servo(pin)) return 0;
  pin_ = pin;
  min_ = minUs < MIN_PULSE_WIDTH ? MIN_PULSE_WIDTH : minUs;
  max_ = maxUs > MAX_PULSE_WIDTH ? MAX_PULSE_WIDTH : maxUs;
  // The signal starts when the sketch first writes a position, as with the library.
  host_tick();
  host_pwm(pin_, 0, 1u << bits_, hertz_);
  return next_servo_channel++;
}
void Servo::detach() {
  if (pin_ < 0) return;
  host_tick();
  host_pwm(pin_, 0, 1u << bits_, hertz_);
  pin_ = -1;
}
void Servo::write(int value) {
  if (value < MIN_PULSE_WIDTH) {
    value = constrain(value, 0, 180);
    value = map(value, 0, 180, min_, max_);
  }
  writeMicroseconds(value);
}
void Servo::writeMicroseconds(int us) {
  if (pin_ < 0) return;
  us = constrain(us, min_, max_);
  ticks_ = (int)(us / tickUs());
  host_tick();
  host_pwm(pin_, (uint32_t)ticks_, 1u << bits_, hertz_);
}
int Servo::readMicroseconds() { return pin_ < 0 ? 0 : (int)(ticks_ * tickUs()); }
int Servo::read() { return (int)map(readMicroseconds(), min_, max_, 0, 180); }
bool Servo::attached() { return pin_ >= 0; }
void Servo::setPeriodHertz(int hertz) { hertz_ = constrain(hertz, 1, 400); }
void Servo::setTimerWidth(int bits) { bits_ = constrain(bits, 10, 16); }
int Servo::readTimerWidth() { return bits_; }
