// Answers each line typed into the serial monitor.
void setup() { Serial.begin(115200); Serial.println("ready"); }
void loop() {
  if (Serial.available() > 0) {
    String line = Serial.readStringUntil('\n');
    line.trim();
    String loud = line;
    loud.toUpperCase();
    Serial.print("got: ");
    Serial.println(loud);
    Serial.printf("length %d, number %ld, starts with s: %d\n", line.length(), line.toInt(), line.startsWith("s"));
    Serial.println(String("joined ") + line.substring(0, 3) + "/" + String(3.14159, 2) + "/" + String(255, HEX));
    // The board writes other bases two ways: String in small letters, print in capitals.
    Serial.print("bases ");
    Serial.print(255, HEX);
    Serial.print(' ');
    Serial.print(-1, HEX);
    Serial.print(' ');
    Serial.print(5, BIN);
    Serial.print(' ');
    Serial.println(String(-1, HEX));
  }
}
