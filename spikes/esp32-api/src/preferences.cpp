// Saved settings for the lab's board library: see include/Preferences.h.
#include "Preferences.h"

#include <vector>

namespace {

/** One stored value. Kept in a list in the order written, like the flash pages. */
struct Entry {
  std::string space;
  std::string key;
  PreferenceType type;
  std::string bytes;
};

/** Made on first use, so that a sketch without Preferences carries none of it. */
std::vector<Entry>& stored() {
  static std::vector<Entry> list;
  return list;
}
bool loaded = false;

// Kept as text, one value a line: namespace, key, type and the bytes in hex,
// separated by the unit separator character. The lab keeps this text with the project.
const char SEPARATOR = '\x1f';
const char* const TYPE_NAMES[] = {"i8", "u8", "i16", "u16", "i32", "u32", "i64", "u64", "str", "blob"};

/** Keys and namespaces longer than this are refused, as by the chip's NVS. */
const size_t MAX_NAME = 15;
/** A string may be at most this long, its ending zero included, as in NVS. */
const size_t MAX_STRING = 4000;
const size_t MAX_BLOB = 508000;
/** ESTIMATE: about what the default 20 kB NVS partition holds of small values. */
const size_t ENTRY_LIMIT = 500;

int hexDigit(char c) {
  if (c >= '0' && c <= '9') return c - '0';
  if (c >= 'a' && c <= 'f') return c - 'a' + 10;
  return -1;
}

void load() {
  if (loaded) return;
  loaded = true;
  size_t length = host_settings_load(nullptr, 0);
  if (length == 0) return;
  std::string text(length, '\0');
  host_settings_load(&text[0], length);
  size_t at = 0;
  while (at < text.size()) {
    size_t end = text.find('\n', at);
    if (end == std::string::npos) end = text.size();
    std::string line = text.substr(at, end - at);
    at = end + 1;
    size_t a = line.find(SEPARATOR);
    size_t b = a == std::string::npos ? a : line.find(SEPARATOR, a + 1);
    size_t c = b == std::string::npos ? b : line.find(SEPARATOR, b + 1);
    if (c == std::string::npos) continue;
    Entry entry;
    entry.space = line.substr(0, a);
    entry.key = line.substr(a + 1, b - a - 1);
    std::string type = line.substr(b + 1, c - b - 1);
    entry.type = PT_INVALID;
    for (int t = 0; t < PT_INVALID; t++) {
      if (type == TYPE_NAMES[t]) entry.type = (PreferenceType)t;
    }
    std::string hex = line.substr(c + 1);
    if (entry.type == PT_INVALID || hex.size() % 2 != 0) continue;
    bool good = true;
    for (size_t i = 0; i < hex.size(); i += 2) {
      int high = hexDigit(hex[i]);
      int low = hexDigit(hex[i + 1]);
      if (high < 0 || low < 0) good = false;
      entry.bytes.push_back((char)((high << 4) | low));
    }
    if (good) stored().push_back(entry);
  }
}

void save() {
  static const char digits[] = "0123456789abcdef";
  std::string text;
  for (const Entry& entry : stored()) {
    text += entry.space;
    text += SEPARATOR;
    text += entry.key;
    text += SEPARATOR;
    text += TYPE_NAMES[entry.type];
    text += SEPARATOR;
    for (unsigned char byte : entry.bytes) {
      text += digits[byte >> 4];
      text += digits[byte & 15];
    }
    text += '\n';
  }
  host_settings_save(text.data(), text.size());
}

bool validName(const char* name) {
  return name && name[0] != '\0' && strlen(name) <= MAX_NAME && !strchr(name, SEPARATOR) &&
         !strchr(name, '\n');
}

}  // namespace

bool Preferences::begin(const char* name, bool readOnly, const char* partition_label) {
  (void)partition_label;
  host_tick();
  if (started_ || !validName(name)) return false;
  load();
  namespace_ = name;
  readOnly_ = readOnly;
  started_ = true;
  return true;
}

void Preferences::end() { started_ = false; }

bool Preferences::clear() {
  host_tick();
  if (!started_ || readOnly_) return false;
  std::vector<Entry> kept;
  for (const Entry& entry : stored()) {
    if (entry.space != namespace_) kept.push_back(entry);
  }
  stored().swap(kept);
  save();
  return true;
}

bool Preferences::remove(const char* key) {
  host_tick();
  if (!started_ || readOnly_ || !validName(key)) return false;
  for (size_t i = 0; i < stored().size(); i++) {
    if (stored()[i].space == namespace_ && stored()[i].key == key) {
      stored().erase(stored().begin() + (long)i);
      save();
      return true;
    }
  }
  return false;
}

size_t Preferences::putNumber(const char* key, PreferenceType type, const void* bytes, size_t length) {
  host_tick();
  if (!started_ || readOnly_ || !validName(key)) return 0;
  std::string value((const char*)bytes, length);
  for (Entry& entry : stored()) {
    if (entry.space == namespace_ && entry.key == key) {
      // A value of another type under the same key takes its place.
      entry.type = type;
      entry.bytes = value;
      save();
      return length;
    }
  }
  if (stored().size() >= ENTRY_LIMIT) return 0;
  stored().push_back({namespace_, key, type, value});
  save();
  return length;
}

size_t Preferences::putString(const char* key, const char* value) {
  if (!value || strlen(value) + 1 > MAX_STRING) return 0;
  return putNumber(key, PT_STR, value, strlen(value));
}

size_t Preferences::putBytes(const char* key, const void* value, size_t length) {
  if (!value || length == 0 || length > MAX_BLOB) return 0;
  return putNumber(key, PT_BLOB, value, length);
}

const std::string* Preferences::find(const char* key, PreferenceType type) {
  host_tick();
  if (!started_ || !validName(key)) return nullptr;
  for (const Entry& entry : stored()) {
    if (entry.space == namespace_ && entry.key == key) {
      return entry.type == type ? &entry.bytes : nullptr;
    }
  }
  return nullptr;
}

String Preferences::getString(const char* key, String fallback) {
  const std::string* bytes = find(key, PT_STR);
  return bytes ? String(bytes->c_str()) : fallback;
}

size_t Preferences::getString(const char* key, char* value, size_t maxLength) {
  const std::string* bytes = find(key, PT_STR);
  // The length counts the ending zero, and the whole string must fit.
  if (!bytes || !value || bytes->size() + 1 > maxLength) return 0;
  memcpy(value, bytes->data(), bytes->size());
  value[bytes->size()] = '\0';
  return bytes->size() + 1;
}

size_t Preferences::getBytesLength(const char* key) {
  const std::string* bytes = find(key, PT_BLOB);
  return bytes ? bytes->size() : 0;
}

size_t Preferences::getBytes(const char* key, void* buffer, size_t maxLength) {
  const std::string* bytes = find(key, PT_BLOB);
  if (!bytes || !buffer || bytes->size() > maxLength) return 0;
  memcpy(buffer, bytes->data(), bytes->size());
  return bytes->size();
}

bool Preferences::isKey(const char* key) { return getType(key) != PT_INVALID; }

PreferenceType Preferences::getType(const char* key) {
  host_tick();
  if (!started_ || !validName(key)) return PT_INVALID;
  for (const Entry& entry : stored()) {
    if (entry.space == namespace_ && entry.key == key) return entry.type;
  }
  return PT_INVALID;
}

size_t Preferences::freeEntries() {
  load();
  return stored().size() >= ENTRY_LIMIT ? 0 : ENTRY_LIMIT - stored().size();
}
