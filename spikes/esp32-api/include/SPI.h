// The SPI bus, for the lab's board library.
//
// Whole exchanges are handed to the world (host_spi_transfer): the bytes going
// out on the data-out pin and the ones coming back. Which device takes part is
// decided there, from the chip-select pin's level at that moment, as on the
// wires. The clock edges themselves are not produced; the time the bytes would
// take at the bus's frequency is charged here.
//
// Not modelled: the data mode (clock polarity and phase) a device needs, and
// the chip's own hardware chip-select (setHwCs). A program that drives its
// chip-select pin with digitalWrite, as display libraries do, works as on the
// board.
#pragma once
#include <Arduino.h>

#define SPI_HAS_TRANSACTION

// Libraries that drive SPI pins by hand (Adafruit's BusIO among them) write the
// pins' output registers directly, as they may on a real ESP32. Here those
// writes land in a register that nothing reads: a device on such pins hears
// nothing.
inline volatile uint32_t spi_unmodelled_register = 0;
#define digitalPinToPort(pin) (0)
#define digitalPinToBitMask(pin) (1UL << ((pin) & 31))
#define portOutputRegister(port) (&spi_unmodelled_register)
#define portInputRegister(port) (&spi_unmodelled_register)
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
  SPISettings() : clock_(1000000), bitOrder_(SPI_MSBFIRST), dataMode_(SPI_MODE0) {}
  SPISettings(uint32_t clock, uint8_t bitOrder, uint8_t dataMode)
      : clock_(clock), bitOrder_(bitOrder), dataMode_(dataMode) {}
  uint32_t clock_;
  uint8_t bitOrder_;
  uint8_t dataMode_;
};

class SPIClass {
 public:
  explicit SPIClass(uint8_t bus = VSPI);
  /** Pins left at -1 are the bus's own: SCK 18, MISO 19, MOSI 23, SS 5 for VSPI. */
  bool begin(int8_t sck = -1, int8_t miso = -1, int8_t mosi = -1, int8_t ss = -1);
  void end();
  void setHwCs(bool use) { (void)use; }
  void setBitOrder(uint8_t bitOrder) { bitOrder_ = bitOrder; }
  void setDataMode(uint8_t dataMode) { dataMode_ = dataMode; }
  void setFrequency(uint32_t frequency) {
    if (frequency) frequency_ = frequency;
  }
  void setClockDivider(uint32_t divider);
  uint32_t getClockDivider();
  void beginTransaction(SPISettings settings);
  void endTransaction() {}

  uint8_t transfer(uint8_t data);
  uint16_t transfer16(uint16_t data);
  uint32_t transfer32(uint32_t data);
  void transfer(void* data, uint32_t size);
  void transferBytes(const uint8_t* data, uint8_t* out, uint32_t size);
  void transferBits(uint32_t data, uint32_t* out, uint8_t bits);

  void write(uint8_t data);
  void write16(uint16_t data);
  void write32(uint32_t data);
  void writeBytes(const uint8_t* data, uint32_t size);
  /** 16-bit pixels from memory, each sent high byte first. */
  void writePixels(const void* data, uint32_t size);
  void writePattern(const uint8_t* data, uint8_t size, uint32_t repeat);

  int8_t pinSS() { return ss_; }

 private:
  /** Sends `size` bytes (in place, replaced by what came back) and charges their time. */
  void exchange(uint8_t* data, uint32_t size);

  uint8_t bus_;
  int8_t sck_ = -1, miso_ = -1, mosi_ = -1, ss_ = -1;
  bool begun_ = false;
  uint32_t frequency_ = 1000000;
  uint8_t bitOrder_ = SPI_MSBFIRST;
  uint8_t dataMode_ = SPI_MODE0;
  /** Bus time owed, in picoseconds, until it adds up to a whole microsecond. */
  uint64_t owedPs_ = 0;
};

extern SPIClass SPI;
