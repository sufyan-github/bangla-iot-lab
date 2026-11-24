// Wi-Fi and the web server for the lab's board library: see include/WiFi.h and
// include/WebServer.h. Written for this project.
#include "WebServer.h"

#include <string>

WiFiClass WiFi;

String IPAddress::toString() const {
  char text[16];
  snprintf(text, sizeof text, "%u.%u.%u.%u", (*this)[0], (*this)[1], (*this)[2], (*this)[3]);
  return String(text);
}

wl_status_t WiFiClass::begin(const char* ssid, const char* /* password */) {
  host_tick();
  mode_ = WIFI_STA;
  ssid_ = ssid ? ssid : "";
  host_wifi_begin(1, ssid_.c_str(), ssid_.length());
  return static_cast<wl_status_t>(host_wifi_status());
}

wl_status_t WiFiClass::status() {
  host_tick();
  return static_cast<wl_status_t>(host_wifi_status());
}

IPAddress WiFiClass::localIP() {
  return mode_ == WIFI_STA ? IPAddress(host_wifi_address()) : IPAddress();
}

bool WiFiClass::softAP(const char* ssid, const char* /* password */, int, int, int) {
  host_tick();
  mode_ = WIFI_AP;
  ssid_ = ssid ? ssid : "";
  host_wifi_begin(2, ssid_.c_str(), ssid_.length());
  return true;
}

IPAddress WiFiClass::softAPIP() {
  return mode_ == WIFI_AP ? IPAddress(host_wifi_address()) : IPAddress();
}

bool WiFiClass::mode(wifi_mode_t mode) {
  if (mode == WIFI_OFF) disconnect(true);
  mode_ = mode;
  return true;
}

bool WiFiClass::disconnect(bool /* wifi_off */) {
  host_wifi_begin(0, "", 0);
  return true;
}

void WebServer::begin() {
  host_tick();
  listening_ = true;
  host_http_listen(port_);
}

void WebServer::on(const String& uri, HTTPMethod method, THandlerFunction handler) {
  routes_.push_back({uri, method, handler});
}

namespace {

int hexValue(char c) {
  if (c >= '0' && c <= '9') return c - '0';
  if (c >= 'a' && c <= 'f') return c - 'a' + 10;
  if (c >= 'A' && c <= 'F') return c - 'A' + 10;
  return -1;
}

/** Undoes the browser's form encoding: "+" is a space, "%41" is "A". */
String decode(const std::string& text) {
  std::string out;
  for (size_t i = 0; i < text.size(); i++) {
    char c = text[i];
    if (c == '+') {
      out += ' ';
    } else if (c == '%' && i + 2 < text.size() + 0 && hexValue(text[i + 1]) >= 0 &&
               hexValue(text[i + 2]) >= 0) {
      out += static_cast<char>(hexValue(text[i + 1]) * 16 + hexValue(text[i + 2]));
      i += 2;
    } else {
      out += c;
    }
  }
  return String(out);
}

HTTPMethod methodOf(const std::string& name) {
  if (name == "POST") return HTTP_POST;
  if (name == "PUT") return HTTP_PUT;
  if (name == "PATCH") return HTTP_PATCH;
  if (name == "DELETE") return HTTP_DELETE;
  if (name == "HEAD") return HTTP_HEAD;
  if (name == "OPTIONS") return HTTP_OPTIONS;
  return HTTP_GET;
}

}  // namespace

void WebServer::handleClient() {
  host_tick();
  if (!listening_) return;
  size_t length = host_http_next(nullptr, 0);
  if (length == 0) return;
  std::string request(length, '\0');
  host_http_next(&request[0], length);

  // "GET /path?a=1&b=2"
  size_t space = request.find(' ');
  std::string target = space == std::string::npos ? "/" : request.substr(space + 1);
  method_ = methodOf(request.substr(0, space));
  size_t question = target.find('?');
  uri_ = String(decode(target.substr(0, question)));
  args_.clear();
  headers_.clear();
  if (question != std::string::npos) {
    std::string query = target.substr(question + 1);
    size_t start = 0;
    while (start <= query.size()) {
      size_t end = query.find('&', start);
      if (end == std::string::npos) end = query.size();
      std::string pair = query.substr(start, end - start);
      if (!pair.empty()) {
        size_t equals = pair.find('=');
        args_.push_back({decode(pair.substr(0, equals)),
                         equals == std::string::npos ? String() : decode(pair.substr(equals + 1))});
      }
      start = end + 1;
    }
  }

  answered_ = false;
  for (const Route& route : routes_) {
    if (route.uri == uri_ && (route.method == HTTP_ANY || route.method == method_)) {
      route.handler();
      if (!answered_) host_http_respond(0, "", 0, "", 0);
      return;
    }
  }
  if (not_found_) {
    not_found_();
    if (!answered_) host_http_respond(0, "", 0, "", 0);
    return;
  }
  String body = String("Not found: ") + uri_;
  host_http_respond(404, "text/plain", 10, body.c_str(), body.length());
}

void WebServer::send(int code, const char* content_type, const String& content) {
  host_tick();
  if (answered_) return;
  answered_ = true;
  // The type, then any headers set, one a line.
  std::string type = content_type ? content_type : "";
  for (const auto& header : headers_) {
    type += "\n";
    type += header.first.c_str();
    type += ": ";
    type += header.second.c_str();
  }
  host_http_respond(code, type.c_str(), type.size(), content.c_str(), content.length());
}

void WebServer::sendHeader(const String& name, const String& value, bool first) {
  if (first) {
    headers_.insert(headers_.begin(), {name, value});
  } else {
    headers_.push_back({name, value});
  }
}

String WebServer::arg(int index) {
  return index >= 0 && index < args() ? args_[index].second : String();
}

String WebServer::argName(int index) {
  return index >= 0 && index < args() ? args_[index].first : String();
}

String WebServer::arg(const String& name) {
  for (const auto& pair : args_) {
    if (pair.first == name) return pair.second;
  }
  return String();
}

bool WebServer::hasArg(const String& name) {
  for (const auto& pair : args_) {
    if (pair.first == name) return true;
  }
  return false;
}
