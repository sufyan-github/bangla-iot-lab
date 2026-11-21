// A board library for the ESP32 development board, written for this project.
//
// It offers the functions an Arduino sketch for the ESP32 calls, implemented on
// the small host interface in host.h, not on the real chip. A sketch compiled
// against it runs the student's own code exactly, but everything the board does
// is a model: this is "API-level", not an emulation of the processor.
//
// STUDY PROTOTYPE. Covers what the level 1 and 2 reference sketches use: pins,
// time, serial text, analog input, PWM, pulse timing and interrupts.
#pragma once

#include <math.h>
#include <stdarg.h>
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include <algorithm>
#include <cmath>
#include <string>

#include "host.h"

// --- constants, with the values the ESP32 core uses ---
#define LOW 0x0
#define HIGH 0x1
#define INPUT 0x01
#define OUTPUT 0x03
#define PULLUP 0x04
#define INPUT_PULLUP 0x05
#define PULLDOWN 0x08
#define INPUT_PULLDOWN 0x09
#define OPEN_DRAIN 0x10
#define OUTPUT_OPEN_DRAIN 0x13
#define RISING 0x01
#define FALLING 0x02
#define CHANGE 0x03
#define DEC 10
#define HEX 16
#define OCT 8
#define BIN 2
#define PI 3.1415926535897932384626433832795
#define HALF_PI 1.5707963267948966192313216916398
#define TWO_PI 6.283185307179586476925286766559
#define DEG_TO_RAD 0.017453292519943295769236907684886
#define RAD_TO_DEG 57.295779513082320876798154814105
#define LED_BUILTIN 2

// Pin names of the ESP32 Dev Module.
static const uint8_t A0 = 36, A3 = 39, A4 = 32, A5 = 33, A6 = 34, A7 = 35, A10 = 4, A11 = 0, A12 = 2,
                     A13 = 15, A14 = 13, A15 = 12, A16 = 14, A17 = 27, A18 = 25, A19 = 26;
static const uint8_t T0 = 4, T1 = 0, T2 = 2, T3 = 15, T4 = 13, T5 = 12, T6 = 14, T7 = 27, T8 = 33,
                     T9 = 32;
static const uint8_t DAC1 = 25, DAC2 = 26, SDA = 21, SCL = 22, TX = 1, RX = 3;

typedef enum { ADC_0db, ADC_2_5db, ADC_6db, ADC_11db, ADC_12db = ADC_11db } adc_attenuation_t;

// Attributes and flash-string helpers that mean nothing off the chip.
#define IRAM_ATTR
#define ARDUINO_ISR_ATTR
#define PROGMEM
#define PSTR(text) (text)
#define F(text) (text)
#define pgm_read_byte(address) (*(const uint8_t*)(address))
#define pgm_read_word(address) (*(const uint16_t*)(address))

typedef uint8_t byte;
typedef bool boolean;
typedef uint16_t word;

// --- arithmetic helpers ---
using std::abs;
using std::isinf;
using std::isnan;
using std::max;
using std::min;
using std::round;
#define constrain(amount, low, high) ((amount) < (low) ? (low) : ((amount) > (high) ? (high) : (amount)))
#define sq(x) ((x) * (x))
#define radians(deg) ((deg) * DEG_TO_RAD)
#define degrees(rad) ((rad) * RAD_TO_DEG)
#define lowByte(w) ((uint8_t)((w) & 0xff))
#define highByte(w) ((uint8_t)((w) >> 8))
#define bitRead(value, bit) (((value) >> (bit)) & 0x01)
#define bitSet(value, bit) ((value) |= (1UL << (bit)))
#define bitClear(value, bit) ((value) &= ~(1UL << (bit)))
#define bitWrite(value, bit, bitvalue) ((bitvalue) ? bitSet(value, bit) : bitClear(value, bit))
#define bit(b) (1UL << (b))
long map(long value, long fromLow, long fromHigh, long toLow, long toHigh);
long random(long howbig);
long random(long howsmall, long howbig);
void randomSeed(unsigned long seed);

