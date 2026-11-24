// ব্লুটুথ লো এনার্জি (BLE): নবের মান ফোনে পাঠাও, ফোন থেকে LED জ্বালাও — ESP32 বোর্ড
// পটেনশিওমিটারের মাঝের পা D34-এ; LED রেজিস্টর হয়ে D2-তে।
// ডানের "নেটওয়ার্ক" প্যানেলের "BLE ফোন" থেকে "Lab-ESP32" খুঁজে যুক্ত হও।
// নবের মান প্রতি সেকেন্ডে আসবে; LED-এর বৈশিষ্ট্যে "on" বা "off" লিখে পাঠাও।

#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

// প্রতিটা সার্ভিস আর বৈশিষ্ট্যের নিজের একটা UUID থাকে।
#define SERVICE_UUID "6e400001-b5a3-f393-e0a9-e50e24dcca9e"
#define KNOB_UUID "6e400003-b5a3-f393-e0a9-e50e24dcca9e"
#define LED_UUID "6e400002-b5a3-f393-e0a9-e50e24dcca9e"

const int knobPin = 34;
const int ledPin = 2;

BLECharacteristic* knob;
bool connected = false;

// ফোন যুক্ত হলে বা চলে গেলে এগুলো চলে।
class Phone : public BLEServerCallbacks {
  void onConnect(BLEServer* server) {
    connected = true;
    Serial.println("ফোন যুক্ত হলো");
  }
  void onDisconnect(BLEServer* server) {
    connected = false;
    Serial.println("ফোন চলে গেল; আবার খুঁজে পাওয়ার মতো করছি");
    server->startAdvertising();
  }
};

// ফোন LED-এর বৈশিষ্ট্যে কিছু লিখলে এটা চলে।
class LedWrite : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* characteristic) {
    String text = characteristic->getValue();
    Serial.print("ফোন লিখল: ");
    Serial.println(text);
    digitalWrite(ledPin, text == "on" ? HIGH : LOW);
  }
};

void setup() {
  pinMode(ledPin, OUTPUT);
  Serial.begin(115200);

  BLEDevice::init("Lab-ESP32");
  BLEServer* server = BLEDevice::createServer();
  server->setCallbacks(new Phone());
  BLEService* service = server->createService(SERVICE_UUID);

  knob = service->createCharacteristic(
      KNOB_UUID, BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY);
  knob->addDescriptor(new BLE2902());

  BLECharacteristic* led = service->createCharacteristic(LED_UUID, BLECharacteristic::PROPERTY_WRITE);
  led->setCallbacks(new LedWrite());

  service->start();
  BLEDevice::getAdvertising()->addServiceUUID(SERVICE_UUID);
  BLEDevice::startAdvertising();
  Serial.println("BLE চালু: ফোন থেকে Lab-ESP32 খোঁজো");
}

void loop() {
  String value = String(analogRead(knobPin));
  knob->setValue(value);
  if (connected) knob->notify();
  delay(1000);
}
