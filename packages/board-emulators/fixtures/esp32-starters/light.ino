// অন্ধকার হলে LED জ্বলবে (LDR module) — ESP32 বোর্ড
// মডিউলের VCC যাবে 3V3-তে, GND যাবে GND-তে, AO যাবে D34-এ, DO যাবে D27-এ।
// মনে রেখো: মডিউলে 5 V দিলে AO-র ভোল্টেজ ESP32-র পিনের জন্য বেশি হয়ে যায়।

const int lightPin = 34;   // AO: আলো যত বেশি, মান তত কম
const int darkPin = 27;    // DO: অন্ধকারে HIGH, আলোতে LOW
const int ledPin = 2;

void setup() {
  pinMode(darkPin, INPUT);
  pinMode(ledPin, OUTPUT);
  Serial.begin(115200);
}

void loop() {
  int value = analogRead(lightPin);         // ০ থেকে ৪০৯৫
  bool dark = digitalRead(darkPin) == HIGH;
  digitalWrite(ledPin, dark ? HIGH : LOW);  // অন্ধকার হলে বাতি জ্বালাও
  Serial.print("আলোর মান: ");
  Serial.println(value);
  delay(200);
}
