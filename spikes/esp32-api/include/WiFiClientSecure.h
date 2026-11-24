// A secure (TLS) connection for the lab's board library, written for this
// project from the documented API of the ESP32 Arduino core's WiFiClientSecure.
// The lab has no real network, so there is nothing to encrypt: certificates
// are accepted and kept nowhere. A program written for a real HTTPS service
// runs here against the lab's own made-up services (https://weather.lab/…).
#pragma once
#include <WiFi.h>

class WiFiClientSecure : public WiFiClient {
 public:
  /** Accepts any server without checking its certificate. */
  void setInsecure() {}
  void setCACert(const char*) {}
  void setCertificate(const char*) {}
  void setPrivateKey(const char*) {}
  void setHandshakeTimeout(unsigned long) {}
};
