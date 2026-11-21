// Counts presses of a button to ground, ignoring contact bounce.
const int BUTTON = 17, LAMP = 25;
const unsigned long SETTLE_MS = 30;
int stable = HIGH, last = HIGH, presses = 0;
unsigned long changedAt = 0;
void setup() {
  Serial.begin(115200);
  pinMode(BUTTON, INPUT_PULLUP);
  pinMode(LAMP, OUTPUT);
}
void loop() {
  int now = digitalRead(BUTTON);
  if (now != last) { changedAt = millis(); last = now; }
  if (millis() - changedAt > SETTLE_MS && now != stable) {
    stable = now;
    if (stable == LOW) {
      presses++;
      digitalWrite(LAMP, presses % 2);
      Serial.printf("press %d\n", presses);
    }
  }
}