// --- pins ---
void pinMode(uint8_t pin, uint8_t mode);
void digitalWrite(uint8_t pin, uint8_t level);
int digitalRead(uint8_t pin);
uint16_t analogRead(uint8_t pin);
uint32_t analogReadMilliVolts(uint8_t pin);
void analogReadResolution(uint8_t bits);
void analogSetAttenuation(adc_attenuation_t attenuation);
void analogSetPinAttenuation(uint8_t pin, adc_attenuation_t attenuation);
void analogWrite(uint8_t pin, int value);
void analogWriteResolution(uint8_t pin, uint8_t bits);
void analogWriteFrequency(uint8_t pin, uint32_t frequency);
bool ledcAttach(uint8_t pin, uint32_t frequency, uint8_t resolution);
bool ledcWrite(uint8_t pin, uint32_t duty);
uint32_t ledcWriteTone(uint8_t pin, uint32_t frequency);
uint32_t ledcChangeFrequency(uint8_t pin, uint32_t frequency, uint8_t resolution);
bool ledcDetach(uint8_t pin);
void dacWrite(uint8_t pin, uint8_t value);
uint16_t touchRead(uint8_t pin);
unsigned long pulseIn(uint8_t pin, uint8_t level, unsigned long timeout = 1000000UL);
unsigned long pulseInLong(uint8_t pin, uint8_t level, unsigned long timeout = 1000000UL);
void tone(uint8_t pin, unsigned int frequency, unsigned long duration = 0);
void noTone(uint8_t pin);
#define digitalPinToInterrupt(pin) (pin)
void attachInterrupt(uint8_t pin, void (*handler)(void), int mode);
void detachInterrupt(uint8_t pin);
void interrupts(void);
void noInterrupts(void);

// --- time ---
unsigned long millis(void);
unsigned long micros(void);
void delay(uint32_t milliseconds);
void delayMicroseconds(uint32_t microseconds);
void yield(void);

// --- text ---
class String {
 public:
  String() {}
  String(const char* text) : value_(text ? text : "") {}
  String(const std::string& text) : value_(text) {}
  String(char c) : value_(1, c) {}
  String(int number, unsigned char base = 10);
  String(unsigned int number, unsigned char base = 10);
  String(long number, unsigned char base = 10);
  String(unsigned long number, unsigned char base = 10);
  String(float number, unsigned int decimals = 2);
  String(double number, unsigned int decimals = 2);

  unsigned int length() const { return value_.size(); }
  const char* c_str() const { return value_.c_str(); }
  bool isEmpty() const { return value_.empty(); }
  char charAt(unsigned int index) const { return index < value_.size() ? value_[index] : 0; }
  char operator[](unsigned int index) const { return charAt(index); }
  char& operator[](unsigned int index) { return value_[index]; }
  void setCharAt(unsigned int index, char c) {
    if (index < value_.size()) value_[index] = c;
  }

  String& operator+=(const String& other) {
    value_ += other.value_;
    return *this;
  }
  String& operator+=(const char* text) {
    value_ += text ? text : "";
    return *this;
  }
  String& operator+=(char c) {
    value_ += c;
    return *this;
  }
  String& operator+=(int number) { return *this += String(number); }
  String& operator+=(long number) { return *this += String(number); }
  String& operator+=(unsigned long number) { return *this += String(number); }
  String& operator+=(float number) { return *this += String(number); }
  String& operator+=(double number) { return *this += String(number); }
  bool concat(const String& other) {
    value_ += other.value_;
    return true;
  }

  bool equals(const String& other) const { return value_ == other.value_; }
  bool equalsIgnoreCase(const String& other) const;
  bool operator==(const String& other) const { return value_ == other.value_; }
  bool operator==(const char* text) const { return value_ == (text ? text : ""); }
  bool operator!=(const String& other) const { return value_ != other.value_; }
  bool operator!=(const char* text) const { return !(*this == text); }
  bool operator<(const String& other) const { return value_ < other.value_; }
  int compareTo(const String& other) const { return value_.compare(other.value_); }
  bool startsWith(const String& prefix) const { return value_.rfind(prefix.value_, 0) == 0; }
  bool endsWith(const String& suffix) const;

