// তাপমাত্রা আর আর্দ্রতা মাপো (DHT11) — ESP32 বোর্ড
// DHT11-এর VCC পা 3V3-তে, DATA পা D4-এ, GND পা GND-তে লাগাও।

#include <DHT.h>

DHT dht(4, DHT11);   // সেন্সর D4 পিনে আছে

void setup() {
  Serial.begin(115200);
  dht.begin();
}

void loop() {
  delay(2000);                              // DHT11 দুই সেকেন্ডে একবার মাপে
  float humidity = dht.readHumidity();      // আর্দ্রতা, শতকরা
  float celsius = dht.readTemperature();    // তাপমাত্রা, ডিগ্রি সেলসিয়াস

  if (isnan(humidity) || isnan(celsius)) {  // সেন্সর উত্তর না দিলে
    Serial.println("সেন্সর পড়া যায়নি");
    return;
  }
  Serial.print("তাপমাত্রা ");
  Serial.print(celsius, 0);
  Serial.print(" °C, আর্দ্রতা ");
  Serial.print(humidity, 0);
  Serial.println(" %");
}
