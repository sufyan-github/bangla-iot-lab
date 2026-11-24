// MQTT for the lab's board library, written for this project from the
// documented API of Nick O'Leary's PubSubClient library. There is no real
// network: the client talks to the lab's own made-up broker, shared by every
// board in the circuit and the lab's dashboard panel.
#pragma once
#include <WiFi.h>

#include <functional>
#include <string>

#define MQTT_CONNECTION_TIMEOUT -4
#define MQTT_CONNECTION_LOST -3
#define MQTT_CONNECT_FAILED -2
#define MQTT_DISCONNECTED -1
#define MQTT_CONNECTED 0

class PubSubClient {
 public:
  typedef std::function<void(char*, uint8_t*, unsigned int)> Callback;

  PubSubClient() {}
  explicit PubSubClient(WiFiClient&) {}
  PubSubClient& setClient(WiFiClient&) { return *this; }
  PubSubClient& setServer(const char* domain, uint16_t port) {
    server_ = domain ? domain : "";
    port_ = port;
    return *this;
  }
  PubSubClient& setServer(IPAddress ip, uint16_t port) {
    server_ = ip.toString().c_str();
    port_ = port;
    return *this;
  }
  PubSubClient& setCallback(Callback callback) {
    callback_ = callback;
    return *this;
  }
  bool setBufferSize(uint16_t) { return true; }
  PubSubClient& setKeepAlive(uint16_t) { return *this; }

  bool connect(const char* id);
  bool connect(const char* id, const char* /* user */, const char* /* pass */) { return connect(id); }
  void disconnect();
  bool connected();
  int state() { return state_; }

  bool publish(const char* topic, const char* payload) { return publish(topic, payload, false); }
  bool publish(const char* topic, const char* payload, bool retained);
  bool publish(const char* topic, const uint8_t* payload, unsigned int length, bool retained = false);
  bool subscribe(const char* filter, uint8_t /* qos */ = 0);
  bool unsubscribe(const char* filter);
  /** Hands each message waiting for this board to the callback. Call it often, in loop(). */
  bool loop();

 private:
  std::string server_;
  uint16_t port_ = 1883;
  int state_ = MQTT_DISCONNECTED;
  Callback callback_;
};
