// LoRa রেডিওতে বার্তা পাঠানো — ESP32 বোর্ড আর Ra-02
// Ra-02-এর 3.3V যাবে 3V3-তে (৫ V দিলে নষ্ট হয়), GND যাবে GND-তে,
// SCK যাবে D18-এ, MISO যাবে D19-এ, MOSI যাবে D23-এ, NSS যাবে D5-এ, RST যাবে D14-এ, DIO0 যাবে D2-এ।
// প্রতি দুই সেকেন্ডে একটা বার্তা পাঠায়।

#include <SPI.h>
#include <LoRa.h>

const int NSS_PIN = 5;
const int RST_PIN = 14;
const int DIO0_PIN = 2;
int count = 0;

void setup() {
  Serial.begin(115200);
  LoRa.setPins(NSS_PIN, RST_PIN, DIO0_PIN);
  if (!LoRa.begin(433E6)) {            // ৪৩৩ MHz
    Serial.println("LoRa রেডিও পাওয়া যায়নি");
    while (true) delay(1000);
  }
  LoRa.setSyncWord(0x34);              // দুই রেডিওতে একই হতে হবে
  Serial.println("পাঠানোর রেডিও চালু");
}

void loop() {
  count++;
  LoRa.beginPacket();
  LoRa.print("hello ");
  LoRa.print(count);
  LoRa.endPacket();                    // বার্তা পুরোটা চলে যাওয়া পর্যন্ত অপেক্ষা করে
  Serial.print("পাঠালাম: hello ");
  Serial.println(count);
  delay(2000);
}
