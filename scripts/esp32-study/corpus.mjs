// ESP32 feasibility study, step 1: what do the reference sketches need?
//
//   node scripts/esp32-study/corpus.mjs <folder of sketch folders>
//
// Reads every sketch (a folder of .ino and .h files), records the headers and
// board features it uses, and sorts it into the lowest level of ESP32 support
// that could run it. Writes data/private/esp32-study/corpus.json and prints a
// summary. The sketches are not copied: only their names and what they use.
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const source = process.argv[2];
if (!source) {
  console.error('usage: node scripts/esp32-study/corpus.mjs <folder of sketch folders>');
  process.exit(2);
}

/** Features, each with the pattern that shows a sketch uses it and the level it needs. */
const FEATURES = [
  // Level 1: pins, time and serial text.
  { id: 'digital', level: 1, pattern: /\b(pinMode|digitalWrite|digitalRead)\s*\(/ },
  {
    id: 'serial',
    level: 1,
    pattern: /\bSerial\.(begin|print|println|printf|available|read|readStringUntil|parseInt)\b/,
  },
  { id: 'timing', level: 1, pattern: /\b(delay|millis|micros|delayMicroseconds)\s*\(/ },
  // Level 2: analog in, PWM out, pulse timing, interrupts.
  {
    id: 'adc',
    level: 2,
    pattern:
      /\b(analogRead|analogReadMilliVolts|analogReadResolution|analogSetAttenuation|analogSetPinAttenuation)\s*\(/,
  },
  {
    id: 'pwm',
    level: 2,
    pattern:
      /\b(analogWrite|ledcWrite|ledcAttach|ledcSetup|ledcAttachPin|ledcWriteTone|analogWriteResolution|analogWriteFrequency)\s*\(/,
  },
  { id: 'pulse', level: 2, pattern: /\bpulseIn(Long)?\s*\(/ },
  { id: 'interrupt', level: 2, pattern: /\battachInterrupt\s*\(/ },
  { id: 'touch', level: 2, pattern: /\btouchRead\s*\(/ },
  { id: 'dac', level: 2, pattern: /\bdacWrite\s*\(/ },
  // Level 3: the kit's devices, each a protocol and a library.
  { id: 'i2c', level: 3, pattern: /#include\s*<Wire\.h>/ },
  { id: 'oled', level: 3, pattern: /#include\s*<Adafruit_SSD1306\.h>/ },
  { id: 'dht', level: 3, pattern: /#include\s*<DHT\.h>/ },
  { id: 'servo', level: 3, pattern: /#include\s*<ESP32Servo\.h>/ },
  // Level 4: things that outlive a reset.
  { id: 'preferences', level: 4, pattern: /#include\s*<Preferences\.h>/ },
  { id: 'deep-sleep', level: 4, pattern: /\besp_(deep_sleep|sleep_enable|light_sleep)\w*\s*\(/ },
  { id: 'restart', level: 4, pattern: /\bESP\.restart\s*\(/ },
  // Level 5: the network.
  { id: 'wifi', level: 5, pattern: /#include\s*<WiFi\.h>/ },
  { id: 'web-server', level: 5, pattern: /#include\s*<WebServer\.h>/ },
  { id: 'mdns', level: 5, pattern: /#include\s*<ESPmDNS\.h>/ },
  { id: 'http-client', level: 5, pattern: /#include\s*<HTTPClient\.h>/ },
  { id: 'tls', level: 5, pattern: /#include\s*<WiFiClientSecure\.h>/ },
  { id: 'clock', level: 5, pattern: /\b(configTime|getLocalTime)\s*\(/ },
];
const LEVELS = {
  1: 'pins, time and serial text',
  2: 'analog in, PWM, pulse timing, interrupts',
  3: 'the kit devices: I2C display, DHT sensor, servo',
  4: 'saved settings, sleep and restart',
  5: 'Wi-Fi and the internet',
};

const sketches = readdirSync(source)
  .filter((name) => statSync(path.join(source, name)).isDirectory())
  .sort()
  .map((name) => {
    const folder = path.join(source, name);
    const files = readdirSync(folder).filter((file) => /\.(ino|h|cpp)$/.test(file));
    const code = files.map((file) => readFileSync(path.join(folder, file), 'utf8')).join('\n');
    const headers = [
      ...new Set([...code.matchAll(/#include\s*[<"]([^>"]+)[>"]/g)].map((m) => m[1])),
    ].sort();
    const features = FEATURES.filter((feature) => feature.pattern.test(code)).map(
      (feature) => feature.id,
    );
    const level = Math.max(
      1,
      ...FEATURES.filter((f) => features.includes(f.id)).map((f) => f.level),
    );
    return { name, files: files.length, lines: code.split('\n').length, headers, features, level };
  });

const out = path.resolve(import.meta.dirname, '../../data/private/esp32-study');
mkdirSync(out, { recursive: true });
writeFileSync(
  path.join(out, 'corpus.json'),
  `${JSON.stringify({ levels: LEVELS, sketches }, null, 2)}\n`,
);

const total = sketches.length;
console.log(`${total} sketches, ${sketches.reduce((sum, s) => sum + s.lines, 0)} lines\n`);
console.log('Lowest level of board support that runs the sketch, and the running total:');
let running = 0;
for (const [level, meaning] of Object.entries(LEVELS)) {
  const count = sketches.filter((sketch) => sketch.level === Number(level)).length;
  running += count;
  console.log(
    `  level ${level}  ${String(count).padStart(3)}  up to here ${String(running).padStart(3)} (${Math.round((100 * running) / total)}%)  ${meaning}`,
  );
}
console.log('\nFeatures, by number of sketches:');
for (const feature of FEATURES) {
  const count = sketches.filter((sketch) => sketch.features.includes(feature.id)).length;
  if (count > 0) console.log(`  ${String(count).padStart(3)}  ${feature.id}`);
}
const known = new Set([
  'Arduino.h',
  'Wire.h',
  'Adafruit_GFX.h',
  'Adafruit_SSD1306.h',
  'DHT.h',
  'ESP32Servo.h',
  'Preferences.h',
  'WiFi.h',
  'WebServer.h',
  'ESPmDNS.h',
  'HTTPClient.h',
  'WiFiClientSecure.h',
  'time.h',
]);
const other = new Map();
for (const sketch of sketches)
  for (const header of sketch.headers)
    if (!known.has(header)) other.set(header, (other.get(header) ?? 0) + 1);
console.log('\nHeaders outside the expected set:', Object.fromEntries(other));
