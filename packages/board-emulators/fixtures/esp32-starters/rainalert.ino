// বৃষ্টির সতর্কতা (Rain alert) — ESP32 বোর্ড
// বৃষ্টি এলে সার্ভো ঢাকনা বন্ধ করে আর বাজার তিনবার বাজে; থামলে ঢাকনা খোলে।
// বৃষ্টি সেন্সর: VCC→3V3, GND→GND, DO→D27, AO→D34।
// বাজার: +→D25, −→GND। সার্ভো: GND→GND, VCC→VIN, সংকেত→D13।

#include <ESP32Servo.h>

const int wetPin = 27;     // DO: ভিজলে LOW
const int buzzerPin = 25;
const int servoPin = 13;
Servo cover;
bool wasRaining = false;

void beep(int times) {
  for (int i = 0; i < times; i++) {
    digitalWrite(buzzerPin, HIGH);
    delay(200);
    digitalWrite(buzzerPin, LOW);
    delay(200);
  }
}

void setup() {
  pinMode(wetPin, INPUT);
  pinMode(buzzerPin, OUTPUT);
  cover.attach(servoPin);
  cover.write(0);                    // ঢাকনা খোলা
  Serial.begin(115200);
  Serial.println("শুকনো: ঢাকনা খোলা");
}

void loop() {
  bool raining = digitalRead(wetPin) == LOW;
  if (raining && !wasRaining) {
    Serial.println("বৃষ্টি! ঢাকনা বন্ধ হচ্ছে");
    cover.write(90);                 // ঢাকনা বন্ধ
    beep(3);
  }
  if (!raining && wasRaining) {
    Serial.println("বৃষ্টি থেমেছে: ঢাকনা খোলা");
    cover.write(0);
  }
  wasRaining = raining;
  delay(100);
}
