// দুই বোর্ডের কথা: শোনার বোর্ড — ESP32
// এই বোর্ডের RX2 (GPIO16) যাবে অন্য বোর্ডের TX2-তে (GPIO17), আর দুই বোর্ডের GND একসাথে।
// প্রতিটা বার্তা এলে D2-এর LED একবার জ্বলে-নেভে।

HardwareSerial link(2);   // দ্বিতীয় সিরিয়াল পোর্ট: অন্য বোর্ডের সাথে
const int LED_PIN = 2;
bool lit = false;

void setup() {
  Serial.begin(115200);
  link.begin(9600, SERIAL_8N1, 16, 17);   // দুই বোর্ডে একই বড রেট হতে হবে
  pinMode(LED_PIN, OUTPUT);
  Serial.println("শোনার বোর্ড চালু");
}

void loop() {
  if (link.available()) {
    String line = link.readStringUntil('\n');
    line.trim();
    Serial.print("পেলাম: ");
    Serial.println(line);
    lit = !lit;
    digitalWrite(LED_PIN, lit ? HIGH : LOW);
  }
}
