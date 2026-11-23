// বাতাসের ধূলিকণা মাপো (PMS5003) — ESP32 বোর্ড
// সেন্সরের VCC যাবে VIN-এ (5 V), GND যাবে GND-তে।
// আড়াআড়ি লাগাও: সেন্সরের TX যাবে বোর্ডের RX2-তে (GPIO16), RX যাবে TX2-তে (GPIO17)।
// LED রেজিস্টর হয়ে D2-তে থাকবে: ধূলিকণা বেশি হলে জ্বলবে।

#include <PMS.h>

HardwareSerial pmsSerial(2);     // বোর্ডের দ্বিতীয় সিরিয়াল পোর্ট
PMS pms(pmsSerial);              // PMS লাইব্রেরি
PMS::DATA data;
const int ledPin = 2;
const int limit = 55;            // এই প্রোগ্রামের সীমা: PM2.5 এর বেশি হলে LED জ্বলবে (µg/m³)

void setup() {
  pinMode(ledPin, OUTPUT);
  Serial.begin(115200);
  pmsSerial.begin(9600, SERIAL_8N1, 16, 17);
  Serial.println("ধূলিকণা সেন্সর চালু");
}

void loop() {
  if (pms.read(data)) {          // পুরো একটা মাপ এলে
    Serial.print("PM1.0: ");
    Serial.print(data.PM_AE_UG_1_0);
    Serial.print(", PM2.5: ");
    Serial.print(data.PM_AE_UG_2_5);
    Serial.print(", PM10: ");
    Serial.print(data.PM_AE_UG_10_0);
    Serial.println(" µg/m³");
    digitalWrite(ledPin, data.PM_AE_UG_2_5 > limit ? HIGH : LOW);
  }
}
