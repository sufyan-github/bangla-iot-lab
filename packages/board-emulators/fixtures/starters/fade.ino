// LED ধীরে ধীরে উজ্জ্বল ও ম্লান হবে (Fade)
// LED-র লম্বা পা রেজিস্টর হয়ে ৯ নম্বর পিনে, ছোট পা GND-তে লাগাও।

const int ledPin = 9;      // ~ চিহ্ন দেওয়া পিনে PWM চলে
int brightness = 0;
int step = 5;

void setup() {
  pinMode(ledPin, OUTPUT);
}

void loop() {
  analogWrite(ledPin, brightness);   // ০ (নেভানো) থেকে ২৫৫ (পুরো উজ্জ্বল)
  brightness = brightness + step;
  if (brightness <= 0 || brightness >= 255) {
    step = -step;                    // দিক বদলাও
  }
  delay(30);
}
