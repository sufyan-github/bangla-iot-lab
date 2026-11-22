// স্মার্ট পার্কিং (Smart parking) — ESP32 বোর্ড
// গেটে গাড়ি এলে, জায়গা খালি থাকলে গেট খোলে; জায়গা ভরা থাকলে বন্ধ থাকে।
// IR সেন্সর (গেটে): VCC→3V3, OUT→D27, GND→GND।
// আলট্রাসনিক সেন্সর (পার্কিংয়ের জায়গায়): VCC→VIN, Trig→D5, GND→GND;
// Echo থেকে ১ kΩ হয়ে D18-এ, D18 থেকে ২ kΩ হয়ে GND-তে।
// সার্ভো (গেট): GND→GND, VCC→VIN, সংকেত→D13। OLED: GND, VCC→3V3, SCL→D22, SDA→D21।

#include <ESP32Servo.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

const int gatePin = 27;            // সামনে গাড়ি থাকলে LOW
const int trigPin = 5;
const int echoPin = 18;
const int servoPin = 13;
const int TAKEN_DISTANCE = 15;     // এর চেয়ে কাছে কিছু থাকলে জায়গা ভরা (সেমি)
Servo gate;
Adafruit_SSD1306 display(128, 64, &Wire, -1);
bool wasAtGate = false;

long readDistance() {
  digitalWrite(trigPin, LOW);
  delayMicroseconds(2);
  digitalWrite(trigPin, HIGH);
  delayMicroseconds(10);
  digitalWrite(trigPin, LOW);
  return pulseIn(echoPin, HIGH, 30000) / 58;
}

void show(bool full) {
  display.clearDisplay();
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.println("Parking");
  display.setTextSize(3);
  display.setCursor(0, 24);
  display.println(full ? "FULL" : "FREE");
  display.display();
}

void setup() {
  pinMode(gatePin, INPUT);
  pinMode(trigPin, OUTPUT);
  pinMode(echoPin, INPUT);
  gate.attach(servoPin);
  gate.write(0);                   // গেট বন্ধ
  Serial.begin(115200);
  display.begin(SSD1306_SWITCHCAPVCC, 0x3C);
  display.setTextColor(SSD1306_WHITE);
}

void loop() {
  long cm = readDistance();
  bool full = cm > 0 && cm < TAKEN_DISTANCE;
  show(full);
  bool carAtGate = digitalRead(gatePin) == LOW;
  if (carAtGate && !wasAtGate) {
    if (full) {
      Serial.println("জায়গা নেই, গেট বন্ধ থাকবে");
    } else {
      Serial.println("গাড়ি ঢুকছে: গেট খুলছে");
      gate.write(90);
      delay(3000);
      gate.write(0);
      Serial.println("গেট বন্ধ");
    }
  }
  wasAtGate = carAtGate;
  delay(200);
}
