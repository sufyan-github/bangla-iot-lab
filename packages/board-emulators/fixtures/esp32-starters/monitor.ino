// কারেন্ট আর ভোল্টেজ মাপো (INA219) — ESP32 বোর্ড
// INA219-এর VCC যাবে 3V3-এ, GND যাবে GND-তে, SCL যাবে D22-এ, SDA যাবে D21-এ।
// যে কারেন্ট মাপবে তা VIN+ দিয়ে ঢুকে VIN− দিয়ে বেরোবে।
// ব্যাটারির − বোর্ডের GND-তেও যাবে, যাতে VIN−-এর ভোল্টেজ ঠিক মাপা যায়।

#include <Wire.h>
#include <Adafruit_INA219.h>

Adafruit_INA219 ina;              // Adafruit-এর লাইব্রেরি; ঠিকানা 0x40

void setup() {
  Serial.begin(115200);
  if (!ina.begin()) {
    Serial.println("INA219 পাওয়া যায়নি: তার দেখো");
    while (true) delay(1000);
  }
  Serial.println("INA219 পাওয়া গেছে");
}

void loop() {
  float volts = ina.getBusVoltage_V();           // VIN−-এর ভোল্টেজ
  float milliamps = ina.getCurrent_mA();         // VIN+ থেকে VIN− দিয়ে কারেন্ট
  float milliwatts = ina.getPower_mW();          // চিপ নিজেই হিসাব করে

  Serial.print("ভোল্টেজ: ");
  Serial.print(volts, 2);
  Serial.print(" V, কারেন্ট: ");
  Serial.print(milliamps, 1);
  Serial.print(" mA, ক্ষমতা: ");
  Serial.print(milliwatts, 0);
  Serial.println(" mW");
  delay(1000);
}
