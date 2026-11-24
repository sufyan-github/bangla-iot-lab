// MQTT: নবের মান পাঠাও, আর বার্তা পেয়ে LED জ্বালাও — ESP32 বোর্ড
// পটেনশিওমিটারের মাঝের পা D34-এ; LED রেজিস্টর হয়ে D2-তে।
// ল্যাবে আসল ইন্টারনেট নেই: ল্যাবের নিজের একটা MQTT ব্রোকার আছে। ডানের
// "IoT ড্যাশবোর্ড" প্যানেলে বোর্ডের পাঠানো মান দেখা যায়, আর সেখান থেকে বার্তা পাঠানো যায়।

#include <WiFi.h>
#include <PubSubClient.h>

const char* ssid = "lab-wifi";
const char* password = "12345678";
const char* broker = "broker.lab";  // আসল প্রকল্পে তোমার ব্রোকারের ঠিকানা

const int knobPin = 34;
const int ledPin = 2;

WiFiClient network;
PubSubClient mqtt(network);
unsigned long lastSent = 0;

// কোনো বার্তা এলে এই ফাংশন চলে।
void received(char* topic, byte* payload, unsigned int length) {
  String text;
  for (unsigned int i = 0; i < length; i++) text += (char)payload[i];
  Serial.print("বার্তা এল ");
  Serial.print(topic);
  Serial.print(": ");
  Serial.println(text);
  if (String(topic) == "lab/led") {
    digitalWrite(ledPin, text == "on" ? HIGH : LOW);
  }
}

void setup() {
  pinMode(ledPin, OUTPUT);
  Serial.begin(115200);
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) delay(500);
  Serial.println("Wi-Fi-তে আছি");

  mqtt.setServer(broker, 1883);
  mqtt.setCallback(received);
}

void loop() {
  if (!mqtt.connected()) {
    if (mqtt.connect("esp32-knob")) {
      Serial.println("ব্রোকারে যুক্ত হলাম");
      mqtt.subscribe("lab/led");
    } else {
      delay(1000);
      return;
    }
  }
  mqtt.loop();  // আসা বার্তাগুলো received()-এ যায়

  // প্রতি ২ সেকেন্ডে নবের মান পাঠাও।
  if (millis() - lastSent >= 2000) {
    lastSent = millis();
    String value = String(analogRead(knobPin));
    mqtt.publish("lab/knob", value.c_str());
  }
  delay(10);
}
