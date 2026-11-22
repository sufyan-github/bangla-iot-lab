// পানির মান দেখো (TDS মিটার আর ঘোলাত্ব সেন্সর) — ESP32 বোর্ড
// TDS মিটার: + যাবে 3V3-এ, − যাবে GND-তে, A যাবে D35-এ।
// ঘোলাত্ব সেন্সর: + যাবে VIN-এ, − যাবে GND-তে। A থেকে 10 kΩ রেজিস্টর হয়ে D34-এ,
// আর D34 থেকে আরেকটা 10 kΩ হয়ে GND-তে: সেন্সরের ভোল্টেজ অর্ধেক হয়ে পিনে আসে।
// LED রেজিস্টর হয়ে D2-তে থাকবে।
// চালু করার সময় সেন্সর পরিষ্কার পানিতে রাখো: প্রোগ্রাম তখনকার ভোল্টেজ মনে রাখে।

const int tdsPin = 35;
const int turbidityPin = 34;
const int ledPin = 2;
const float tdsLimit = 500;    // ppm: এর বেশি হলে পানিতে দ্রবীভূত পদার্থ বেশি
const float cloudyShare = 0.9; // পরিষ্কার পানির ভোল্টেজের ৯০%-এর নিচে নামলে পানি ঘোলা

float clearVolts;              // পরিষ্কার পানিতে ঘোলাত্ব সেন্সরের ভোল্টেজ

// ঘোলাত্ব সেন্সরের ভোল্টেজ: পিনে যা আসে তার দ্বিগুণ (ভাগের আগে যা ছিল)
float turbidityVolts() {
  return 2 * analogReadMilliVolts(turbidityPin) / 1000.0;
}

void setup() {
  pinMode(ledPin, OUTPUT);
  Serial.begin(115200);
  clearVolts = turbidityVolts();
  Serial.print("পরিষ্কার পানিতে ঘোলাত্ব সেন্সর: ");
  Serial.print(clearVolts, 2);
  Serial.println(" V");
}

void loop() {
  // TDS: নির্মাতার সূত্র দিয়ে ভোল্টেজ থেকে ppm (২৫ °C-এ)
  float v = analogReadMilliVolts(tdsPin) / 1000.0;
  float ppm = (133.42 * v * v * v - 255.86 * v * v + 857.39 * v) * 0.5;
  float t = turbidityVolts();
  bool salty = ppm > tdsLimit;
  bool cloudy = t < cloudyShare * clearVolts;
  digitalWrite(ledPin, (salty || cloudy) ? HIGH : LOW);

  Serial.print("TDS: ");
  Serial.print(ppm, 0);
  Serial.print(" ppm, ঘোলাত্ব সেন্সর: ");
  Serial.print(t, 2);
  Serial.print(" V  ");
  if (salty) Serial.print("দ্রবীভূত পদার্থ বেশি! ");
  if (cloudy) Serial.print("পানি ঘোলা! ");
  if (!salty && !cloudy) Serial.print("পানি ঠিক আছে");
  Serial.println();
  delay(1000);
}
