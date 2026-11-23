// ১.৫৪″ রঙিন ডিসপ্লে (ST7789, SPI) — ESP32 বোর্ড
// VCC যাবে 3V3-তে, GND যাবে GND-তে, SCL যাবে D18-এ, SDA যাবে D23-এ,
// RES যাবে D4-এ, DC যাবে D2-এ, CS যাবে D5-এ। BLK খোলা রাখলে আলো জ্বলে থাকে।
// মনে রেখো: এই লাইব্রেরির অক্ষরে ইংরেজি আর সংখ্যা দেখানো যায়, বাংলা নয়।

#include <Adafruit_GFX.h>
#include <Adafruit_ST7789.h>
#include <SPI.h>

const int TFT_CS = 5;
const int TFT_DC = 2;
const int TFT_RST = 4;

Adafruit_ST7789 tft(TFT_CS, TFT_DC, TFT_RST);
unsigned long last = 0;

void setup() {
  Serial.begin(115200);
  tft.init(240, 240);  // ২৪০ × ২৪০ বিন্দু
  tft.fillScreen(ST77XX_BLACK);
  tft.setTextColor(ST77XX_WHITE);
  tft.setTextSize(3);
  tft.setCursor(12, 12);
  tft.print("IoT Lab");
  tft.fillRect(20, 60, 60, 110, ST77XX_RED);     // লাল
  tft.fillRect(90, 60, 60, 110, ST77XX_GREEN);   // সবুজ
  tft.fillRect(160, 60, 60, 110, ST77XX_BLUE);   // নীল
  Serial.println("ডিসপ্লে চালু হলো");
}

void loop() {
  if (millis() - last >= 1000) {   // প্রতি সেকেন্ডে একবার
    last = millis();
    tft.fillRect(0, 190, 240, 40, ST77XX_BLACK);  // আগের সময় মুছে ফেলো
    tft.setCursor(12, 196);
    tft.print("Time: ");
    tft.print(last / 1000);
    tft.print(" s");
  }
}
