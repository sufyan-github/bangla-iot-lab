// One lamp on analogWrite, one on a PWM channel, and a frequency the timer cannot reach.
const int EASY = 2, FINE = 25, BITS = 12;
void setup() {
  Serial.begin(115200);
  Serial.printf("attach %d\n", ledcAttach(FINE, 5000, BITS));
  Serial.printf("too fast %lu\n", (unsigned long)ledcChangeFrequency(FINE, 40000, BITS));
  Serial.printf("fits %lu\n", (unsigned long)ledcChangeFrequency(FINE, 19531, BITS));
}
void loop() {
  unsigned long t = millis() % 1000;
  analogWrite(EASY, t * 255 / 1000);
  ledcWrite(FINE, t * 4095 / 1000);
  delay(10);
}
