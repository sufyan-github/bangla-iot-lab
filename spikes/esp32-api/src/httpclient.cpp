// HTTP requests for the lab's board library: see include/HTTPClient.h. Written for this project.
#include "HTTPClient.h"

#include <string.h>

#include <vector>

/** The time a request takes there and back on the lab's made-up network, microseconds. */
static const uint64_t kRoundTripUs = 40000;

bool HTTPClient::begin(const String& url) {
  const char* text = url.c_str();
  if (strncmp(text, "http://", 7) != 0 && strncmp(text, "https://", 8) != 0) {
    url_ = String();
    return false;
  }
  url_ = url;
  return true;
}

bool HTTPClient::begin(const String& host, uint16_t port, const String& uri) {
  String url = "http://";
  url += host;
  url += ":";
  url += String(static_cast<unsigned int>(port));
  url += uri;
  return begin(url);
}

void HTTPClient::end() {
  url_ = String();
}

int HTTPClient::POST(const uint8_t* payload, size_t size) {
  return sendRequest("POST",
                     String(std::string(reinterpret_cast<const char*>(payload), payload ? size : 0)));
}

int HTTPClient::sendRequest(const char* type, const String& payload) {
  host_tick();
  body_ = String();
  if (url_.isEmpty()) return HTTPC_ERROR_NOT_CONNECTED;
  host_delay_micros(kRoundTripUs);
  int status = host_http_fetch(type, strlen(type), url_.c_str(), url_.length(), payload.c_str(),
                               payload.length());
  if (status <= 0) return status < 0 ? status : HTTPC_ERROR_CONNECTION_REFUSED;
  size_t length = host_http_fetched(nullptr, 0);
  if (length > 0) {
    std::vector<char> bytes(length);
    host_http_fetched(bytes.data(), length);
    body_ = String(std::string(bytes.data(), length));
  }
  return status;
}

String HTTPClient::errorToString(int error) {
  switch (error) {
    case HTTPC_ERROR_CONNECTION_REFUSED:
      return "connection refused: nothing answered at that address";
    case HTTPC_ERROR_NOT_CONNECTED:
      return "not connected: call begin() with an http:// address first";
    case HTTPC_ERROR_CONNECTION_LOST:
      return "connection lost";
    case HTTPC_ERROR_READ_TIMEOUT:
      return "no answer in time";
    default:
      return error < 0 ? String("request failed") : String();
  }
}
