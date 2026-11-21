// Counts falling edges with an interrupt, and separately those further apart than 30 ms.
const int BUTTON = 17;
volatile unsigned long edges = 0, presses = 0, lastAt = 0;
void IRAM_ATTR onFall() {
  unsigned long now = micros();
  edges++;
  if (now - lastAt > 30000) { presses++; lastAt = now; }
}
void setup() {
  Serial.begin(115200);
  pinMode(BUTTON, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(BUTTON), onFall, FALLING);
}
void loop() {
  static unsigned long shown = 0;
  noInterrupts();
  unsigned long e = edges, p = presses;
  interrupts();
  if (e != shown) { Serial.printf("edges %lu presses %lu\n", e, p); shown = e; }
  delay(50);
}
