// দুই বোর্ডের কথা: পাঠানোর বোর্ড — ESP32
// এই বোর্ডের TX2 (GPIO17) যাবে অন্য বোর্ডের RX2-তে (GPIO16), আর দুই বোর্ডের GND একসাথে।
// প্রতি সেকেন্ডে একটা করে সংখ্যা পাঠায়।

HardwareSerial link(2);   // দ্বিতীয় সিরিয়াল পোর্ট: অন্য বোর্ডের সাথে
int count = 0;

void setup() {
  Serial.begin(115200);
  link.begin(9600, SERIAL_8N1, 16, 17);   // দুই বোর্ডে একই বড রেট হতে হবে
  Serial.println("পাঠানোর বোর্ড চালু");
}

void loop() {
  count++;
  link.print("count ");
  link.println(count);
  Serial.print("পাঠালাম: ");
  Serial.println(count);
  delay(1000);
}
