// সার্ভো মোটর এদিক-ওদিক ঘোরাও (Servo sweep)
// সার্ভোর সিগন্যাল তার ৯ নম্বর পিনে, লাল তার 5V-তে, বাদামি তার GND-তে লাগাও।

#include <Servo.h>

Servo myServo;

void setup() {
  myServo.attach(9);   // সার্ভো ৯ নম্বর পিনে আছে
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
