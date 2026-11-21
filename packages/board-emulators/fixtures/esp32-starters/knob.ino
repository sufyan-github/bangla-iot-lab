// নব ঘুরিয়ে LED-র উজ্জ্বলতা বদলাও (Knob) — ESP32 বোর্ড
// পটেনশিওমিটারের মাঝের পা D34-এ, দুই পাশের পা 3V3 আর GND-তে লাগাও।
// মনে রেখো: ESP32-র পিনে 5 V দেওয়া যাবে না।

const int knobPin = 34;
const int ledPin = 2;

void setup() {
  pinMode(ledPin, OUTPUT);
  Serial.begin(115200);
}

void loop() {
  int value = analogRead(knobPin);    // ০ থেকে ৪০৯৫
  analogWrite(ledPin, value / 16);    // ০ থেকে ২৫৫
  Serial.println(value);              // সিরিয়াল মনিটরে মান দেখাও
  delay(100);
}
