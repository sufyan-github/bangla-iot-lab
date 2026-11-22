// মোটর সামনে আর পেছনে ঘোরাও (L298N motor driver) — ESP32 বোর্ড
// ব্যাটারির + যাবে মডিউলের 12V-তে, − যাবে GND-তে। বোর্ডের GND-ও মডিউলের GND-তে লাগাও।
// ENA-র জাম্পার খুলে ফেলো। ENA যাবে D25-এ, IN1 যাবে D26-এ, IN2 যাবে D27-এ।
// মোটরের দুই তার যাবে OUT1 আর OUT2-তে।

const int speedPin = 25;   // ENA: গতি (০ থেকে ২৫৫)
const int in1 = 26;        // IN1 আর IN2: কোন দিকে ঘুরবে
const int in2 = 27;

void forward(int speed) {
  digitalWrite(in1, HIGH);
  digitalWrite(in2, LOW);
  analogWrite(speedPin, speed);
}

void backward(int speed) {
  digitalWrite(in1, LOW);
  digitalWrite(in2, HIGH);
  analogWrite(speedPin, speed);
}

void stopMotor() {
  digitalWrite(in1, LOW);
  digitalWrite(in2, LOW);
  analogWrite(speedPin, 0);
}

void setup() {
  pinMode(speedPin, OUTPUT);
  pinMode(in1, OUTPUT);
  pinMode(in2, OUTPUT);
  Serial.begin(115200);
}

void loop() {
  Serial.println("সামনে, পুরো গতিতে");
  forward(255);
  delay(2000);
  Serial.println("থামো");
  stopMotor();
  delay(1000);
  Serial.println("পেছনে, অর্ধেক গতিতে");
  backward(128);
  delay(2000);
  Serial.println("থামো");
  stopMotor();
  delay(1000);
}
