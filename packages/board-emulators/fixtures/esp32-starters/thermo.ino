// পানির তাপমাত্রা মাপো (DS18B20) — ESP32 বোর্ড
// প্রোবের লাল তার (VDD) যাবে 3V3-এ, কালো (GND) যাবে GND-তে, হলুদ (DQ) যাবে D4-এ।
// DQ থেকে VDD-তে একটা 4.7 kΩ রেজিস্টর লাগাও (পুল-আপ): এটা ছাড়া প্রোব কথা বলতে পারে না।
// একই D4 তারে একাধিক প্রোব বসানো যায়: প্রোগ্রাম সবগুলো খুঁজে নেয়।
// LED রেজিস্টর হয়ে D2-তে থাকবে: খুব গরম হলে জ্বলবে।

#include <OneWire.h>
#include <DallasTemperature.h>

OneWire bus(4);                    // 1-Wire বাস D4-এ
DallasTemperature probes(&bus);    // DS18B20-এর লাইব্রেরি
const int ledPin = 2;
const float hotLimit = 40;         // এর বেশি তাপমাত্রা হলে LED জ্বলবে

void setup() {
  pinMode(ledPin, OUTPUT);
  Serial.begin(115200);
  probes.begin();                  // বাসে কয়টা প্রোব আছে খোঁজে
  Serial.print("প্রোব পাওয়া গেছে: ");
  Serial.println(probes.getDeviceCount());
}

void loop() {
  probes.requestTemperatures();    // সব প্রোবকে একসাথে মাপতে বলো (প্রায় ০.৭৫ সেকেন্ড)
  bool hot = false;
  for (int i = 0; i < probes.getDeviceCount(); i++) {
    float celsius = probes.getTempCByIndex(i);
    if (celsius > hotLimit) hot = true;
    Serial.print("প্রোব ");
    Serial.print(i + 1);
    Serial.print(": ");
    Serial.print(celsius, 2);
    Serial.println(" °C");
  }
  digitalWrite(ledPin, hot ? HIGH : LOW);
  delay(1000);
}
