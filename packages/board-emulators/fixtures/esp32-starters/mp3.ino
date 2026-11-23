// MP3 প্লেয়ার: চালু হলে প্রথম গান বাজে, D4-এর বোতাম চাপলে পরের গান।
// DFPlayer-এর TX যাবে বোর্ডের RX2-তে (GPIO16), RX যাবে TX2-তে (GPIO17): আড়াআড়ি।
#include <DFRobotDFPlayerMini.h>

HardwareSerial mp3Serial(2);
DFRobotDFPlayerMini player;
const int BUTTON_PIN = 4;      // বোতামের অন্য পা GND-তে
bool wasPressed = false;

void setup() {
  Serial.begin(115200);
  mp3Serial.begin(9600, SERIAL_8N1, 16, 17);
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  Serial.println("MP3 প্লেয়ার খুঁজছে...");
  if (!player.begin(mp3Serial)) {   // প্লেয়ারকে নতুন করে চালু করে, কার্ড পড়া পর্যন্ত অপেক্ষা করে
    Serial.println("প্লেয়ার সাড়া দিচ্ছে না: TX আর RX আড়াআড়ি কি না, VCC-তে বিদ্যুৎ আছে কি না দেখো");
    while (true) delay(1000);
  }
  Serial.print("প্লেয়ার তৈরি, কার্ডে গান আছে: ");
  Serial.println(player.readFileCounts());
  player.volume(20);               // ০ থেকে ৩০
  player.play(1);
  Serial.println("গান 1 বাজছে");
}

void loop() {
  bool pressed = digitalRead(BUTTON_PIN) == LOW;
  if (pressed && !wasPressed) {    // চাপ দেওয়ার মুহূর্তে একবারই
    player.next();
    Serial.print("গান ");
    Serial.print(player.readCurrentFileNumber());
    Serial.println(" বাজছে");
  }
  wasPressed = pressed;

  // প্লেয়ার নিজে থেকে কিছু বললে (যেমন গান শেষ), সেটা দেখাও
  if (player.available() && player.readType() == DFPlayerPlayFinished) {
    Serial.print("গান ");
    Serial.print(player.read());
    Serial.println(" শেষ হলো");
  }
  delay(20);
}
