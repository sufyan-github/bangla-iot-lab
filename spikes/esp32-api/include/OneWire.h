// The 1-Wire bus, for the lab's board library.
//
// The same functions as the widely used OneWire library for Arduino, so that
// libraries written for it (DallasTemperature, for the DS18B20) build and run
// unchanged. This is the lab's own implementation, not a copy of that library:
// a real one times each bit on the pin, while here each reset and each bit is
// one exchange with the world (see host_onewire), which answers as every device
// on that pin would. The time each takes on a real bus is charged.
#pragma once
#include <Arduino.h>

class OneWire {
 public:
  OneWire() {}
  explicit OneWire(uint8_t pin) { begin(pin); }
  void begin(uint8_t pin);

  /** A reset pulse. Returns 1 when some device answered with a presence pulse. */
  uint8_t reset(void);
  /** Addresses one device by its 64-bit ROM code (Match ROM). */
  void select(const uint8_t rom[8]);
  /** Addresses every device at once (Skip ROM). */
  void skip(void);
  /** Writes a byte, least significant bit first. `power` is accepted: parasite power is not modelled. */
  void write(uint8_t value, uint8_t power = 0);
  void write_bytes(const uint8_t* buffer, uint16_t count, bool power = 0);
  uint8_t read(void);
  void read_bytes(uint8_t* buffer, uint16_t count);
  void write_bit(uint8_t value);
  uint8_t read_bit(void);
  void depower(void) {}

  /** Starts a new search of the bus for devices' ROM codes. */
  void reset_search();
  /** Starts a search that finds only devices of one family. */
  void target_search(uint8_t family_code);
  /**
   * Finds the next device on the bus (Search ROM, or Alarm Search when
   * `search_mode` is false) and puts its ROM code in `address`. Returns false
   * when there are no more.
   */
  bool search(uint8_t* address, bool search_mode = true);

  /** The Dallas/Maxim CRC-8 (X^8 + X^5 + X^4 + 1), as in the devices' ROM codes and scratchpads. */
  static uint8_t crc8(const uint8_t* data, uint8_t length);
  static uint16_t crc16(const uint8_t* input, uint16_t length, uint16_t crc = 0);
  static bool check_crc16(const uint8_t* input, uint16_t length, const uint8_t* inverted_crc,
                          uint16_t crc = 0);

 private:
  int pin_ = -1;
  uint8_t rom_[8] = {0};
  int last_discrepancy_ = 0;
  int last_family_discrepancy_ = 0;
  bool last_device_ = false;
};
