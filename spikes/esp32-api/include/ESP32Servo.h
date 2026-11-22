// The interface of the ESP32Servo library, for the lab's board library.
//
// Written for this project from the library's documented interface and
// behaviour; it contains none of that library's code. What it models:
// a 50 Hz signal from the board's PWM timer at 10 bits, so a pulse can only be
// a whole number of 19.5 µs steps, as on the board.
#pragma once
#include <Arduino.h>

#define DEFAULT_uS_LOW 544
#define DEFAULT_uS_HIGH 2400
#define MIN_PULSE_WIDTH 500
#define MAX_PULSE_WIDTH 2500
#define DEFAULT_PULSE_WIDTH 1500

/** Sketches call this to reserve a PWM timer. Here every servo has one. */
class ESP32PWM {
 public:
  static void allocateTimer(int) {}
};

class Servo {
 public:
  /** Returns the PWM channel used (never 0), or 0 if the pin cannot drive a servo. */
  int attach(int pin);
  int attach(int pin, int minUs, int maxUs);
  void detach();
  /** Below 500 the value is an angle from 0 to 180; otherwise a pulse width in microseconds. */
  void write(int value);
  void writeMicroseconds(int us);
  int read();
  int readMicroseconds();
  bool attached();
  void setPeriodHertz(int hertz);
  void setTimerWidth(int bits);
  int readTimerWidth();

 private:
  int pin_ = -1;
  int min_ = DEFAULT_uS_LOW;
  int max_ = DEFAULT_uS_HIGH;
  int hertz_ = 50;
  int bits_ = 10;
  int ticks_ = 0;
  double tickUs() const;
};
