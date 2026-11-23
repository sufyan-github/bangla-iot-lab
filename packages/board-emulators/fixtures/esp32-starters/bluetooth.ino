// ব্লুটুথে বাতি: ফোন থেকে "1" পাঠালে D2-এর LED জ্বলে, "0" পাঠালে নেভে।
// HC-05-এর TXD যাবে বোর্ডের RX2-তে (GPIO16), RXD যাবে TX2-তে (GPIO17): আড়াআড়ি।

HardwareSerial bt(2);          // ESP32-এর দ্বিতীয় সিরিয়াল পোর্ট
const int LED_PIN = 2;

void setup() {
  Serial.begin(115200);
  bt.begin(9600, SERIAL_8N1, 16, 17);   // HC-05 কারখানা থেকে ৯৬০০ বডে আসে
  pinMode(LED_PIN, OUTPUT);
  Serial.println("ব্লুটুথ চালু: ফোন থেকে 1 বা 0 পাঠাও");
  bt.println("হ্যালো! 1 পাঠালে বাতি জ্বলবে, 0 পাঠালে নিভবে");
}

void loop() {
  if (bt.available()) {
    String command = bt.readStringUntil('\n');   // ফোন প্রতিটা লাইনের শেষে নতুন লাইন পাঠায়
    command.trim();
    Serial.print("ফোন বলল: ");
    Serial.println(command);
    if (command == "1") {
      digitalWrite(LED_PIN, HIGH);
      bt.println("বাতি জ্বলছে");
    } else if (command == "0") {
      digitalWrite(LED_PIN, LOW);
      bt.println("বাতি নিভেছে");
    } else {
      bt.println("বুঝিনি: 1 বা 0 পাঠাও");
    }
  }
}
