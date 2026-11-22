// বাধা এড়ানো রোবট (Obstacle-avoiding robot) — ESP32 বোর্ড
// সামনে পথ খোলা থাকলে দুই চাকা সামনে ঘোরে। ২৫ সেমির কাছে বাধা এলে
// রোবট একটু পিছায়, তারপর ঘুরে নতুন পথ নেয়।
// ব্যাটারি: +→ড্রাইভারের 12V, −→ড্রাইভারের GND; বোর্ডের GND-ও ড্রাইভারের GND-তে।
// ড্রাইভার: IN1→D26, IN2→D27, IN3→D32, IN4→D33 (ENA আর ENB-র জাম্পার লাগানো থাকবে)।
// বাঁ মোটর OUT1/OUT2-তে, ডান মোটর OUT3/OUT4-তে।
// আলট্রাসনিক: VCC→VIN, Trig→D5, GND→GND; Echo থেকে ১ kΩ হয়ে D18, D18 থেকে ২ kΩ হয়ে GND।

const int in1 = 26, in2 = 27;      // বাঁ চাকা
const int in3 = 32, in4 = 33;      // ডান চাকা
const int trigPin = 5;
const int echoPin = 18;
const int SAFE_DISTANCE = 25;      // সেমি
String lastState = "";

void wheels(int a, int b, int c, int d) {
  digitalWrite(in1, a);
  digitalWrite(in2, b);
  digitalWrite(in3, c);
  digitalWrite(in4, d);
}
void forward()  { wheels(HIGH, LOW, HIGH, LOW); }
void backward() { wheels(LOW, HIGH, LOW, HIGH); }
void turn()     { wheels(HIGH, LOW, LOW, HIGH); }   // বাঁ চাকা সামনে, ডান চাকা পেছনে

long readDistance() {
  digitalWrite(trigPin, LOW);
  delayMicroseconds(2);
  digitalWrite(trigPin, HIGH);
  delayMicroseconds(10);
  digitalWrite(trigPin, LOW);
  return pulseIn(echoPin, HIGH, 30000) / 58;
}

void report(String state) {
  if (state != lastState) {
    Serial.println(state);
    lastState = state;
  }
}

void setup() {
  pinMode(in1, OUTPUT);
  pinMode(in2, OUTPUT);
  pinMode(in3, OUTPUT);
  pinMode(in4, OUTPUT);
  pinMode(trigPin, OUTPUT);
  pinMode(echoPin, INPUT);
  Serial.begin(115200);
}

void loop() {
  long cm = readDistance();
  if (cm == 0 || cm > SAFE_DISTANCE) {
    forward();
    report("পথ খোলা: সামনে চলছি");
  } else {
    report("বাধা! পিছিয়ে ঘুরছি");
    backward();
    delay(500);
    turn();
    delay(400);
    lastState = "";
  }
  delay(50);
}
