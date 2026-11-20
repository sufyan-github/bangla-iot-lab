// আলট্রাসনিক সেন্সর দিয়ে দূরত্ব মাপো (Distance)
// Trig ৭ নম্বর পিনে, Echo ৬ নম্বর পিনে, VCC 5V-তে, GND GND-তে লাগাও।

const int trigPin = 7;
const int echoPin = 6;

void setup() {
  pinMode(trigPin, OUTPUT);
  pinMode(echoPin, INPUT);
  Serial.begin(9600);
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
