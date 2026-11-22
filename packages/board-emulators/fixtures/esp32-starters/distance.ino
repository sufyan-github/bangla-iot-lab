// আলট্রাসনিক সেন্সর দিয়ে দূরত্ব মাপো (Distance) — ESP32 বোর্ড
// Trig D5 পিনে, VCC VIN-এ (5 V), GND GND-তে লাগাও।
// Echo পিন 5 V দেয়, কিন্তু ESP32-র পিন সর্বোচ্চ 3.3 V নিতে পারে। তাই:
// Echo থেকে 1 kΩ রেজিস্টর হয়ে D18-এ, আর D18 থেকে 2 kΩ রেজিস্টর হয়ে GND-তে লাগাও।

const int trigPin = 5;
const int echoPin = 18;

void setup() {
  pinMode(trigPin, OUTPUT);
  pinMode(echoPin, INPUT);
  Serial.begin(115200);
}

void loop() {
  digitalWrite(trigPin, LOW);
  delayMicroseconds(2);
  digitalWrite(trigPin, HIGH);          // ১০ মাইক্রোসেকেন্ডের শব্দ-সংকেত পাঠাও
  delayMicroseconds(10);
  digitalWrite(trigPin, LOW);

  long duration = pulseIn(echoPin, HIGH);   // প্রতিধ্বনি ফিরতে কত সময় লাগল
  long distance = duration / 58;            // সেন্টিমিটারে দূরত্ব

  Serial.println(distance);
  delay(200);
}
