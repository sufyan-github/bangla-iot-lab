// OLED ডিসপ্লেতে লেখা আর ছবি (SSD1306, I2C) — ESP32 বোর্ড
// ডিসপ্লের VCC যাবে 3V3-তে, GND যাবে GND-তে, SCL যাবে D22-এ, SDA যাবে D21-এ।
// মনে রেখো: এই লাইব্রেরির অক্ষরে ইংরেজি আর সংখ্যা দেখানো যায়, বাংলা নয়।

#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

Adafruit_SSD1306 display(128, 64, &Wire, -1);   // ১২৮ × ৬৪ বিন্দু
int count = 0;

void setup() {
  Serial.begin(115200);
  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {   // 0x3C ডিসপ্লের ঠিকানা
    Serial.println("ডিসপ্লে চালু করা যায়নি");
    while (true) delay(1000);
  }
  display.setTextColor(SSD1306_WHITE);
}

void loop() {
  display.clearDisplay();                 // আগের ছবি মুছে ফেলো
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.println("Bangla IoT Lab");
  display.drawLine(0, 12, 127, 12, SSD1306_WHITE);
  display.setTextSize(3);                 // বড় অক্ষর
  display.setCursor(0, 24);
  display.println(count);
  display.drawRect(100, 24, 24, 24, SSD1306_WHITE);
  if (count % 2 == 0) {
    display.fillRect(104, 28, 16, 16, SSD1306_WHITE);
  }
  display.display();                      // এবার ছবিটা ডিসপ্লেতে পাঠাও
  count = count + 1;
  delay(1000);
}
