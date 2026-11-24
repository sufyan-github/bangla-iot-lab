// Wi-Fi for the lab's board library, written for this project from the Arduino
// ESP32 core's documented API. There is no real network: the lab's model joins
// any network after a moment and gives the board an address on it, so that the
// board's own web server can be reached from the lab's browser panel.
#pragma once
#include <Arduino.h>

typedef enum {
  WL_IDLE_STATUS = 0,
  WL_NO_SSID_AVAIL = 1,
  WL_SCAN_COMPLETED = 2,
  WL_CONNECTED = 3,
  WL_CONNECT_FAILED = 4,
  WL_CONNECTION_LOST = 5,
  WL_DISCONNECTED = 6,
  WL_NO_SHIELD = 255,
} wl_status_t;

typedef enum { WIFI_OFF = 0, WIFI_STA = 1, WIFI_AP = 2, WIFI_AP_STA = 3 } wifi_mode_t;

class IPAddress {
 public:
  IPAddress() : address_(0) {}
  IPAddress(uint8_t a, uint8_t b, uint8_t c, uint8_t d)
      : address_(a | (b << 8) | (c << 16) | (static_cast<uint32_t>(d) << 24)) {}
  explicit IPAddress(uint32_t address) : address_(address) {}
  uint8_t operator[](int index) const { return (address_ >> (8 * index)) & 0xff; }
  bool operator==(const IPAddress& other) const { return address_ == other.address_; }
  String toString() const;
  operator String() const { return toString(); }

 private:
  uint32_t address_;
};

class WiFiClass {
 public:
  wl_status_t begin(const char* ssid, const char* password = nullptr);
  wl_status_t begin(const String& ssid, const String& password = String()) {
    return begin(ssid.c_str(), password.c_str());
  }
  wl_status_t status();
  bool isConnected() { return status() == WL_CONNECTED; }
  IPAddress localIP();
  bool softAP(const char* ssid, const char* password = nullptr, int channel = 1, int hidden = 0,
              int max_connection = 4);
  bool softAP(const String& ssid, const String& password = String()) {
    return softAP(ssid.c_str(), password.c_str());
  }
  IPAddress softAPIP();
  bool mode(wifi_mode_t mode);
  wifi_mode_t getMode() { return mode_; }
  bool disconnect(bool wifi_off = false);
  String SSID() { return ssid_; }
  String macAddress() { return "24:6F:28:12:34:56"; }
  /** ESTIMATE: a good signal in a classroom. */
  int32_t RSSI() { return isConnected() ? -55 : 0; }
  bool setSleep(bool) { return true; }
  bool setHostname(const char*) { return true; }

 private:
  wifi_mode_t mode_ = WIFI_OFF;
  String ssid_;
};

extern WiFiClass WiFi;

/**
 * A network connection, as libraries such as PubSubClient take one. The lab
 * has no real sockets: the libraries it offers talk to the lab's own services
 * instead, so this only stands in for the object a program makes.
 */
class WiFiClient {
 public:
  bool connected() { return WiFi.isConnected(); }
};
