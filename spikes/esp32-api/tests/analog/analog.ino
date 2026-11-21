// Reads a voltage and turns a lamp on above a level, with different levels for on and off.
const int SENSE = 34, LAMP = 26;
bool on = false;
void setup() { Serial.begin(115200); pinMode(LAMP, OUTPUT); analogReadResolution(12); }
void loop() {
  int raw = analogRead(SENSE);
  int mv = analogReadMilliVolts(SENSE);
  int percent = constrain(map(raw, 0, 4095, 0, 100), 0, 100);
  if (!on && raw > 3000) on = true;
  if (on && raw < 2000) on = false;
  digitalWrite(LAMP, on);
  Serial.printf("raw %d mv %d percent %d\n", raw, mv, percent);
  delay(100);
}
