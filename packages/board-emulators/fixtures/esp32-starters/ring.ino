// WS2812B LED রিং দিয়ে মিটার — ESP32 বোর্ড
// নব ঘোরালে কয়টা LED জ্বলবে তা বদলায়: শুরুর দিকে সবুজ, শেষের দিকে লাল।
// রিংয়ের VCC যাবে VIN-এ (৫ V), GND যাবে GND-তে, DIN যাবে D4-এ।
// পটেনশিওমিটারের দুই পাশ 3V3 আর GND-তে, মাঝের পা D34-এ।

#include <Adafruit_NeoPixel.h>

const int RING_PIN = 4;    // রিংয়ের DIN
const int LED_COUNT = 12;  // রিংয়ে কয়টা LED
const int KNOB_PIN = 34;   // পটেনশিওমিটারের মাঝের পা

Adafruit_NeoPixel ring(LED_COUNT, RING_PIN, NEO_GRB + NEO_KHZ800);
int shown = -1;

void setup() {
  Serial.begin(115200);
  ring.begin();
  ring.setBrightness(60);  // LED খুব উজ্জ্বল: ২৫৫-এর মধ্যে ৬০-ই যথেষ্ট
  ring.show();             // শুরুতে সব নেভানো
}

void loop() {
  int level = map(analogRead(KNOB_PIN), 0, 4095, 0, LED_COUNT);
  for (int i = 0; i < LED_COUNT; i++) {
    if (i < level) {
      // রঙের চাকায় সবুজ (তিন ভাগের এক ভাগ ঘুরে) থেকে লাল পর্যন্ত
      uint16_t hue = 21845 - 21845L * i / (LED_COUNT - 1);
      ring.setPixelColor(i, ring.ColorHSV(hue));
    } else {
      ring.setPixelColor(i, 0);  // নেভানো
    }
  }
  ring.show();  // সব রং একসাথে রিংয়ে পাঠাও
  if (level != shown) {
    shown = level;
    Serial.print(level);
    Serial.println(" টি LED জ্বলছে");
  }
  delay(50);
}
