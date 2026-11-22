// The 1-Wire bus for the lab's board library: see include/OneWire.h.
#include "OneWire.h"

namespace {
// What each step takes on a real bus, from the 1-Wire timing a master uses:
// a reset pulse and the wait for the presence pulse, and one time slot.
const uint64_t RESET_MICROS = 960;
const uint64_t SLOT_MICROS = 70;
enum { RESET = 0, WRITE_BIT = 1, READ_BIT = 2 };
}  // namespace

void OneWire::begin(uint8_t pin) {
  pin_ = pin;
  // At rest the master releases the line; the pull-up holds it HIGH.
  pinMode(pin, INPUT);
  reset_search();
}

uint8_t OneWire::reset(void) {
  if (pin_ < 0) return 0;
  uint8_t present = host_onewire(pin_, RESET, 0) ? 1 : 0;
  host_delay_micros(RESET_MICROS);
  return present;
}

void OneWire::write_bit(uint8_t value) {
  if (pin_ < 0) return;
  host_onewire(pin_, WRITE_BIT, value & 1);
  host_delay_micros(SLOT_MICROS);
}

uint8_t OneWire::read_bit(void) {
  if (pin_ < 0) return 1;
  uint8_t bit = host_onewire(pin_, READ_BIT, 0) ? 1 : 0;
  host_delay_micros(SLOT_MICROS);
  return bit;
}

void OneWire::write(uint8_t value, uint8_t power) {
  (void)power;
  for (int i = 0; i < 8; i++) write_bit((value >> i) & 1);
}

void OneWire::write_bytes(const uint8_t* buffer, uint16_t count, bool power) {
  for (uint16_t i = 0; i < count; i++) write(buffer[i], power);
}

uint8_t OneWire::read(void) {
  uint8_t value = 0;
  for (int i = 0; i < 8; i++) value |= read_bit() << i;
  return value;
}

void OneWire::read_bytes(uint8_t* buffer, uint16_t count) {
  for (uint16_t i = 0; i < count; i++) buffer[i] = read();
}

void OneWire::select(const uint8_t rom[8]) {
  write(0x55);
  for (int i = 0; i < 8; i++) write(rom[i]);
}

void OneWire::skip(void) { write(0xCC); }

void OneWire::reset_search() {
  last_discrepancy_ = 0;
  last_family_discrepancy_ = 0;
  last_device_ = false;
  for (int i = 0; i < 8; i++) rom_[i] = 0;
}

void OneWire::target_search(uint8_t family_code) {
  reset_search();
  rom_[0] = family_code;
  last_discrepancy_ = 64;
}

// The search follows Maxim's published algorithm (application note 187): each
// device sends a bit of its code and its complement, and the master chooses
// which branch to follow, remembering where it last chose 0 at a fork.
bool OneWire::search(uint8_t* address, bool search_mode) {
  if (last_device_) {
    reset_search();
    return false;
  }
  if (!reset()) {
    reset_search();
    return false;
  }
  write(search_mode ? 0xF0 : 0xEC);
  int last_zero = 0;
  for (int bit = 1; bit <= 64; bit++) {
    int byte = (bit - 1) / 8;
    uint8_t mask = 1 << ((bit - 1) % 8);
    uint8_t id = read_bit();
    uint8_t complement = read_bit();
    if (id && complement) {
      // No device answered.
      reset_search();
      return false;
    }
    uint8_t direction;
    if (id != complement) {
      // Every device still in the search has the same bit here.
      direction = id;
    } else {
      // A fork: devices differ. Take the branch the last search left for now.
      direction = bit < last_discrepancy_ ? ((rom_[byte] & mask) ? 1 : 0)
                                          : (bit == last_discrepancy_ ? 1 : 0);
      if (direction == 0) {
        last_zero = bit;
        if (last_zero < 9) last_family_discrepancy_ = last_zero;
      }
    }
    if (direction) rom_[byte] |= mask;
    else rom_[byte] &= ~mask;
    write_bit(direction);
  }
  last_discrepancy_ = last_zero;
  if (last_discrepancy_ == 0) last_device_ = true;
  if (rom_[0] == 0) {
    reset_search();
    return false;
  }
  for (int i = 0; i < 8; i++) address[i] = rom_[i];
  return true;
}

uint8_t OneWire::crc8(const uint8_t* data, uint8_t length) {
  uint8_t crc = 0;
  while (length--) {
    uint8_t byte = *data++;
    for (int i = 0; i < 8; i++) {
      uint8_t mix = (crc ^ byte) & 0x01;
      crc >>= 1;
      if (mix) crc ^= 0x8C;  // X^8 + X^5 + X^4 + 1, reflected
      byte >>= 1;
    }
  }
  return crc;
}

uint16_t OneWire::crc16(const uint8_t* input, uint16_t length, uint16_t crc) {
  // CRC-16/ARC (X^16 + X^15 + X^2 + 1, reflected), as 1-Wire devices with 16-bit CRCs use.
  for (uint16_t i = 0; i < length; i++) {
    crc ^= input[i];
    for (int bit = 0; bit < 8; bit++) crc = (crc & 1) ? (crc >> 1) ^ 0xA001 : crc >> 1;
  }
  return crc;
}

bool OneWire::check_crc16(const uint8_t* input, uint16_t length, const uint8_t* inverted_crc,
                          uint16_t crc) {
  crc = ~crc16(input, length, crc);
  return (crc & 0xFF) == inverted_crc[0] && (crc >> 8) == inverted_crc[1];
}