  int indexOf(char c, unsigned int from = 0) const;
  int indexOf(const String& text, unsigned int from = 0) const;
  int lastIndexOf(char c) const;
  String substring(unsigned int from) const;
  String substring(unsigned int from, unsigned int to) const;
  void trim();
  void toUpperCase();
  void toLowerCase();
  void replace(const String& find, const String& with);
  void remove(unsigned int index, unsigned int count = (unsigned int)-1);
  long toInt() const { return strtol(value_.c_str(), nullptr, 10); }
  float toFloat() const { return strtof(value_.c_str(), nullptr); }
  double toDouble() const { return strtod(value_.c_str(), nullptr); }

 private:
  std::string value_;
};
String operator+(const String& a, const String& b);
String operator+(const String& a, const char* b);
String operator+(const char* a, const String& b);
String operator+(const String& a, char b);
String operator+(const String& a, int b);
String operator+(const String& a, long b);
String operator+(const String& a, unsigned long b);
String operator+(const String& a, float b);
String operator+(const String& a, double b);

/** The serial port to the computer: what the serial monitor shows and sends. */
class HardwareSerial {
 public:
  void begin(unsigned long baud, uint32_t config = 0, int8_t rx = -1, int8_t tx = -1) { (void)baud, (void)config, (void)rx, (void)tx; }
  void end() {}
  void flush() {}
  void setTimeout(unsigned long milliseconds) { timeout_ = milliseconds; }
  operator bool() const { return true; }

  size_t write(uint8_t c);
  size_t write(const char* text);
  size_t write(const uint8_t* buffer, size_t size);
  size_t print(const String& text);
  size_t print(const char* text);
  size_t print(char c);
  size_t print(int number, int base = DEC);
  size_t print(unsigned int number, int base = DEC);
  size_t print(long number, int base = DEC);
  size_t print(unsigned long number, int base = DEC);
  size_t print(long long number, int base = DEC);
  size_t print(unsigned long long number, int base = DEC);
  size_t print(double number, int decimals = 2);
  size_t println();
  template <typename T>
  size_t println(T value) {
    return print(value) + println();
  }
  template <typename T>
  size_t println(T value, int format) {
    return print(value, format) + println();
  }
  size_t printf(const char* format, ...) __attribute__((format(printf, 2, 3)));

  int available();
  int read();
  int peek();
  String readString();
  String readStringUntil(char terminator);
  long parseInt();
  float parseFloat();

 private:
  unsigned long timeout_ = 1000;
  /** Waits for a byte to arrive, up to the timeout. */
  int timedRead();
};
extern HardwareSerial Serial;

/** Facts about the chip. Fixed values of a typical board: nothing is measured. */
class EspClass {
 public:
  void restart();
  uint32_t getFreeHeap() { return 280000; }
  uint32_t getHeapSize() { return 327680; }
  uint32_t getMinFreeHeap() { return 270000; }
  const char* getChipModel() { return "ESP32-D0WD-V3"; }
  uint8_t getChipRevision() { return 3; }
  uint8_t getChipCores() { return 2; }
  uint32_t getCpuFreqMHz() { return 240; }
  uint32_t getFlashChipSize() { return 4 * 1024 * 1024; }
  uint32_t getSketchSize() { return 262144; }
  uint32_t getFreeSketchSpace() { return 1310720; }
  uint64_t getEfuseMac() { return 0x0000A1B2C3D4E5F6ULL; }
  const char* getSdkVersion() { return "v5.5"; }
};
extern EspClass ESP;
const char* esp_get_idf_version(void);
uint32_t esp_random(void);

// What every sketch defines.
void setup(void);
void loop(void);
