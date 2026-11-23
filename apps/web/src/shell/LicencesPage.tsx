import { useT } from '../i18n';

const REPOSITORY = 'https://github.com/sufyan-github/bangla-iot-lab';

/** What the application distributes besides its own code, and under which licence. */
const NOTICES = [
  {
    id: 'app',
    name: 'বাংলা IoT ল্যাব (Bangla IoT Lab)',
    licence: 'Apache-2.0',
    text: 'Copyright 2026 Md Abu Sufyan. The original code of this application.',
    file: 'LICENSE.txt',
    source: REPOSITORY,
  },
  {
    id: 'firmware',
    name: 'Starter firmware for the UNO-compatible board',
    licence: 'LGPL-2.1-or-later',
    text: 'The ready-made programs are compiled from sketches written for this project together with ArduinoCore-avr 1.8.8, and the Servo 1.3.0 and LiquidCrystal 1.0.7 libraries, Copyright Arduino LLC and contributors. Their complete source, and how to rebuild or relink the firmware, is in the repository.',
    file: 'LGPL-2.1.txt',
    source: `${REPOSITORY}/tree/main/third_party/arduino-avr`,
  },
  {
    id: 'avr-libc',
    name: 'avr-libc',
    licence: 'BSD-style',
    text: 'The C library linked into the starter firmware.',
    file: 'avr-libc.txt',
    source: 'https://github.com/avrdudes/avr-libc',
  },
  {
    id: 'esp32-library',
    name: 'Ready-made programs for the ESP32 board (experimental)',
    licence: 'Apache-2.0',
    text: 'Compiled from sketches written for this project together with the project’s own ESP32 board library. They contain no code from Espressif’s ESP32 Arduino core.',
    file: 'LICENSE.txt',
    source: `${REPOSITORY}/tree/main/spikes/esp32-api`,
  },
  {
    id: 'lessons',
    name: 'Kit lessons of Bangla IoT Lab',
    licence: 'CC-BY-4.0',
    text: 'The text of the kit lessons, written for this project. Anyone may copy, translate and adapt it, with credit. The programs the lessons use are Apache-2.0, like the rest of the code.',
    file: 'CC-BY-4.0.txt',
    source: `${REPOSITORY}/tree/main/packages/lessons/content`,
  },
  {
    id: 'wasi-libc',
    name: 'wasi-libc',
    licence: 'MIT, BSD, ISC, Apache-2.0, CC0',
    text: 'The C library linked into every ESP32 program built for the lab.',
    file: 'wasi-libc.txt',
    source: 'https://github.com/WebAssembly/wasi-libc',
  },
  {
    id: 'llvm',
    name: 'libc++, libc++abi and compiler-rt (LLVM)',
    licence: 'Apache-2.0 WITH LLVM-exception',
    text: 'The C++ library and compiler support code linked into every ESP32 program built for the lab.',
    file: 'LLVM.txt',
    source: 'https://github.com/llvm/llvm-project',
  },
  {
    id: 'adafruit-dht',
    name: 'Adafruit DHT sensor library',
    licence: 'MIT',
    text: 'Copyright 2020 Adafruit Industries. The library that reads the DHT11 sensor, built unmodified into every ESP32 program made for the lab’s own model of the board.',
    file: 'adafruit-dht.txt',
    source: 'https://github.com/adafruit/DHT-sensor-library',
  },
  {
    id: 'adafruit-gfx',
    name: 'Adafruit GFX graphics library',
    licence: 'BSD-2-Clause',
    text: 'Copyright 2012 Adafruit Industries. Drawing and text for displays, built unmodified into ESP32 programs that use a display. Its extra fonts are not included.',
    file: 'adafruit-gfx.txt',
    source: 'https://github.com/adafruit/Adafruit-GFX-Library',
  },
  {
    id: 'adafruit-ssd1306',
    name: 'Adafruit SSD1306 library',
    licence: 'BSD-3-Clause',
    text: 'Copyright 2012 Adafruit Industries. The library for the OLED display, built unmodified into ESP32 programs that use it. The picture a display shows when it is first switched on is part of this library.',
    file: 'adafruit-ssd1306.txt',
    source: 'https://github.com/adafruit/Adafruit_SSD1306',
  },
  {
    id: 'adafruit-busio',
    name: 'Adafruit BusIO',
    licence: 'MIT',
    text: 'Copyright 2017 Adafruit Industries. The I2C and SPI device layer of Adafruit’s libraries, built unmodified into ESP32 programs that use it.',
    file: 'adafruit-busio.txt',
    source: 'https://github.com/adafruit/Adafruit_BusIO',
  },
  {
    id: 'adafruit-sensor',
    name: 'Adafruit unified sensor library',
    licence: 'Apache-2.0',
    text: 'Copyright 2008 The Android Open Source Project, updated by Adafruit Industries. Common types for sensor readings, built unmodified into ESP32 programs that use the BME280.',
    file: 'adafruit-sensor.txt',
    source: 'https://github.com/adafruit/Adafruit_Sensor',
  },
  {
    id: 'adafruit-bme280',
    name: 'Adafruit BME280 library',
    licence: 'BSD-3-Clause',
    text: 'Copyright 2015 Limor Fried and Kevin Townsend for Adafruit Industries. The library for the BME280 sensor, built unmodified into ESP32 programs that use it.',
    file: 'adafruit-bme280.txt',
    source: 'https://github.com/adafruit/Adafruit_BME280_Library',
  },
  {
    id: 'adafruit-ina219',
    name: 'Adafruit INA219 library',
    licence: 'BSD-3-Clause',
    text: 'Copyright 2012 Adafruit Industries. The library for the INA219 current monitor, built unmodified into ESP32 programs that use it.',
    file: 'adafruit-ina219.txt',
    source: 'https://github.com/adafruit/Adafruit_INA219',
  },
  {
    id: 'dallas-temperature',
    name: 'DallasTemperature',
    licence: 'MIT',
    text: 'Copyright 2024 Miles Burton. The library for the DS18B20 thermometer, built unmodified into ESP32 programs that use it.',
    file: 'dallas-temperature.txt',
    source: 'https://github.com/milesburton/Arduino-Temperature-Control-Library',
  },
  {
    id: 'pms',
    name: 'PMS (Plantower particle sensors)',
    licence: 'MIT',
    text: 'Copyright 2017 Mariusz Kacki. The library for the PMS5003 particle sensor, built unmodified into ESP32 programs that use it.',
    file: 'pms.txt',
    source: 'https://github.com/fu-hsi/PMS',
  },
  {
    id: 'adafruit-st7735',
    name: 'Adafruit ST7735 and ST7789 library',
    licence: 'MIT',
    text: 'Written by Limor Fried for Adafruit Industries. The library for the ST7789 colour display, built unmodified into ESP32 programs that use it.',
    file: 'adafruit-st7735.txt',
    source: 'https://github.com/adafruit/Adafruit-ST7735-Library',
  },
  {
    id: 'esp32-firmware',
    name: 'ESP32 firmware built for the chip emulator (experimental)',
    licence: 'LGPL-2.1-or-later',
    text: 'When the chip emulator is chosen, the compile server builds your sketch together with Espressif’s Arduino core for the ESP32, release 3.3.12, and Espressif’s ESP-IDF libraries. The core’s complete source, and how to rebuild or relink the firmware, is in the repository.',
    file: 'LGPL-2.1.txt',
    source: `${REPOSITORY}/tree/main/third_party/arduino-esp32`,
  },
  {
    id: 'esp32sim',
    name: 'esp32sim, and the ESP32’s start-up code',
    licence: 'MIT; Apache-2.0',
    text: 'The emulator of the ESP32 chip, by its own authors, built from its source with one file added by this project. It boots Espressif’s mask ROM for the ESP32, which is Apache-2.0. Carried only by builds of the lab that include the chip emulator.',
    file: 'NOTICE.txt',
    source: `${REPOSITORY}/tree/main/third_party/esp32sim`,
  },
  {
    id: 'font',
    name: 'Anek Bangla',
    licence: 'SIL Open Font License 1.1',
    text: 'Copyright 2021 The Anek Project Authors. The typeface used throughout.',
    file: 'OFL-1.1-AnekBangla.txt',
    source: 'https://github.com/EkType/Anek',
  },
] as const;

