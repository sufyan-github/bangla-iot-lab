// মাটি শুকালে বাতি জ্বলবে (Soil moisture) — ESP32 বোর্ড
// সেন্সরের VCC যাবে 3V3-তে, GND যাবে GND-তে, আউটপুট যাবে D34-এ।
// LED রেজিস্টর হয়ে D2-তে থাকবে।

const int soilPin = 34;    // মাটি যত শুকনো, মান তত বেশি
const int ledPin = 2;
const int dryLevel = 3000; // এর বেশি হলে মাটি শুকনো ধরা হবে

void setup() {
  pinMode(ledPin, OUTPUT);
  Serial.begin(115200);
}

void loop() {
  int value = analogRead(soilPin);           // ০ থেকে ৪০৯৫
  bool dry = value > dryLevel;
  digitalWrite(ledPin, dry ? HIGH : LOW);
  Serial.print("মাটির মান: ");
  Serial.print(value);
  Serial.println(dry ? "  পানি দাও!" : "  ঠিক আছে");
  delay(500);
}
