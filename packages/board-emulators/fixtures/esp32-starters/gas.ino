// বাতাস খারাপ হলে সতর্ক করো (MQ-135 gas sensor) — ESP32 বোর্ড
// সেন্সরের VCC যাবে VIN-এ (5 V), GND যাবে GND-তে।
// AO থেকে 10 kΩ রেজিস্টর হয়ে D34-এ, আর D34 থেকে আরেকটা 10 kΩ হয়ে GND-তে:
// এতে AO-র ভোল্টেজ অর্ধেক হয়ে ESP32-র পিনের সীমার মধ্যে থাকে।
// LED রেজিস্টর হয়ে D2-তে থাকবে।

const int gasPin = 34;
const int ledPin = 2;
const int alarmLevel = 1200;  // এর বেশি হলে বাতাস খারাপ ধরা হবে

void setup() {
  pinMode(ledPin, OUTPUT);
  Serial.begin(115200);
}

void loop() {
  int value = analogRead(gasPin);            // ০ থেকে ৪০৯৫
  bool bad = value > alarmLevel;
  digitalWrite(ledPin, bad ? HIGH : LOW);
  Serial.print("গ্যাসের মান: ");
  Serial.print(value);
  Serial.println(bad ? "  বাতাস খারাপ!" : "  বাতাস ঠিক আছে");
  delay(500);
}
