// কিছু নড়লে LED জ্বলবে (PIR motion sensor) — ESP32 বোর্ড
// সেন্সরের VCC যাবে VIN-এ (5 V), GND যাবে GND-তে, OUT যাবে D27-এ।
// সেন্সরের OUT পিন 3.3 V দেয়, তাই সরাসরি ESP32-তে লাগানো যায়।

const int motionPin = 27;
const int ledPin = 2;
bool wasMoving = false;

void setup() {
  pinMode(motionPin, INPUT);
  pinMode(ledPin, OUTPUT);
  Serial.begin(115200);
}

void loop() {
  bool moving = digitalRead(motionPin) == HIGH;
  digitalWrite(ledPin, moving ? HIGH : LOW);
  if (moving && !wasMoving) {
    Serial.println("কিছু নড়ছে!");        // নড়াচড়া শুরু হলে একবার জানাও
  }
  if (!moving && wasMoving) {
    Serial.println("সব শান্ত।");          // সেন্সর থামতে কয়েক সেকেন্ড সময় নেয়
  }
  wasMoving = moving;
  delay(50);
}
