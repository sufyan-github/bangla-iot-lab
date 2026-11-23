// SMS দিয়ে বাতি: ফোন থেকে "ON" পাঠালে D2-এর বাতি জ্বলে, "OFF" পাঠালে নেভে,
// আর মডিউল উত্তরে একটা SMS পাঠায়। SIM800L-এর TXD যাবে RX2-তে (GPIO16), RXD যাবে TX2-তে (GPIO17)।
// SIM800L-এর VCC-তে ৩.৪ থেকে ৪.৪ V লাগে: একটা 18650 সেল দাও, GND বোর্ডের সাথে এক করো।

HardwareSerial gsm(2);
const int LED_PIN = 2;
const char* PHONE = "+8801000000000";   // ল্যাবের ফোনের নম্বর: আসল নম্বর নয়

// একটা AT কমান্ড পাঠাও, আর কিছুক্ষণ ধরে যা উত্তর আসে তা জমাও
String ask(const char* command, unsigned long waitMs = 500) {
  gsm.println(command);
  String reply;
  unsigned long started = millis();
  while (millis() - started < waitMs) {
    while (gsm.available()) reply += (char)gsm.read();
    delay(10);
  }
  return reply;
}

void sendSms(const char* text) {
  gsm.print("AT+CMGS=\"");
  gsm.print(PHONE);
  gsm.println("\"");
  delay(300);                 // মডিউল "> " লিখে লেখার জন্য অপেক্ষা করে
  gsm.print(text);
  gsm.write(26);              // Ctrl+Z: লেখা শেষ, পাঠাও
  String reply;
  unsigned long started = millis();
  while (millis() - started < 10000 && reply.indexOf("OK") < 0 && reply.indexOf("ERROR") < 0) {
    while (gsm.available()) reply += (char)gsm.read();
    delay(10);
  }
  Serial.println(reply.indexOf("+CMGS") >= 0 ? "SMS পাঠানো হলো" : "SMS যায়নি");
}

void setup() {
  Serial.begin(115200);
  gsm.begin(9600, SERIAL_8N1, 16, 17);
  pinMode(LED_PIN, OUTPUT);
  delay(1000);
  if (ask("AT").indexOf("OK") < 0) {
    Serial.println("মডিউল সাড়া দিচ্ছে না: বিদ্যুৎ আর TX/RX দেখো");
  }
  ask("ATE0");                // যা পাঠাই তা ফেরত দিও না
  ask("AT+CMGF=1");           // লেখা হিসেবে SMS (text mode)
  ask("AT+CNMI=2,2,0,0,0");   // নতুন SMS সরাসরি বোর্ডে পাঠাও

  Serial.println("নেটওয়ার্ক খুঁজছে...");
  bool registered = false;
  for (int i = 0; i < 20 && !registered; i++) {
    registered = ask("AT+CREG?").indexOf("+CREG: 0,1") >= 0;
  }
  if (!registered) {
    Serial.println("নেটওয়ার্ক পাওয়া যায়নি: সংকেত (signal) দেখো");
    return;
  }
  Serial.println("নেটওয়ার্ক পাওয়া গেছে");
  sendSms("Light controller ready. Send ON or OFF.");
}

void loop() {
  if (!gsm.available()) return;
  String line = gsm.readStringUntil('\n');
  line.trim();
  if (!line.startsWith("+CMT:")) return;   // নতুন SMS: পরের লাইনে তার লেখা
  String text = gsm.readStringUntil('\n');
  text.trim();
  text.toUpperCase();
  Serial.print("SMS এসেছে: ");
  Serial.println(text);
  if (text == "ON") {
    digitalWrite(LED_PIN, HIGH);
    sendSms("Light is ON");
  } else if (text == "OFF") {
    digitalWrite(LED_PIN, LOW);
    sendSms("Light is OFF");
  } else {
    sendSms("Send ON or OFF");
  }
}
