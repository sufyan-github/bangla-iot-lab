// সামনে কিছু এলে বাতি জ্বলবে (IR obstacle sensor) — ESP32 বোর্ড
// সেন্সরের VCC যাবে 3V3-তে, GND যাবে GND-তে, OUT যাবে D27-এ।
// LED রেজিস্টর হয়ে D2-তে থাকবে।

const int sensorPin = 27;  // সামনে কিছু থাকলে LOW, না থাকলে HIGH
const int ledPin = 2;
bool wasBlocked = false;

void setup() {
  pinMode(sensorPin, INPUT);
  pinMode(ledPin, OUTPUT);
  Serial.begin(115200);
}

void loop() {
  bool blocked = digitalRead(sensorPin) == LOW;
  digitalWrite(ledPin, blocked ? HIGH : LOW);
  if (blocked && !wasBlocked) {
    Serial.println("সামনে বাধা!");
  }
  if (!blocked && wasBlocked) {
    Serial.println("পথ পরিষ্কার।");
  }
  wasBlocked = blocked;
  delay(50);
}
