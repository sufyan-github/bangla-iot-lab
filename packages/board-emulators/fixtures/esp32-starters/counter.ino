// বোর্ড কতবার চালু হলো, মনে রাখো (Saved settings) — ESP32 বোর্ড
// সাধারণ চলক বিদ্যুৎ গেলে মুছে যায়; Preferences ফ্ল্যাশে লিখে রাখে, তাই মনে থাকে।
// বোতাম D4 আর GND-র মাঝে: চাপলে গণনা মুছে যায়।

#include <Preferences.h>

const int buttonPin = 4;
Preferences memory;

void setup() {
  pinMode(buttonPin, INPUT_PULLUP);
  Serial.begin(115200);
  memory.begin("lab", false);                 // "lab" নামের জায়গাটা খোলো, লেখার জন্য
  int starts = memory.getInt("starts", 0);    // আগে না থাকলে ০
  starts = starts + 1;
  memory.putInt("starts", starts);            // নতুন সংখ্যা ফ্ল্যাশে লিখে রাখো
  Serial.print("বোর্ড চালু হয়েছে ");
  Serial.print(starts);
  Serial.println(" বার");
}

void loop() {
  if (digitalRead(buttonPin) == LOW) {
    memory.clear();                           // এই জায়গার সব মুছে ফেলো
    Serial.println("গণনা মুছে ফেলা হলো");
    while (digitalRead(buttonPin) == LOW) {
      delay(10);                              // বোতাম ছাড়া পর্যন্ত অপেক্ষা করো
    }
  }
  delay(20);
}
