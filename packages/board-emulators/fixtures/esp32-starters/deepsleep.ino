// ডিপ স্লিপ: ঘুম থেকে জেগে আবার শুরু — ESP32 বোর্ড
// বোর্ড কাজ সেরে ৫ সেকেন্ড ঘুমায়। জেগে উঠলে প্রোগ্রাম setup() থেকে আবার শুরু হয়:
// সাধারণ চলক মুছে যায়, শুধু RTC_DATA_ATTR দেওয়া চলক মনে থাকে।
// D2-এর LED জেগে থাকার সময়টুকু জ্বলে।

RTC_DATA_ATTR int wakeCount = 0;   // ঘুমের পরেও মনে থাকে
int ordinary = 0;                  // প্রতিবার জেগে আবার শূন্য

const int LED_PIN = 2;

void setup() {
  Serial.begin(115200);
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, HIGH);

  wakeCount++;
  ordinary++;
  Serial.print("জেগেছি, বার: ");
  Serial.print(wakeCount);
  Serial.print(", সাধারণ চলক: ");
  Serial.println(ordinary);
  if (esp_sleep_get_wakeup_cause() == ESP_SLEEP_WAKEUP_TIMER) {
    Serial.println("টাইমারে জাগলাম");
  } else {
    Serial.println("প্রথমবার চালু হলাম");
  }

  delay(1000);                                // কাজের সময়
  Serial.println("৫ সেকেন্ড ঘুমাতে যাচ্ছি");
  esp_sleep_enable_timer_wakeup(5000000ULL);  // মাইক্রোসেকেন্ডে: ৫ সেকেন্ড
  esp_deep_sleep_start();                     // এখান থেকে আর ফেরে না
}

void loop() {
  // ডিপ স্লিপের প্রোগ্রামে loop() চলে না: প্রতিবার setup() থেকেই শুরু।
}
