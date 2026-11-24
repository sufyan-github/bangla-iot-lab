// চলন্ত আলো: 74HC595 শিফট রেজিস্টার দিয়ে আটটা LED, বোর্ডের মাত্র তিনটা পিনে — ESP32 বোর্ড
// 74HC595-এর DS (১৪) → D23, SHCP (১১) → D18, STCP (১২) → D5।
// VCC (১৬) আর MR̅ (১০) → 3V3, GND (৮) আর OE̅ (১৩) → GND।
// Q0 থেকে Q7-এর প্রতিটা থেকে একটা রেজিস্টর (৩৩০ Ω) হয়ে একটা LED, LED-র ছোট পা GND-তে।

const int dataPin = 23;   // DS: পরের বিটটা
const int clockPin = 18;  // SHCP: প্রতি পালসে একটা বিট ঢোকে
const int latchPin = 5;   // STCP: পালস দিলে আটটা বিট একসঙ্গে LED-এ যায়

// আটটা বিট পাঠাও, তারপর একসঙ্গে দেখাও।
void show(byte bits) {
  digitalWrite(latchPin, LOW);
  shiftOut(dataPin, clockPin, MSBFIRST, bits);  // বিট ৭ আগে, বিট ০ শেষে
  digitalWrite(latchPin, HIGH);
}

void setup() {
  pinMode(dataPin, OUTPUT);
  pinMode(clockPin, OUTPUT);
  pinMode(latchPin, OUTPUT);
  Serial.begin(115200);
  Serial.println("চলন্ত আলো শুরু");
}

void loop() {
  for (int i = 0; i < 8; i++) {
    show(1 << i);  // শুধু Q-i জ্বলবে
    Serial.print("জ্বলছে Q");
    Serial.println(i);
    delay(300);
  }
}
