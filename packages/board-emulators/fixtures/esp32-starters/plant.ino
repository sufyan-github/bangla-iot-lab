// গাছের যত্ন (Plant monitor) — ESP32 বোর্ড
// মাটির আর্দ্রতা, তাপমাত্রা আর বাতাসের আর্দ্রতা মেপে ডিসপ্লেতে দেখাও।
// মাটি শুকনো হলে RGB LED লাল, ঠিক থাকলে সবুজ।
// মাটির সেন্সর: VCC→3V3, আউটপুট→D34, GND→GND। DHT11: VCC→3V3, DATA→D4, GND→GND।
// OLED: GND→GND, VCC→3V3, SCL→D22, SDA→D21।
// RGB LED: R, G, B প্রতিটা ২২০ Ω হয়ে D25, D26, D27-এ; − পা GND-তে।

#include <DHT.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

const int soilPin = 34;
const int redPin = 25;
const int greenPin = 26;
const int bluePin = 27;
const int DRY_LEVEL = 3000;        // এর বেশি হলে মাটি শুকনো
DHT dht(4, DHT11);
Adafruit_SSD1306 display(128, 64, &Wire, -1);

void setup() {
  pinMode(redPin, OUTPUT);
  pinMode(greenPin, OUTPUT);
  pinMode(bluePin, OUTPUT);
  Serial.begin(115200);
  dht.begin();
  display.begin(SSD1306_SWITCHCAPVCC, 0x3C);
  display.setTextColor(SSD1306_WHITE);
}

void loop() {
  int soil = analogRead(soilPin);
  float celsius = dht.readTemperature();
  float humidity = dht.readHumidity();
  bool dry = soil > DRY_LEVEL;

  digitalWrite(redPin, dry ? HIGH : LOW);     // শুকনো: লাল
  digitalWrite(greenPin, dry ? LOW : HIGH);   // ঠিক আছে: সবুজ
  digitalWrite(bluePin, LOW);

  display.clearDisplay();
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.println("Plant monitor");
  display.print("Soil: ");
  display.println(soil);
  display.print("Temp: ");
  display.print(celsius, 0);
  display.println(" C");
  display.print("Humidity: ");
  display.print(humidity, 0);
  display.println(" %");
  display.setTextSize(2);
  display.setCursor(0, 44);
  display.println(dry ? "WATER ME" : "OK");
  display.display();

  Serial.print("মাটি: ");
  Serial.print(soil);
  Serial.print(", তাপমাত্রা: ");
  Serial.print(celsius, 0);
  Serial.print(" °C, আর্দ্রতা: ");
  Serial.print(humidity, 0);
  Serial.println(dry ? " %  পানি দাও!" : " %  গাছ ভালো আছে");
  delay(2000);                     // DHT11 দুই সেকেন্ডে একবার পড়া যায়
}
