// নব ঘুরিয়ে LED-র উজ্জ্বলতা বদলাও (Knob)
// পটেনশিওমিটারের মাঝের পা A0-তে, দুই পাশের পা 5V আর GND-তে লাগাও।

const int knobPin = A0;
const int ledPin = 9;

void setup() {
  pinMode(ledPin, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  int value = analogRead(knobPin);    // ০ থেকে ১০২৩
  analogWrite(ledPin, value / 4);     // ০ থেকে ২৫৫
  Serial.println(value);              // সিরিয়াল মনিটরে মান দেখাও
  delay(100);
}
