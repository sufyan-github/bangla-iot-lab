// বোতাম চাপলে LED জ্বলবে (Button) — ESP32 বোর্ড
// বোতামের এক পা D4 পিনে, অন্য পা GND-তে লাগাও। LED থাকবে D2 পিনে।

const int buttonPin = 4;
const int ledPin = 2;

void setup() {
  pinMode(buttonPin, INPUT_PULLUP);  // না চাপলে পিন HIGH থাকে
  pinMode(ledPin, OUTPUT);
}

void loop() {
  if (digitalRead(buttonPin) == LOW) {   // চাপলে পিন LOW হয়
    digitalWrite(ledPin, HIGH);
  } else {
    digitalWrite(ledPin, LOW);
  }
  delay(10);
}
