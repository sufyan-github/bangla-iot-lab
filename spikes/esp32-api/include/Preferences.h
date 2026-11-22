// The Preferences library ("saved settings"), for the lab's board library.
//
// Written for this project from the documented interface and behaviour of the
// ESP32's Preferences library; it contains none of that library's code. Values
// are kept by namespace and key, each with its type, as the chip's NVS keeps
// them in flash, so they survive the board being switched off and a new
// program being uploaded. In the lab they are kept with the project.
//
// Modelled: namespaces and keys of up to 15 characters; whole numbers of 8 to
// 64 bits, strings (up to 4000 bytes) and byte blocks; a value read as the
// wrong type gives the default; read-only use. As the real library does,
// putBool stores one byte, and putFloat and putDouble store byte blocks.
// Not modelled: the time a write takes, flash wear, and running out of space
// (freeEntries is an estimate).
#pragma once
#include <Arduino.h>

typedef enum {
  PT_I8,
  PT_U8,
  PT_I16,
  PT_U16,
  PT_I32,
  PT_U32,
  PT_I64,
  PT_U64,
  PT_STR,
  PT_BLOB,
  PT_INVALID
} PreferenceType;

class Preferences {
 public:
  bool begin(const char* name, bool readOnly = false, const char* partition_label = nullptr);
  void end();
  bool clear();
  bool remove(const char* key);

  size_t putChar(const char* key, int8_t value) { return putNumber(key, PT_I8, &value, 1); }
  size_t putUChar(const char* key, uint8_t value) { return putNumber(key, PT_U8, &value, 1); }
  size_t putShort(const char* key, int16_t value) { return putNumber(key, PT_I16, &value, 2); }
  size_t putUShort(const char* key, uint16_t value) { return putNumber(key, PT_U16, &value, 2); }
  size_t putInt(const char* key, int32_t value) { return putNumber(key, PT_I32, &value, 4); }
  size_t putUInt(const char* key, uint32_t value) { return putNumber(key, PT_U32, &value, 4); }
  size_t putLong(const char* key, int32_t value) { return putNumber(key, PT_I32, &value, 4); }
  size_t putULong(const char* key, uint32_t value) { return putNumber(key, PT_U32, &value, 4); }
  size_t putLong64(const char* key, int64_t value) { return putNumber(key, PT_I64, &value, 8); }
  size_t putULong64(const char* key, uint64_t value) { return putNumber(key, PT_U64, &value, 8); }
  size_t putFloat(const char* key, float value) { return putBytes(key, &value, sizeof value); }
  size_t putDouble(const char* key, double value) { return putBytes(key, &value, sizeof value); }
  size_t putBool(const char* key, bool value) { return putUChar(key, value ? 1 : 0); }
  size_t putString(const char* key, const char* value);
  size_t putString(const char* key, const String& value) { return putString(key, value.c_str()); }
  size_t putBytes(const char* key, const void* value, size_t length);

  int8_t getChar(const char* key, int8_t fallback = 0) { return getNumber<int8_t>(key, PT_I8, fallback); }
  uint8_t getUChar(const char* key, uint8_t fallback = 0) { return getNumber<uint8_t>(key, PT_U8, fallback); }
  int16_t getShort(const char* key, int16_t fallback = 0) { return getNumber<int16_t>(key, PT_I16, fallback); }
  uint16_t getUShort(const char* key, uint16_t fallback = 0) {
    return getNumber<uint16_t>(key, PT_U16, fallback);
  }
  int32_t getInt(const char* key, int32_t fallback = 0) { return getNumber<int32_t>(key, PT_I32, fallback); }
  uint32_t getUInt(const char* key, uint32_t fallback = 0) {
    return getNumber<uint32_t>(key, PT_U32, fallback);
  }
  int32_t getLong(const char* key, int32_t fallback = 0) { return getNumber<int32_t>(key, PT_I32, fallback); }
  uint32_t getULong(const char* key, uint32_t fallback = 0) {
    return getNumber<uint32_t>(key, PT_U32, fallback);
  }
  int64_t getLong64(const char* key, int64_t fallback = 0) {
    return getNumber<int64_t>(key, PT_I64, fallback);
  }
  uint64_t getULong64(const char* key, uint64_t fallback = 0) {
    return getNumber<uint64_t>(key, PT_U64, fallback);
  }
  float getFloat(const char* key, float fallback = NAN) { return getBlob<float>(key, fallback); }
  double getDouble(const char* key, double fallback = NAN) { return getBlob<double>(key, fallback); }
  bool getBool(const char* key, bool fallback = false) { return getUChar(key, fallback ? 1 : 0) != 0; }
  String getString(const char* key, String fallback = String());
  size_t getString(const char* key, char* value, size_t maxLength);
  size_t getBytesLength(const char* key);
  size_t getBytes(const char* key, void* buffer, size_t maxLength);

  bool isKey(const char* key);
  PreferenceType getType(const char* key);
  size_t freeEntries();

 private:
  size_t putNumber(const char* key, PreferenceType type, const void* bytes, size_t length);
  /** The stored bytes of a key if it has this type, or null. */
  const std::string* find(const char* key, PreferenceType type);
  template <typename T>
  T getNumber(const char* key, PreferenceType type, T fallback) {
    const std::string* bytes = find(key, type);
    if (!bytes || bytes->size() != sizeof(T)) return fallback;
    T value;
    memcpy(&value, bytes->data(), sizeof value);
    return value;
  }
  template <typename T>
  T getBlob(const char* key, T fallback) {
    const std::string* bytes = find(key, PT_BLOB);
    if (!bytes || bytes->size() != sizeof(T)) return fallback;
    T value;
    memcpy(&value, bytes->data(), sizeof value);
    return value;
  }

  std::string namespace_;
  bool started_ = false;
  bool readOnly_ = false;
};
