// Times an echo pulse, as an ultrasonic sensor is read.
const int TRIG = 18, ECHO = 19;
void setup() { Serial.begin(115200); pinMode(TRIG, OUTPUT); pinMode(ECHO, INPUT); }
void loop() {
  digitalWrite(TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG, LOW);
  unsigned long us = pulseIn(ECHO, HIGH, 30000);
  if (us == 0) Serial.println("no echo");
  else Serial.printf("%lu us, %.1f cm\n", us, us * 0.0343 / 2);
  delay(100);
}
