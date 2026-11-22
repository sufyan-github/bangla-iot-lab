// সার্ভো মোটর এদিক-ওদিক ঘোরাও (Servo sweep) — ESP32 বোর্ড
// সার্ভোর সিগন্যাল তার D13 পিনে, লাল তার VIN-এ (5 V), বাদামি তার GND-তে লাগাও।

#include <ESP32Servo.h>

Servo myServo;

void setup() {
  myServo.attach(13);   // সার্ভো D13 পিনে আছে
}

void loop() {
  for (int angle = 0; angle <= 180; angle += 10) {   // ০ থেকে ১৮০ ডিগ্রি
    myServo.write(angle);
    delay(100);
  }
  for (int angle = 180; angle >= 0; angle -= 10) {   // আবার ফিরে আসো
    myServo.write(angle);
    delay(100);
  }
}
