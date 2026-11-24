// The board's own web server, written for this project from the Arduino ESP32
// core's documented WebServer API. Requests come from the lab's browser panel,
// one at a time; handleClient() answers the oldest one waiting.
#pragma once
#include <WiFi.h>

#include <functional>
#include <vector>

enum HTTPMethod {
  HTTP_ANY,
  HTTP_GET,
  HTTP_HEAD,
  HTTP_POST,
  HTTP_PUT,
  HTTP_PATCH,
  HTTP_DELETE,
  HTTP_OPTIONS,
};

class WebServer {
 public:
  typedef std::function<void(void)> THandlerFunction;

  explicit WebServer(int port = 80) : port_(port) {}
  void begin();
  void begin(uint16_t port) {
    port_ = port;
    begin();
  }
  void close() { listening_ = false; }
  void stop() { close(); }
  void on(const String& uri, THandlerFunction handler) { on(uri, HTTP_ANY, handler); }
  void on(const String& uri, HTTPMethod method, THandlerFunction handler);
  void onNotFound(THandlerFunction handler) { not_found_ = handler; }
  void handleClient();

  void send(int code, const char* content_type = nullptr, const String& content = String());
  void send(int code, const String& content_type, const String& content) {
    send(code, content_type.c_str(), content);
  }
  void sendHeader(const String& name, const String& value, bool first = false);

  String uri() { return uri_; }
  HTTPMethod method() { return method_; }
  int args() { return static_cast<int>(args_.size()); }
  String arg(int index);
  String argName(int index);
  String arg(const String& name);
  bool hasArg(const String& name);

 private:
  struct Route {
    String uri;
    HTTPMethod method;
    THandlerFunction handler;
  };
  int port_;
  bool listening_ = false;
  bool answered_ = false;
  std::vector<Route> routes_;
  THandlerFunction not_found_;
  String uri_;
  HTTPMethod method_ = HTTP_GET;
  std::vector<std::pair<String, String>> args_;
  std::vector<std::pair<String, String>> headers_;
};
