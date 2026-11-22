// বৃষ্টি এলে বাতি জ্বলবে (Rain sensor) — ESP32 বোর্ড
// মডিউলের VCC যাবে 3V3-তে, GND যাবে GND-তে, DO যাবে D27-এ, AO যাবে D34-এ।
// LED রেজিস্টর হয়ে D2-তে থাকবে।

const int wetPin = 27;     // DO: শুকনো হলে HIGH, ভিজলে LOW
const int levelPin = 34;   // AO: যত ভেজা, মান তত কম
const int ledPin = 2;

void setup() {
  pinMode(wetPin, INPUT);
  pinMode(ledPin, OUTPUT);
  Serial.begin(115200);
}

void loop() {
  int level = analogRead(levelPin);          // ০ থেকে ৪০৯৫
  bool raining = digitalRead(wetPin) == LOW;
  digitalWrite(ledPin, raining ? HIGH : LOW);
  Serial.print("পানির মান: ");
  Serial.print(level);
  Serial.println(raining ? "  বৃষ্টি হচ্ছে!" : "  শুকনো");
  delay(500);
}
