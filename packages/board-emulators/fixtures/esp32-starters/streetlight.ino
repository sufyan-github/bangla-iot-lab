// রাস্তার স্মার্ট বাতি (Smart street light) — ESP32 বোর্ড
// দিনে বাতি বন্ধ; রাতে কম আলো; রাতে কেউ এলে পুরো আলো।
// LDR মডিউল: VCC→3V3, GND→GND, DO→D27, AO→D34।
// PIR সেন্সর: VCC→VIN, OUT→D26, GND→GND।
// বাতি (LED): D25 থেকে ২২০ Ω হয়ে LED-র লম্বা পায়ে, ছোট পা GND-তে।

const int darkPin = 27;    // LDR মডিউলের DO: অন্ধকারে HIGH
const int motionPin = 26;  // PIR-এর OUT: কেউ নড়লে HIGH
const int lampPin = 25;
const int DIM = 40;        // রাতে কেউ না থাকলে উজ্জ্বলতা (০–২৫৫)
const int BRIGHT = 255;    // কেউ এলে উজ্জ্বলতা
String lastState = "";

// অবস্থা বদলালে একবারই সিরিয়াল মনিটরে লেখো
void report(String state) {
  if (state != lastState) {
    Serial.println(state);
    lastState = state;
  }
}

void setup() {
  pinMode(darkPin, INPUT);
  pinMode(motionPin, INPUT);
  pinMode(lampPin, OUTPUT);
  Serial.begin(115200);
}

void loop() {
  bool dark = digitalRead(darkPin) == HIGH;
  bool motion = digitalRead(motionPin) == HIGH;
  if (!dark) {
    analogWrite(lampPin, 0);
    report("দিনের আলো: বাতি বন্ধ");
  } else if (motion) {
    analogWrite(lampPin, BRIGHT);
    report("কেউ আসছে: পুরো আলো");
  } else {
    analogWrite(lampPin, DIM);
    report("রাত, কেউ নেই: কম আলো");
  }
  delay(100);
}
