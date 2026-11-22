// নিরাপত্তা অ্যালার্ম (Security alarm) — ESP32 বোর্ড
// বোতাম চাপলে পাহারা চালু বা বন্ধ হয়। পাহারা চালু থাকা অবস্থায় কেউ নড়লে
// বাজার আর বাতি জ্বলে-নেভে, আর ডিসপ্লেতে লেখা আসে ALARM!
// PIR: VCC→VIN, OUT→D27, GND→GND। বোতাম: D4 আর GND-র মাঝে।
// বাজার: +→D25, −→GND। LED: D2 থেকে ২২০ Ω হয়ে, ছোট পা GND-তে।
// OLED: GND→GND, VCC→3V3, SCL→D22, SDA→D21।

#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

const int motionPin = 27;
const int buttonPin = 4;
const int buzzerPin = 25;
const int ledPin = 2;
Adafruit_SSD1306 display(128, 64, &Wire, -1);
bool armed = false;
bool alarmOn = false;
int lastButton = HIGH;

void show(const char* state) {
  display.clearDisplay();
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.println("Security");
  display.setTextSize(3);
  display.setCursor(0, 24);
  display.println(state);
  display.display();
}

void setup() {
  pinMode(motionPin, INPUT);
  pinMode(buttonPin, INPUT_PULLUP);
  pinMode(buzzerPin, OUTPUT);
  pinMode(ledPin, OUTPUT);
  Serial.begin(115200);
  display.begin(SSD1306_SWITCHCAPVCC, 0x3C);
  display.setTextColor(SSD1306_WHITE);
  show("OFF");
  Serial.println("পাহারা বন্ধ আছে");
}

void loop() {
  int button = digitalRead(buttonPin);
  if (lastButton == HIGH && button == LOW) {     // বোতাম এইমাত্র চাপা হলো
    armed = !armed;
    alarmOn = false;
    digitalWrite(buzzerPin, LOW);
    digitalWrite(ledPin, LOW);
    if (armed) {
      Serial.println("পাহারা চালু হলো");
      show("ARMED");
    } else {
      Serial.println("পাহারা বন্ধ করা হলো");
      show("OFF");
    }
  }
  lastButton = button;

  if (armed && !alarmOn && digitalRead(motionPin) == HIGH) {
    alarmOn = true;
    Serial.println("বিপদ! কেউ ঢুকেছে");
    show("ALARM!");
  }
  if (alarmOn) {
    bool on = (millis() / 250) % 2 == 0;           // প্রতি ২৫০ মিলিসেকেন্ডে বদলাও
    digitalWrite(buzzerPin, on ? HIGH : LOW);
    digitalWrite(ledPin, on ? HIGH : LOW);
  }
  delay(20);
}