export function LicencesPage() {
  const { t } = useT();
  return (
    <main className="mx-auto max-w-3xl px-4 py-8" data-testid="licences">
      <h1 className="text-3xl font-semibold">{t('licences.title')}</h1>
      <p className="mt-3 text-ink-soft">{t('licences.intro')}</p>
      <p className="mt-2 text-ink-soft">{t('licences.replace')}</p>

      <ul className="mt-6 space-y-4" lang="en">
        {NOTICES.map((notice) => (
          <li
            key={notice.id}
            data-notice={notice.id}
            className="rounded-xl border border-line bg-surface p-4"
          >
            <h2 className="text-lg font-semibold">{notice.name}</h2>
            <p className="text-sm font-medium text-amber-deep">{notice.licence}</p>
            <p className="mt-2 text-sm">{notice.text}</p>
            <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm font-medium">
              <a className="text-mat underline" href={`/licences/${notice.file}`}>
                {notice.file}
              </a>
              <a className="text-mat underline" href={notice.source} rel="noreferrer">
                {t('licences.source')}
              </a>
            </p>
          </li>
        ))}
      </ul>

      <p className="mt-6 text-sm">
        <a
          className="font-medium text-mat underline"
          href="/licences/THIRD_PARTY_LICENSES.md"
          data-testid="licences-full"
        >
          {t('licences.fullList')}
        </a>
      </p>
      <p className="mt-4 text-sm text-ink-soft" lang="en">
        Arduino and UNO are trademarks of Arduino S.r.l. This project is not affiliated with or
        endorsed by Arduino, or by any parts supplier. Product names are used only to say what the
        software is compatible with.
      </p>
    </main>
  );
}
