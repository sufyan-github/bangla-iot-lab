// জিপিএস দিয়ে অবস্থান জানো (NEO-6M) — ESP32 বোর্ড
// GPS-এর VCC যাবে 3V3-এ, GND যাবে GND-তে।
// আড়াআড়ি লাগাও: GPS-এর TX যাবে বোর্ডের RX2-তে (GPIO16), GPS-এর RX যাবে TX2-তে (GPIO17)।

#include <TinyGPS++.h>

TinyGPSPlus gps;                 // NMEA বাক্য পড়ে অবস্থান বের করে
HardwareSerial gpsSerial(2);     // বোর্ডের দ্বিতীয় সিরিয়াল পোর্ট
unsigned long lastPrint = 0;

void setup() {
  Serial.begin(115200);
  gpsSerial.begin(9600, SERIAL_8N1, 16, 17);   // GPS ৯৬০০ বডে কথা বলে; RX2 = GPIO16, TX2 = GPIO17
  Serial.println("জিপিএস চালু: স্যাটেলাইট খুঁজছে...");
}

void loop() {
  // GPS থেকে যা এসেছে, অক্ষর ধরে ধরে পড়ো
  while (gpsSerial.available()) gps.encode(gpsSerial.read());

  if (millis() - lastPrint >= 2000) {            // প্রতি দুই সেকেন্ডে একবার দেখাও
    lastPrint = millis();
    if (gps.charsProcessed() < 10) {
      Serial.println("GPS থেকে কিছুই আসছে না: TX আর RX আড়াআড়ি লাগানো কি না দেখো");
    } else if (gps.location.isValid() && gps.location.age() < 3000) {
      // isValid() থাকে একবার অবস্থান পাওয়ার পর থেকেই; age() বলে সেটা কত পুরোনো (মিলিসেকেন্ডে)
      Serial.print("অক্ষাংশ: ");
      Serial.print(gps.location.lat(), 6);
      Serial.print(", দ্রাঘিমাংশ: ");
      Serial.print(gps.location.lng(), 6);
      Serial.print(", স্যাটেলাইট: ");
      Serial.println(gps.satellites.value());
    } else {
      Serial.print("অবস্থান এখনো জানা নেই, স্যাটেলাইট: ");
      Serial.println(gps.satellites.value());
    }
  }
}
