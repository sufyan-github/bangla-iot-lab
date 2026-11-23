// The SPI bus: see include/SPI.h.
#include <SPI.h>

SPIClass SPI(VSPI);

SPIClass::SPIClass(uint8_t bus) : bus_(bus) {}

bool SPIClass::begin(int8_t sck, int8_t miso, int8_t mosi, int8_t ss) {
  // The ESP32's two buses for programs have pins of their own.
  const bool vspi = bus_ != HSPI;
  sck_ = sck >= 0 ? sck : (vspi ? SCK : 14);
  miso_ = miso >= 0 ? miso : (vspi ? MISO : 12);
  mosi_ = mosi >= 0 ? mosi : (vspi ? MOSI : 13);
  ss_ = ss >= 0 ? ss : (vspi ? SS : 15);
  host_pin_mode(sck_, OUTPUT);
  host_pin_mode(mosi_, OUTPUT);
  host_pin_mode(miso_, INPUT);
  begun_ = true;
  host_tick();
  return true;
}

void SPIClass::end() { begun_ = false; }

// On the chip the clock is 80 MHz divided down; a divider's low bits hold the divisor.
void SPIClass::setClockDivider(uint32_t divider) {
  const uint32_t n = (divider & 0x3f) + 1;
  frequency_ = 80000000UL / n;
}
uint32_t SPIClass::getClockDivider() {
  const uint32_t n = frequency_ ? 80000000UL / frequency_ : 1;
  return n > 0 ? n - 1 : 0;
}

void SPIClass::beginTransaction(SPISettings settings) {
  setFrequency(settings.clock_);
  bitOrder_ = settings.bitOrder_;
  dataMode_ = settings.dataMode_;
}

static uint8_t reversed(uint8_t b) {
  b = (uint8_t)((b & 0xF0) >> 4 | (b & 0x0F) << 4);
  b = (uint8_t)((b & 0xCC) >> 2 | (b & 0x33) << 2);
  return (uint8_t)((b & 0xAA) >> 1 | (b & 0x55) << 1);
}

void SPIClass::exchange(uint8_t* data, uint32_t size) {
  if (size == 0) return;
  // The world hears bits most significant first; a bus set to send the least
  // significant first sends each byte backwards.
  const bool lsb = bitOrder_ == SPI_LSBFIRST;
  if (lsb)
    for (uint32_t i = 0; i < size; i++) data[i] = reversed(data[i]);
  if (begun_) {
    host_spi_transfer(sck_, mosi_, miso_, data, data, size);
  } else {
    memset(data, 0, size); // a bus never begun sends nothing and hears nothing
  }
  if (lsb)
    for (uint32_t i = 0; i < size; i++) data[i] = reversed(data[i]);
  // Eight clock periods a byte.
  owedPs_ += (uint64_t)size * 8ULL * 1000000000000ULL / (frequency_ ? frequency_ : 1000000);
  const uint64_t micros = owedPs_ / 1000000ULL;
  if (micros > 0) {
    owedPs_ -= micros * 1000000ULL;
    host_delay_micros(micros);
  } else {
    host_tick();
  }
}

uint8_t SPIClass::transfer(uint8_t data) {
  exchange(&data, 1);
  return data;
}
uint16_t SPIClass::transfer16(uint16_t data) {
  uint8_t bytes[2] = {(uint8_t)(data >> 8), (uint8_t)data};
  if (bitOrder_ == SPI_LSBFIRST) std::swap(bytes[0], bytes[1]);
  exchange(bytes, 2);
  if (bitOrder_ == SPI_LSBFIRST) std::swap(bytes[0], bytes[1]);
  return (uint16_t)(bytes[0] << 8 | bytes[1]);
}
uint32_t SPIClass::transfer32(uint32_t data) {
  uint8_t bytes[4] = {(uint8_t)(data >> 24), (uint8_t)(data >> 16), (uint8_t)(data >> 8),
                      (uint8_t)data};
  if (bitOrder_ == SPI_LSBFIRST) std::reverse(bytes, bytes + 4);
  exchange(bytes, 4);
  if (bitOrder_ == SPI_LSBFIRST) std::reverse(bytes, bytes + 4);
  return (uint32_t)bytes[0] << 24 | (uint32_t)bytes[1] << 16 | (uint32_t)bytes[2] << 8 | bytes[3];
}
void SPIClass::transfer(void* data, uint32_t size) { exchange((uint8_t*)data, size); }
void SPIClass::transferBytes(const uint8_t* data, uint8_t* out, uint32_t size) {
  uint8_t chunk[64];
  for (uint32_t done = 0; done < size;) {
    const uint32_t n = std::min<uint32_t>(sizeof chunk, size - done);
    if (data) memcpy(chunk, data + done, n);
    else memset(chunk, 0xFF, n);
    exchange(chunk, n);
    if (out) memcpy(out + done, chunk, n);
    done += n;
  }
}
void SPIClass::transferBits(uint32_t data, uint32_t* out, uint8_t bits) {
  // Whole bytes are the bus's unit here: the bits are sent in the bytes that hold them.
  const uint8_t count = (uint8_t)((bits + 7) / 8);
  uint8_t bytes[4] = {0};
  for (uint8_t i = 0; i < count && i < 4; i++) bytes[i] = (uint8_t)(data >> (8 * (count - 1 - i)));
  exchange(bytes, count > 4 ? 4 : count);
  uint32_t value = 0;
  for (uint8_t i = 0; i < count && i < 4; i++) value = value << 8 | bytes[i];
  if (out) *out = value;
}

void SPIClass::write(uint8_t data) { transfer(data); }
void SPIClass::write16(uint16_t data) { transfer16(data); }
void SPIClass::write32(uint32_t data) { transfer32(data); }
void SPIClass::writeBytes(const uint8_t* data, uint32_t size) { transferBytes(data, nullptr, size); }
void SPIClass::writePixels(const void* data, uint32_t size) {
  const uint8_t* bytes = (const uint8_t*)data;
  uint8_t chunk[64];
  for (uint32_t done = 0; done + 1 < size;) {
    const uint32_t n = std::min<uint32_t>(sizeof chunk, (size - done) & ~1U);
    // A pixel sits in memory low byte first; it goes out high byte first.
    for (uint32_t i = 0; i < n; i += 2) {
      chunk[i] = bytes[done + i + 1];
      chunk[i + 1] = bytes[done + i];
    }
    exchange(chunk, n);
    done += n;
  }
}
void SPIClass::writePattern(const uint8_t* data, uint8_t size, uint32_t repeat) {
  for (uint32_t r = 0; r < repeat; r++) writeBytes(data, size);
}
