// তিন রং মিশিয়ে নানা রং বানাও (RGB LED) — ESP32 বোর্ড
// R, G, B পা তিনটি আলাদা রেজিস্টর (২২০ Ω) হয়ে D25, D26, D27 পিনে যাবে।
// − পা যাবে GND-তে।

const int redPin = 25;
const int greenPin = 26;
const int bluePin = 27;

// প্রতিটি রঙের মান ০ (নেভানো) থেকে ২৫৫ (পুরো উজ্জ্বল)
void showColour(int red, int green, int blue) {
  analogWrite(redPin, red);
  analogWrite(greenPin, green);
  analogWrite(bluePin, blue);
}

void setup() {
  pinMode(redPin, OUTPUT);
  pinMode(greenPin, OUTPUT);
  pinMode(bluePin, OUTPUT);
}

void loop() {
  showColour(255, 0, 0);     // লাল
  delay(1000);
  showColour(0, 255, 0);     // সবুজ
  delay(1000);
  showColour(0, 0, 255);     // নীল
  delay(1000);
  showColour(255, 255, 0);   // লাল + সবুজ = হলুদ
  delay(1000);
  showColour(0, 255, 255);   // সবুজ + নীল = আকাশি
  delay(1000);
  showColour(255, 0, 255);   // লাল + নীল = বেগুনি
  delay(1000);
  showColour(255, 255, 255); // তিনটি মিলে সাদা
  delay(1000);
}
