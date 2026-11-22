// বাতাসের মান (Air quality monitor) — ESP32 বোর্ড
// MQ-135 দিয়ে বাতাস মাপো: ভালো হলে সবুজ, মাঝারি হলে হলুদ, খারাপ হলে লাল আর বাজার।
// MQ-135: VCC→VIN, GND→GND। AO থেকে ১০ kΩ হয়ে D34-এ, D34 থেকে ১০ kΩ হয়ে GND-তে।
// OLED: GND→GND, VCC→3V3, SCL→D22, SDA→D21।
// RGB LED: R, G, B প্রতিটা ২২০ Ω হয়ে D25, D26, D27-এ; − পা GND-তে। বাজার: +→D32, −→GND।

#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

const int gasPin = 34;
const int redPin = 25;
const int greenPin = 26;
const int bluePin = 27;
const int buzzerPin = 32;
const int FAIR_LEVEL = 900;        // এর বেশি: মাঝারি
const int BAD_LEVEL = 1500;        // এর বেশি: খারাপ
Adafruit_SSD1306 display(128, 64, &Wire, -1);
int lastLevel = -1;

void colour(bool red, bool green) {
  digitalWrite(redPin, red ? HIGH : LOW);
  digitalWrite(greenPin, green ? HIGH : LOW);
  digitalWrite(bluePin, LOW);
}

void setup() {
  pinMode(redPin, OUTPUT);
  pinMode(greenPin, OUTPUT);
  pinMode(bluePin, OUTPUT);
  pinMode(buzzerPin, OUTPUT);
  Serial.begin(115200);
  display.begin(SSD1306_SWITCHCAPVCC, 0x3C);
  display.setTextColor(SSD1306_WHITE);
}

void loop() {
  int value = analogRead(gasPin);
  int level = value > BAD_LEVEL ? 2 : value > FAIR_LEVEL ? 1 : 0;
  const char* words[] = {"GOOD", "FAIR", "BAD"};

  if (level == 0) colour(false, true);        // সবুজ
  else if (level == 1) colour(true, true);    // লাল + সবুজ = হলুদ
  else colour(true, false);                   // লাল
  digitalWrite(buzzerPin, level == 2 ? HIGH : LOW);

  display.clearDisplay();
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.println("Air quality");
  display.print("Reading: ");
  display.println(value);
  display.setTextSize(3);
  display.setCursor(0, 30);
  display.println(words[level]);
  display.display();

  if (level != lastLevel) {
    const char* bangla[] = {"বাতাস: ভালো", "বাতাস: মাঝারি", "বাতাস: খারাপ!"};
    Serial.println(bangla[level]);
    lastLevel = level;
  }
  delay(500);
}
