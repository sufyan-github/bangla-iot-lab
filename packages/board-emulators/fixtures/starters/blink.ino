// LED জ্বালাও-নেভাও (Blink)
// ১৩ নম্বর পিনের LED আধা সেকেন্ড জ্বলবে, আধা সেকেন্ড নিভে থাকবে।

const int ledPin = 13;

void setup() {
  pinMode(ledPin, OUTPUT);   // পিনটাকে আউটপুট বানাও
}

void loop() {
  digitalWrite(ledPin, HIGH);  // LED জ্বালাও
  delay(500);                  // ৫০০ মিলিসেকেন্ড অপেক্ষা
  digitalWrite(ledPin, LOW);   // LED নেভাও
  delay(500);
}
