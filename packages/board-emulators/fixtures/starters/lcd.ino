// LCD-তে লেখা দেখাও (LCD)
// RS ১২, E ১১, D4 ৫, D5 ৪, D6 ৩, D7 ২ নম্বর পিনে লাগাও।
// LCD-র VSS ও RW GND-তে, VDD 5V-তে লাগাও।

#include <LiquidCrystal.h>

LiquidCrystal lcd(12, 11, 5, 4, 3, 2);

void setup() {
  lcd.begin(16, 2);            // ১৬ ঘর, ২ লাইনের LCD
  lcd.print("Hello, Bangla!");
}

void loop() {
  lcd.setCursor(0, 1);         // দ্বিতীয় লাইনের শুরুতে যাও
  lcd.print(millis() / 1000);  // কত সেকেন্ড হলো
  lcd.print(" s");
  delay(200);
}
