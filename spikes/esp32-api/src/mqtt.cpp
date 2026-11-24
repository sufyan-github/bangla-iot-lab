// MQTT for the lab's board library: see include/PubSubClient.h. Written for this project.
#include "PubSubClient.h"

#include <string.h>

#include <vector>

bool PubSubClient::connect(const char* id) {
  host_tick();
  state_ = host_mqtt_connect(id ? id : "", id ? strlen(id) : 0);
  return state_ == MQTT_CONNECTED;
}

void PubSubClient::disconnect() {
  host_mqtt_disconnect();
  state_ = MQTT_DISCONNECTED;
}

bool PubSubClient::connected() {
  host_tick();
  if (state_ == MQTT_CONNECTED && !host_mqtt_connected()) state_ = MQTT_CONNECTION_LOST;
  return state_ == MQTT_CONNECTED;
}

bool PubSubClient::publish(const char* topic, const char* payload, bool retained) {
  return publish(topic, reinterpret_cast<const uint8_t*>(payload), payload ? strlen(payload) : 0,
                 retained);
}

bool PubSubClient::publish(const char* topic, const uint8_t* payload, unsigned int length,
                           bool retained) {
  host_tick();
  if (!connected() || !topic) return false;
  return host_mqtt_publish(topic, strlen(topic), payload, length, retained ? 1 : 0) != 0;
}

bool PubSubClient::subscribe(const char* filter, uint8_t) {
  host_tick();
  if (!connected() || !filter) return false;
  return host_mqtt_subscribe(filter, strlen(filter), 1) != 0;
}

bool PubSubClient::unsubscribe(const char* filter) {
  host_tick();
  if (!connected() || !filter) return false;
  return host_mqtt_subscribe(filter, strlen(filter), 0) != 0;
}

bool PubSubClient::loop() {
  if (!connected()) return false;
  for (;;) {
    size_t length = host_mqtt_next(nullptr, 0);
    if (length == 0) break;
    // One more byte, so the payload can be read as text, as many sketches do.
    std::vector<char> message(length + 1, 0);
    host_mqtt_next(message.data(), length);
    size_t split = strlen(message.data());
    if (callback_) {
      callback_(message.data(), reinterpret_cast<uint8_t*>(message.data() + split + 1),
                static_cast<unsigned int>(length - split - 1));
    }
  }
  return true;
}
