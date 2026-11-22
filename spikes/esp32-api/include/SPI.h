// The SPI bus, for the lab's board library: NOT MODELLED.
//
// The lab has no SPI parts yet. This header exists so that libraries which can
// use either I2C or SPI (a display library, for instance) compile. Every
// transfer goes nowhere and reads back zeros.
#pragma once
#include <Arduino.h>

#define SPI_HAS_TRANSACTION
#define SPI_LSBFIRST 0
#define SPI_MSBFIRST 1
#define SPI_MODE0 0
#define SPI_MODE1 1
#define SPI_MODE2 2
#define SPI_MODE3 3
#define FSPI 0
#define HSPI 1
#define VSPI 3

class SPISettings {
 public:
  SPISettings() {}
  SPISettings(uint32_t clock, uint8_t bitOrder, uint8_t dataMode) {
    (void)clock, (void)bitOrder, (void)dataMode;
  }
};

class SPIClass {
 public:
  explicit SPIClass(uint8_t bus = VSPI) { (void)bus; }
  bool begin(int8_t sck = -1, int8_t miso = -1, int8_t mosi = -1, int8_t ss = -1) {
    (void)sck, (void)miso, (void)mosi, (void)ss;
    return true;
  }
  void end() {}
  void setBitOrder(uint8_t bitOrder) { (void)bitOrder; }
  void setDataMode(uint8_t dataMode) { (void)dataMode; }
  void setFrequency(uint32_t frequency) { (void)frequency; }
  void setClockDivider(uint32_t divider) { (void)divider; }
  void beginTransaction(SPISettings settings) { (void)settings; }
  void endTransaction() {}
  uint8_t transfer(uint8_t data) {
    (void)data;
    host_tick();
    return 0;
  }
  uint16_t transfer16(uint16_t data) {
    (void)data;
    host_tick();
    return 0;
  }
  void transfer(void* data, uint32_t size) {
    memset(data, 0, size);
    host_tick();
  }
  void transferBytes(const uint8_t* data, uint8_t* out, uint32_t size) {
    (void)data;
    if (out) memset(out, 0, size);
    host_tick();
  }
  void writeBytes(const uint8_t* data, uint32_t size) {
    (void)data, (void)size;
    host_tick();
  }
};

inline SPIClass SPI;
