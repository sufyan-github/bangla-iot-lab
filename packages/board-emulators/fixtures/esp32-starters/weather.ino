// আবহাওয়া কেন্দ্র (BME280) — ESP32 বোর্ড
// BME280-এর VIN যাবে 3V3-এ (৫ V নয়!), GND যাবে GND-তে,
// SCL যাবে D22-এ, SDA যাবে D21-এ। এর ঠিকানা 0x76।
// LED রেজিস্টর হয়ে D2-তে থাকবে: বাতাস খুব আর্দ্র হলে জ্বলবে।

#include <Wire.h>
#include <Adafruit_BME280.h>

Adafruit_BME280 bme;              // Adafruit-এর লাইব্রেরি, আসল বোর্ডে যেটা চলে সেটাই
const int ledPin = 2;
const float humidLimit = 80;      // এর বেশি আর্দ্রতা হলে LED জ্বলবে

void setup() {
  pinMode(ledPin, OUTPUT);
  Serial.begin(115200);
  if (!bme.begin(0x76)) {         // সেন্সর না পেলে জানাও
    Serial.println("BME280 পাওয়া যায়নি: তার আর ঠিকানা দেখো");
    while (true) delay(1000);
  }
  Serial.println("BME280 পাওয়া গেছে");
}

void loop() {
  float celsius = bme.readTemperature();         // °C
  float humidity = bme.readHumidity();           // %
  float hpa = bme.readPressure() / 100.0;        // প্যাসকেল থেকে হেক্টোপ্যাসকেল
  digitalWrite(ledPin, humidity > humidLimit ? HIGH : LOW);

  Serial.print("তাপমাত্রা: ");
  Serial.print(celsius, 1);
  Serial.print(" °C, আর্দ্রতা: ");
  Serial.print(humidity, 0);
  Serial.print(" %, বায়ুচাপ: ");
  Serial.print(hpa, 1);
  Serial.println(" hPa");
  delay(2000);
}
