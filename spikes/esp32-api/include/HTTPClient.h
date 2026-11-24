// HTTP requests for the lab's board library, written for this project from the
// documented API of the ESP32 Arduino core's HTTPClient. There is no real
// internet in the lab: requests go to the lab's own made-up services
// (echo.lab, weather.lab, log.lab), and anywhere else finds nobody.
#pragma once
#include <WiFi.h>

#define HTTPC_ERROR_CONNECTION_REFUSED (-1)
#define HTTPC_ERROR_SEND_HEADER_FAILED (-2)
#define HTTPC_ERROR_SEND_PAYLOAD_FAILED (-3)
#define HTTPC_ERROR_NOT_CONNECTED (-4)
#define HTTPC_ERROR_CONNECTION_LOST (-5)
#define HTTPC_ERROR_NO_STREAM (-6)
#define HTTPC_ERROR_NO_HTTP_SERVER (-7)
#define HTTPC_ERROR_TOO_LESS_RAM (-8)
#define HTTPC_ERROR_ENCODING (-9)
#define HTTPC_ERROR_STREAM_WRITE (-10)
#define HTTPC_ERROR_READ_TIMEOUT (-11)

typedef enum {
  HTTP_CODE_OK = 200,
  HTTP_CODE_CREATED = 201,
  HTTP_CODE_NO_CONTENT = 204,
  HTTP_CODE_MOVED_PERMANENTLY = 301,
  HTTP_CODE_FOUND = 302,
  HTTP_CODE_BAD_REQUEST = 400,
  HTTP_CODE_UNAUTHORIZED = 401,
  HTTP_CODE_FORBIDDEN = 403,
  HTTP_CODE_NOT_FOUND = 404,
  HTTP_CODE_METHOD_NOT_ALLOWED = 405,
  HTTP_CODE_INTERNAL_SERVER_ERROR = 500,
} t_http_codes;

class HTTPClient {
 public:
  HTTPClient() {}

  /** Where the next request goes: "http://host/path". False when it is not an http address. */
  bool begin(const String& url);
  bool begin(WiFiClient&, const String& url) { return begin(url); }
  bool begin(const String& host, uint16_t port, const String& uri = "/");
  void end();
  bool connected() { return false; }

  void setTimeout(uint16_t) {}
  void setConnectTimeout(int32_t) {}
  void setReuse(bool) {}
  void setUserAgent(const String&) {}
  /** Headers are accepted; the lab's services do not read them. */
  void addHeader(const String&, const String&, bool = false, bool = true) {}

  int GET() { return sendRequest("GET"); }
  int POST(const String& payload) { return sendRequest("POST", payload); }
  int POST(const uint8_t* payload, size_t size);
  int PUT(const String& payload) { return sendRequest("PUT", payload); }
  int PATCH(const String& payload) { return sendRequest("PATCH", payload); }
  int sendRequest(const char* type, const String& payload = String());

  /** The last answer's body. */
  String getString() { return body_; }
  int getSize() { return static_cast<int>(body_.length()); }

  static String errorToString(int error);

 private:
  String url_;
  String body_;
};
