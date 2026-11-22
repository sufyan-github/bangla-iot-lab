// স্মার্ট ডাস্টবিন (Smart dustbin) — ESP32 বোর্ড
// হাত কাছে এলে ঢাকনা নিজে খোলে, তিন সেকেন্ড পর বন্ধ হয়।
// আলট্রাসনিক সেন্সর: VCC→VIN, Trig→D5, GND→GND।
// Echo থেকে ১ kΩ হয়ে D18-এ, আর D18 থেকে ২ kΩ হয়ে GND-তে।
// সার্ভো (ঢাকনা): GND→GND, VCC→VIN, সংকেত→D13। বাজার: +→D25, −→GND।

#include <ESP32Servo.h>

const int trigPin = 5;
const int echoPin = 18;
const int servoPin = 13;
const int buzzerPin = 25;
const int OPEN_DISTANCE = 20;      // এর চেয়ে কাছে হাত এলে ঢাকনা খুলবে (সেমি)
Servo lid;

long readDistance() {
  digitalWrite(trigPin, LOW);
  delayMicroseconds(2);
  digitalWrite(trigPin, HIGH);
  delayMicroseconds(10);
  digitalWrite(trigPin, LOW);
  long duration = pulseIn(echoPin, HIGH, 30000);  // সর্বোচ্চ ৩০ মিলিসেকেন্ড অপেক্ষা
  return duration / 58;                           // ০ মানে কিছু পাওয়া যায়নি
}

void setup() {
  pinMode(trigPin, OUTPUT);
  pinMode(echoPin, INPUT);
  pinMode(buzzerPin, OUTPUT);
  lid.attach(servoPin);
  lid.write(0);                    // ঢাকনা বন্ধ
  Serial.begin(115200);
}

void loop() {
  long cm = readDistance();
  if (cm > 0 && cm < OPEN_DISTANCE) {
    Serial.println("হাত এসেছে: ঢাকনা খুলছে");
    digitalWrite(buzzerPin, HIGH);
    delay(100);
    digitalWrite(buzzerPin, LOW);
    lid.write(90);                 // ঢাকনা খোলো
    delay(3000);
    lid.write(0);                  // আবার বন্ধ
    Serial.println("ঢাকনা বন্ধ");
  }
  delay(200);
}
