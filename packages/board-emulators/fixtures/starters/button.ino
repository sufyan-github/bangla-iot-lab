// বোতাম চাপলে LED জ্বলবে (Button)
// বোতামের এক পা ২ নম্বর পিনে, অন্য পা GND-তে লাগাও।

const int buttonPin = 2;
const int ledPin = 13;

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
}
