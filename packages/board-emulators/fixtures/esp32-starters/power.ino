// ভোল্টেজ, কারেন্ট আর ক্ষমতা মাপো — ESP32 বোর্ড
// ভোল্টেজ সেন্সর: VCC যাবে ব্যাটারির +-এ, GND যাবে ব্যাটারির −-এ, S যাবে D35-এ।
// ব্যাটারির − বোর্ডের GND-তেও যাবে, যাতে বোর্ড আর ব্যাটারির মাপ একই জায়গা থেকে হয়।
// কারেন্ট সেন্সর (ACS712, 5 A): ব্যাটারির + থেকে IP+, IP− থেকে সুইচ হয়ে মোটর, মোটর থেকে ব্যাটারির −।
// সেন্সরের VCC যাবে VIN-এ, GND যাবে GND-তে, OUT যাবে D34-এ।
// চালু করার সময় সুইচ বন্ধ রাখো: প্রোগ্রাম তখন দেখে নেয় কারেন্ট শূন্য হলে OUT কত।

const int voltagePin = 35;
const int currentPin = 34;

float zeroMilliVolts;          // কারেন্ট শূন্য হলে OUT (সরবরাহের অর্ধেক)
float milliVoltsPerAmp;        // প্রতি অ্যাম্পিয়ারে OUT কতটা বদলায়

// কয়েকবার পড়ে গড় নাও: একবারের মাপে ছোটখাটো ওঠানামা থাকে
float averageMilliVolts(int pin) {
  float sum = 0;
  for (int i = 0; i < 20; i++) {
    sum += analogReadMilliVolts(pin);
    delay(2);
  }
  return sum / 20;
}

void setup() {
  Serial.begin(115200);
  zeroMilliVolts = averageMilliVolts(currentPin);
  // 5 V-এ 185 mV প্রতি অ্যাম্পিয়ার; সরবরাহ কম হলে দুটোই একই অনুপাতে কমে।
  milliVoltsPerAmp = 185.0 * (2 * zeroMilliVolts) / 5000.0;
  Serial.print("কারেন্ট শূন্যে OUT: ");
  Serial.print(zeroMilliVolts, 0);
  Serial.println(" mV");
}

void loop() {
  float volts = 5 * averageMilliVolts(voltagePin) / 1000.0;   // S হলো আসল ভোল্টেজের ৫ ভাগের ১ ভাগ
  float amps = (averageMilliVolts(currentPin) - zeroMilliVolts) / milliVoltsPerAmp;
  float watts = volts * amps;                                  // ক্ষমতা = ভোল্টেজ × কারেন্ট

  Serial.print("ভোল্টেজ: ");
  Serial.print(volts, 2);
  Serial.print(" V, কারেন্ট: ");
  Serial.print(amps, 2);
  Serial.print(" A, ক্ষমতা: ");
  Serial.print(watts, 2);
  Serial.println(" W");
  delay(1000);
}
