// The I2C bus ("Wire"), for the lab's board library.
//
// Written for this project from the documented interface of the ESP32's Wire
// library; it contains none of that library's code. What it models: the board
// as the master of the bus, whole exchanges at a time (see host_i2c_transfer).
// It does not model the board as a slave, clock stretching, or the bits on
// the two wires.
#pragma once
#include <Arduino.h>

/** Most bytes one exchange can carry, as on the ESP32. Libraries read this to split their data. */
#define I2C_BUFFER_LENGTH 128

class TwoWire : public Print {
 public:
  explicit TwoWire(uint8_t bus) : bus_(bus) {}

  /** Starts the bus as its master. The first bus uses pins 21 (SDA) and 22 (SCL) unless told otherwise. */
  bool begin(int sda = -1, int scl = -1, uint32_t frequency = 0);
  bool end();
  bool setPins(int sda, int scl);
  bool setClock(uint32_t frequency);
  uint32_t getClock() { return frequency_; }
  void setTimeOut(uint16_t milliseconds) { (void)milliseconds; }
  void setTimeout(uint16_t milliseconds) { (void)milliseconds; }

  void beginTransmission(uint8_t address);
  void beginTransmission(int address) { beginTransmission((uint8_t)address); }
  /** Sends what was written. 0: done; 2: nothing answered the address; 3: a byte was refused; 4: other. */
  uint8_t endTransmission(bool sendStop = true);

  size_t requestFrom(uint8_t address, size_t size, bool sendStop);
  uint8_t requestFrom(uint8_t address, uint8_t size, uint8_t sendStop) {
    return (uint8_t)requestFrom(address, (size_t)size, sendStop != 0);
  }
  uint8_t requestFrom(uint8_t address, uint8_t size) {
    return (uint8_t)requestFrom(address, (size_t)size, true);
  }
  uint8_t requestFrom(int address, int size, int sendStop) {
    return (uint8_t)requestFrom((uint8_t)address, (size_t)size, sendStop != 0);
  }
  uint8_t requestFrom(int address, int size) {
    return (uint8_t)requestFrom((uint8_t)address, (size_t)size, true);
  }

  using Print::write;
  size_t write(uint8_t data) override;
  size_t write(const uint8_t* data, size_t size) override;
  size_t write(int data) { return write((uint8_t)data); }
  size_t write(unsigned int data) { return write((uint8_t)data); }
  size_t write(long data) { return write((uint8_t)data); }
  size_t write(unsigned long data) { return write((uint8_t)data); }

  int available();
  int read();
  int peek();

 private:
  void charge(size_t bytes);

  uint8_t bus_;
  int sda_ = -1;
  int scl_ = -1;
  uint32_t frequency_ = 100000;
  bool begun_ = false;
  bool transmitting_ = false;
  /** A write ended without a stop, waiting to be joined to the read that follows. */
  bool pending_ = false;
  uint8_t tx_address_ = 0;
  size_t tx_length_ = 0;
  uint8_t tx_[I2C_BUFFER_LENGTH];
  size_t rx_length_ = 0;
  size_t rx_index_ = 0;
  uint8_t rx_[I2C_BUFFER_LENGTH];
};

extern TwoWire Wire;
extern TwoWire Wire1;
