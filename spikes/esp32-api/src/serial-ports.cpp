// The ESP32's second and third serial ports, in a file of their own so that a
// program that does not use them does not carry them.
#include "Arduino.h"

HardwareSerial Serial1(1);
HardwareSerial Serial2(2);
