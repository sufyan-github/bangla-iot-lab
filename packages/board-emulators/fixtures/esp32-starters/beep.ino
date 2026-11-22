// বাজার বাজাও (Buzzer) — ESP32 বোর্ড
// বাজারের + পা D25-এ, − পা GND-তে লাগাও।

const int buzzerPin = 25;

void beep(int milliseconds) {
  digitalWrite(buzzerPin, HIGH);   // বাজারের ভেতরের দোলক নিজেই শব্দ বানায়
  delay(milliseconds);
  digitalWrite(buzzerPin, LOW);
}

void setup() {
  pinMode(buzzerPin, OUTPUT);
  Serial.begin(115200);
}

void loop() {
  Serial.println("তিনবার বিপ");
  for (int i = 0; i < 3; i++) {
    beep(200);
    delay(200);
  }
  delay(1500);                      // একটু চুপ করে থাকো
}
