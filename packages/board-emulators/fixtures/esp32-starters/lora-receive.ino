// LoRa রেডিওতে বার্তা শোনা — ESP32 বোর্ড আর Ra-02
// Ra-02-এর 3.3V যাবে 3V3-তে (৫ V দিলে নষ্ট হয়), GND যাবে GND-তে,
// SCK যাবে D18-এ, MISO যাবে D19-এ, MOSI যাবে D23-এ, NSS যাবে D5-এ, RST যাবে D14-এ, DIO0 যাবে D2-এ।
// বার্তা এলে লেখাটা আর সংকেত কত জোরালো (RSSI) তা দেখায়।

#include <SPI.h>
#include <LoRa.h>

const int NSS_PIN = 5;
const int RST_PIN = 14;
const int DIO0_PIN = 2;

void setup() {
  Serial.begin(115200);
  LoRa.setPins(NSS_PIN, RST_PIN, DIO0_PIN);
  if (!LoRa.begin(433E6)) {            // পাঠানোর রেডিওর সাথে একই ফ্রিকোয়েন্সি
    Serial.println("LoRa রেডিও পাওয়া যায়নি");
    while (true) delay(1000);
  }
  LoRa.setSyncWord(0x34);
  Serial.println("শোনার রেডিও চালু");
}

void loop() {
  int size = LoRa.parsePacket();       // কোনো বার্তা এসেছে কি না
  if (size > 0) {
    String message = "";
    while (LoRa.available()) message += (char)LoRa.read();
    Serial.print("পেলাম: ");
    Serial.print(message);
    Serial.print("  RSSI: ");
    Serial.print(LoRa.packetRssi());   // সংকেতের জোর, dBm-এ (যত কাছে শূন্যের, তত জোরালো)
    Serial.println(" dBm");
  }
}
