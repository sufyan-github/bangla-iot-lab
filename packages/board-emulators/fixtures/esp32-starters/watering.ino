// গাছে নিজে নিজে পানি দাও (Automatic watering) — ESP32 বোর্ড
// মাটি শুকালে রিলে পাম্প চালু করে; যথেষ্ট ভিজলে বন্ধ করে।
// মাটির সেন্সর: VCC→3V3, আউটপুট→D34, GND→GND।
// রিলে মডিউল: VCC→VIN, GND→GND, IN→D26, জাম্পার H-এ।
// পাম্প (মোটর) আলাদা ব্যাটারিতে: ব্যাটারির + থেকে COM, NO থেকে পাম্প, পাম্প থেকে ব্যাটারির −।

const int soilPin = 34;
const int relayPin = 26;
const int DRY_LEVEL = 3000;   // এর বেশি হলে মাটি শুকনো: পাম্প চালু
const int WET_LEVEL = 2500;   // এর কম হলে মাটি ভেজা: পাম্প বন্ধ
bool pumping = false;

void setup() {
  pinMode(relayPin, OUTPUT);
  digitalWrite(relayPin, LOW);
  Serial.begin(115200);
  Serial.println("মাটি দেখছি...");
}

void loop() {
  int soil = analogRead(soilPin);
  // দুটো আলাদা সীমা: মান সীমার কাছে কাঁপলেও পাম্প বারবার চালু-বন্ধ হবে না।
  if (!pumping && soil > DRY_LEVEL) {
    pumping = true;
    digitalWrite(relayPin, HIGH);
    Serial.println("মাটি শুকনো: পাম্প চালু");
  } else if (pumping && soil < WET_LEVEL) {
    pumping = false;
    digitalWrite(relayPin, LOW);
    Serial.println("মাটি ভেজা: পাম্প বন্ধ");
  }
  delay(500);
}
