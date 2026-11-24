// Bluetooth Low Energy for the lab's board library, written for this project
// from the documented API of the ESP32 Arduino core's BLE library (core 3.x).
// The board is a GATT server; the lab's phone panel is the only client. It
// finds the board by the name it advertises, reads and writes its
// characteristics, and receives its notifications. Callbacks run when the
// program waits (delay) or between turns of loop(), as the radio task would
// interrupt it on a real board. Not modelled: scanning for other devices, the
// board as a client, security and bonding, and more than one phone.
#pragma once
#include <Arduino.h>

#include <vector>

class BLEServer;
class BLEService;
class BLECharacteristic;
class BLEAdvertising;

/** A 128-bit UUID written as text ("4fafc201-…"), or a 16-bit one (0x180F). */
class BLEUUID {
 public:
  BLEUUID() {}
  BLEUUID(const char* text) : text_(text ? text : "") {}
  BLEUUID(const String& text) : text_(text) {}
  BLEUUID(uint16_t short_uuid);
  String toString() const { return text_; }
  bool equals(const BLEUUID& other) const;

 private:
  String text_;
};

class BLEDescriptor {
 public:
  BLEDescriptor() {}
  explicit BLEDescriptor(const char*, uint16_t = 100) {}
  explicit BLEDescriptor(BLEUUID, uint16_t = 100) {}
  virtual ~BLEDescriptor() {}
  void setValue(const uint8_t*, size_t) {}
  void setValue(const String&) {}
};

/** The descriptor phones use to turn notifications on; the lab's phone turns them on itself. */
class BLE2902 : public BLEDescriptor {
 public:
  BLE2902() {}
  void setNotifications(bool) {}
  void setIndications(bool) {}
};

class BLECharacteristicCallbacks {
 public:
  virtual ~BLECharacteristicCallbacks() {}
  virtual void onRead(BLECharacteristic*) {}
  virtual void onWrite(BLECharacteristic*) {}
};

class BLECharacteristic {
 public:
  static const uint32_t PROPERTY_READ = 1 << 0;
  static const uint32_t PROPERTY_WRITE = 1 << 1;
  static const uint32_t PROPERTY_NOTIFY = 1 << 2;
  static const uint32_t PROPERTY_BROADCAST = 1 << 3;
  static const uint32_t PROPERTY_INDICATE = 1 << 4;
  static const uint32_t PROPERTY_WRITE_NR = 1 << 5;

  BLECharacteristic(const BLEUUID& uuid, uint32_t properties = 0)
      : uuid_(uuid), properties_(properties) {}

  void setValue(const uint8_t* data, size_t size);
  void setValue(const String& value);
  void setValue(const char* value) { setValue(String(value)); }
  void setValue(uint16_t value) { setBytes(&value, sizeof value); }
  void setValue(uint32_t value) { setBytes(&value, sizeof value); }
  void setValue(int value) { setBytes(&value, sizeof value); }
  void setValue(float value) { setBytes(&value, sizeof value); }
  void setValue(double value) { setBytes(&value, sizeof value); }
  String getValue() const { return value_; }
  uint8_t* getData() { return reinterpret_cast<uint8_t*>(&value_[0]); }
  size_t getLength() const { return value_.length(); }
  BLEUUID getUUID() const { return uuid_; }
  uint32_t getProperties() const { return properties_; }

  void notify(bool = true);
  void indicate() { notify(); }
  void setCallbacks(BLECharacteristicCallbacks* callbacks) { callbacks_ = callbacks; }
  void addDescriptor(BLEDescriptor*) {}

 private:
  friend class BLEService;
  friend class BLEDevice;
  void setBytes(const void* data, size_t size) {
    setValue(reinterpret_cast<const uint8_t*>(data), size);
  }
  BLEUUID uuid_;
  uint32_t properties_;
  String value_;
  int handle_ = -1;
  BLECharacteristicCallbacks* callbacks_ = nullptr;
};

class BLEService {
 public:
  explicit BLEService(const BLEUUID& uuid) : uuid_(uuid) {}
  BLECharacteristic* createCharacteristic(const char* uuid, uint32_t properties) {
    return createCharacteristic(BLEUUID(uuid), properties);
  }
  BLECharacteristic* createCharacteristic(BLEUUID uuid, uint32_t properties);
  BLECharacteristic* getCharacteristic(const char* uuid);
  BLEUUID getUUID() const { return uuid_; }
  void start() {}
  void stop() {}

 private:
  friend class BLEDevice;
  BLEUUID uuid_;
  std::vector<BLECharacteristic*> characteristics_;
};

class BLEServerCallbacks {
 public:
  virtual ~BLEServerCallbacks() {}
  virtual void onConnect(BLEServer*) {}
  virtual void onDisconnect(BLEServer*) {}
};

class BLEServer {
 public:
  BLEService* createService(const char* uuid) { return createService(BLEUUID(uuid)); }
  BLEService* createService(BLEUUID uuid);
  BLEService* getServiceByUUID(const char* uuid);
  void setCallbacks(BLEServerCallbacks* callbacks) { callbacks_ = callbacks; }
  uint32_t getConnectedCount() const { return connected_; }
  BLEAdvertising* getAdvertising();
  void startAdvertising();
  void disconnect(uint16_t);

 private:
  friend class BLEDevice;
  std::vector<BLEService*> services_;
  BLEServerCallbacks* callbacks_ = nullptr;
  uint32_t connected_ = 0;
};

class BLEAdvertising {
 public:
  void addServiceUUID(const char*) {}
  void addServiceUUID(BLEUUID) {}
  void setScanResponse(bool) {}
  void setMinPreferred(uint16_t) {}
  void setMaxPreferred(uint16_t) {}
  void setMinInterval(uint16_t) {}
  void setMaxInterval(uint16_t) {}
  void start();
  void stop();
};

class BLEDevice {
 public:
  static void init(const String& name);
  static void deinit(bool = false);
  static BLEServer* createServer();
  static BLEAdvertising* getAdvertising();
  static void startAdvertising();
  static void stopAdvertising();
  static String getDeviceName() { return name_; }
  static void setPower(int) {}
  static void setMTU(uint16_t) {}
  /** Delivers what the phone did since the last time: connects, disconnects and writes. */
  static void poll();

 private:
  friend class BLEService;
  friend class BLECharacteristic;
  static String name_;
  static BLEServer* server_;
  static std::vector<BLECharacteristic*> handles_;
};
