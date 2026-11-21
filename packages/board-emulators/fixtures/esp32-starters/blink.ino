// LED জ্বালাও-নেভাও (Blink) — ESP32 বোর্ড
// LED-র লম্বা পা রেজিস্টর হয়ে D2 পিনে, ছোট পা GND-তে লাগাও।

const int ledPin = 2;

void setup() {
  pinMode(ledPin, OUTPUT);
}

void loop() {
  digitalWrite(ledPin, HIGH);   // পিনে 3.3 V: LED জ্বলবে
  delay(500);                   // আধা সেকেন্ড অপেক্ষা
  digitalWrite(ledPin, LOW);    // পিনে 0 V: LED নিভবে
  delay(500);
}
