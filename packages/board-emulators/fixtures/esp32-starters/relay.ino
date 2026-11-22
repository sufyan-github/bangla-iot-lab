// রিলে দিয়ে বাতি জ্বালাও-নেভাও (Relay module) — ESP32 বোর্ড
// রিলে মডিউল: VCC→VIN, GND→GND, IN→D26, জাম্পার H-এ।
// বাতির সার্কিট আলাদা: ব্যাটারির + থেকে COM, NO থেকে ২২০ Ω হয়ে LED, LED থেকে ব্যাটারির −।

const int relayPin = 26;

void setup() {
  pinMode(relayPin, OUTPUT);
  Serial.begin(115200);
}

void loop() {
  digitalWrite(relayPin, HIGH);     // জাম্পার H-এ: HIGH মানে রিলে চালু
  Serial.println("রিলে চালু: বাতি জ্বলছে");
  delay(2000);
  digitalWrite(relayPin, LOW);
  Serial.println("রিলে বন্ধ: বাতি নিভেছে");
  delay(2000);
}
