// বোর্ডের নিজের ওয়েব পেজ: ব্রাউজার থেকে LED জ্বালাও-নেভাও — ESP32 বোর্ড
// LED-র লম্বা পা রেজিস্টর হয়ে D2-তে, ছোট পা GND-তে।
// ল্যাবে আসল ইন্টারনেট নেই: বোর্ড ল্যাবের বানানো একটা নেটওয়ার্কে যোগ দেয়, আর
// ডানের "ওয়েব পেজ" প্যানেল থেকে বোর্ডের পেজ খোলা যায়।

#include <WiFi.h>
#include <WebServer.h>

const char* ssid = "lab-wifi";      // আসল বোর্ডে তোমার Wi-Fi-র নাম
const char* password = "12345678";  // আর তার পাসওয়ার্ড
const int ledPin = 2;

WebServer server(80);  // ৮০ নম্বর পোর্টে ওয়েব সার্ভার
bool ledOn = false;

// পুরো পেজটা একটা লেখা (HTML) হিসেবে বানাও।
String page() {
  String html = "<!DOCTYPE html><html><head><meta charset='utf-8'><title>ESP32 LED</title></head><body>";
  html += "<h1>ESP32-র LED</h1>";
  html += "<p>LED এখন: <b>";
  html += ledOn ? "জ্বলছে" : "নেভা";
  html += "</b></p>";
  html += "<p><a href='/on'>জ্বালাও</a> | <a href='/off'>নেভাও</a></p>";
  html += "</body></html>";
  return html;
}

void handleRoot() {
  server.send(200, "text/html", page());
}

void handleOn() {
  ledOn = true;
  digitalWrite(ledPin, HIGH);
  server.send(200, "text/html", page());
}

void handleOff() {
  ledOn = false;
  digitalWrite(ledPin, LOW);
  server.send(200, "text/html", page());
}

void setup() {
  pinMode(ledPin, OUTPUT);
  Serial.begin(115200);

  WiFi.begin(ssid, password);
  Serial.print("Wi-Fi-তে যোগ দিচ্ছি");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();
  Serial.print("ঠিকানা: http://");
  Serial.println(WiFi.localIP());

  // কোন পাতা চাইলে কোন ফাংশন উত্তর দেবে।
  server.on("/", handleRoot);
  server.on("/on", handleOn);
  server.on("/off", handleOff);
  server.begin();
  Serial.println("ওয়েব সার্ভার চালু");
}

void loop() {
  server.handleClient();  // কেউ পেজ চাইলে উত্তর দাও
  delay(2);
}
