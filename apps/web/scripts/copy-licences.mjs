// Copies the licence files into the build, so the web application carries the
// notices and licence texts of everything it distributes.
import { cpSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../../..');
const target = path.resolve(import.meta.dirname, '../public/licences');
mkdirSync(target, { recursive: true });
for (const [from, to] of [
  ['LICENSE', 'LICENSE.txt'],
  ['NOTICE', 'NOTICE.txt'],
  ['THIRD_PARTY_LICENSES.md', 'THIRD_PARTY_LICENSES.md'],
  ['LICENSES/LGPL-2.1.txt', 'LGPL-2.1.txt'],
  ['LICENSES/avr-libc.txt', 'avr-libc.txt'],
  ['LICENSES/wasi-libc.txt', 'wasi-libc.txt'],
  ['LICENSES/LLVM.txt', 'LLVM.txt'],
  ['LICENSES/CC-BY-4.0.txt', 'CC-BY-4.0.txt'],
  ['third_party/adafruit-dht/license.txt', 'adafruit-dht.txt'],
  ['third_party/adafruit-gfx/license.txt', 'adafruit-gfx.txt'],
  ['third_party/adafruit-ssd1306/license.txt', 'adafruit-ssd1306.txt'],
  ['third_party/adafruit-busio/LICENSE', 'adafruit-busio.txt'],
  ['third_party/adafruit-sensor/LICENSE.txt', 'adafruit-sensor.txt'],
  ['third_party/adafruit-bme280/LICENSE', 'adafruit-bme280.txt'],
  ['third_party/adafruit-ina219/license.txt', 'adafruit-ina219.txt'],
  ['third_party/dallas-temperature/LICENSE', 'dallas-temperature.txt'],
  ['third_party/pms/LICENSE', 'pms.txt'],
  ['LICENSES/OFL-1.1-AnekBangla.txt', 'OFL-1.1-AnekBangla.txt'],
]) {
  cpSync(path.join(root, from), path.join(target, to));
}
