// Bluetooth Low Energy for the lab's board library: see include/BLEDevice.h. Written for this project.
#include "BLEDevice.h"

#include <stdio.h>
#include <string.h>

String BLEDevice::name_;
BLEServer* BLEDevice::server_ = nullptr;
std::vector<BLECharacteristic*> BLEDevice::handles_;

namespace {
BLEAdvertising advertising;
}

BLEUUID::BLEUUID(uint16_t short_uuid) {
  char text[8];
  snprintf(text, sizeof text, "%04x", short_uuid);
  text_ = text;
}

bool BLEUUID::equals(const BLEUUID& other) const {
  String a = text_;
  String b = other.text_;
  a.toLowerCase();
  b.toLowerCase();
  return a == b;
}

void BLECharacteristic::setValue(const uint8_t* data, size_t size) {
  value_ = String(std::string(reinterpret_cast<const char*>(data), data ? size : 0));
  if (handle_ >= 0) host_ble_set(handle_, data, data ? size : 0);
}

void BLECharacteristic::setValue(const String& value) {
  setValue(reinterpret_cast<const uint8_t*>(value.c_str()), value.length());
}

void BLECharacteristic::notify(bool) {
  host_tick();
  if (handle_ >= 0) host_ble_notify(handle_);
}

BLECharacteristic* BLEService::createCharacteristic(BLEUUID uuid, uint32_t properties) {
  BLECharacteristic* characteristic = new BLECharacteristic(uuid, properties);
  String service = uuid_.toString();
  String id = uuid.toString();
  characteristic->handle_ =
      host_ble_add(service.c_str(), service.length(), id.c_str(), id.length(), properties);
  if (characteristic->handle_ >= 0) {
    if (BLEDevice::handles_.size() <= (size_t)characteristic->handle_)
      BLEDevice::handles_.resize(characteristic->handle_ + 1, nullptr);
    BLEDevice::handles_[characteristic->handle_] = characteristic;
  }
  characteristics_.push_back(characteristic);
  return characteristic;
}

BLECharacteristic* BLEService::getCharacteristic(const char* uuid) {
  for (BLECharacteristic* characteristic : characteristics_)
    if (characteristic->getUUID().equals(BLEUUID(uuid))) return characteristic;
  return nullptr;
}

BLEService* BLEServer::createService(BLEUUID uuid) {
  BLEService* service = new BLEService(uuid);
  services_.push_back(service);
  return service;
}

BLEService* BLEServer::getServiceByUUID(const char* uuid) {
  for (BLEService* service : services_)
    if (service->getUUID().equals(BLEUUID(uuid))) return service;
  return nullptr;
}

BLEAdvertising* BLEServer::getAdvertising() { return &advertising; }
void BLEServer::startAdvertising() { advertising.start(); }
void BLEServer::disconnect(uint16_t) {
  // The lab's phone stays until it leaves; a real board would drop it here.
}

void BLEAdvertising::start() { host_ble_advertise(1); }
void BLEAdvertising::stop() { host_ble_advertise(0); }

void BLEDevice::init(const String& name) {
  name_ = name;
  host_ble_begin(name.c_str(), name.length());
  lab_poll_hook = &BLEDevice::poll;
}

void BLEDevice::deinit(bool) {
  host_ble_advertise(0);
  lab_poll_hook = nullptr;
}

BLEServer* BLEDevice::createServer() {
  if (!server_) server_ = new BLEServer();
  return server_;
}

BLEAdvertising* BLEDevice::getAdvertising() { return &advertising; }
void BLEDevice::startAdvertising() { advertising.start(); }
void BLEDevice::stopAdvertising() { advertising.stop(); }

void BLEDevice::poll() {
  for (;;) {
    size_t length = host_ble_next(nullptr, 0);
    if (length < 2) return;
    std::vector<uint8_t> event(length);
    host_ble_next(event.data(), length);
    uint8_t kind = event[0];
    uint8_t handle = event[1];
    if (kind == 1 || kind == 2) {
      if (!server_) continue;
      if (kind == 1) server_->connected_ = 1;
      else server_->connected_ = 0;
      if (server_->callbacks_) {
        if (kind == 1) server_->callbacks_->onConnect(server_);
        else server_->callbacks_->onDisconnect(server_);
      }
    } else if (kind == 3 && handle < handles_.size() && handles_[handle]) {
      BLECharacteristic* characteristic = handles_[handle];
      characteristic->value_ =
          String(std::string(reinterpret_cast<const char*>(event.data() + 2), length - 2));
      if (characteristic->callbacks_) characteristic->callbacks_->onWrite(characteristic);
    }
  }
}
