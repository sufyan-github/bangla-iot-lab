// ওয়েব থেকে আবহাওয়া আনো, আর গরম হলে LED জ্বালাও — ESP32 বোর্ড
// LED রেজিস্টর হয়ে D2-তে।
// ল্যাবে আসল ইন্টারনেট নেই: weather.lab ল্যাবের বানানো একটা সেবা, তার তাপমাত্রা
// বানানো, আসল নয়। log.lab পাঠানো লাইনগুলো রেখে দেয়। ডানের "নেটওয়ার্ক" প্যানেলে
// বোর্ডের পাঠানো অনুরোধগুলো দেখা যায়।

#include <WiFi.h>
#include <HTTPClient.h>

const char* ssid = "lab-wifi";
const char* password = "12345678";
const int ledPin = 2;

// JSON লেখা থেকে একটা সংখ্যা বের করো, যেমন "temperature":31.2
float numberAfter(const String& json, const String& key) {
  int at = json.indexOf("\"" + key + "\":");
  if (at < 0) return NAN;
  return json.substring(at + key.length() + 3).toFloat();
}

void setup() {
  pinMode(ledPin, OUTPUT);
  Serial.begin(115200);
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) delay(500);
  Serial.println("Wi-Fi-তে আছি");
}

void loop() {
  HTTPClient http;
  http.begin("http://weather.lab/now?city=Dhaka");
  int code = http.GET();
  if (code == HTTP_CODE_OK) {
    String json = http.getString();
    float temperature = numberAfter(json, "temperature");
    Serial.print("ঢাকার তাপমাত্রা (বানানো): ");
    Serial.println(temperature);
    digitalWrite(ledPin, temperature > 30 ? HIGH : LOW);

    // মানটা log.lab-এ রেখে দাও।
    HTTPClient log;
    log.begin("http://log.lab/");
    log.POST("temperature=" + String(temperature));
    log.end();
  } else {
    Serial.print("অনুরোধ হলো না: ");
    Serial.println(HTTPClient::errorToString(code));
  }
  http.end();
  delay(5000);
}
