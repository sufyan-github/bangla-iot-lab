// Puts the ESP32 chip emulator into the build, when it has been built
// (third_party/esp32sim/build.sh .cache/esp32sim; it needs Rust). Without it the
// web application still builds and works: the ESP32 simply has one way of
// running programs instead of two.
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../../..');
const source = process.env.ESP32SIM_DIR ?? path.join(root, '.cache/esp32sim');
const target = path.resolve(import.meta.dirname, '../public/esp32sim');
const files = ['esp32sim.wasm', 'esp32_rev300_rom.elf', 'SOURCE.txt', 'LICENSE-esp32sim.txt'];

rmSync(target, { recursive: true, force: true });
if (files.every((file) => existsSync(path.join(source, file)))) {
  mkdirSync(target, { recursive: true });
  for (const file of files) cpSync(path.join(source, file), path.join(target, file));
  console.log('ESP32 chip emulator: included.');
} else {
  console.log(
    'ESP32 chip emulator: not built, so not included. Run third_party/esp32sim/build.sh .cache/esp32sim',
  );
}
