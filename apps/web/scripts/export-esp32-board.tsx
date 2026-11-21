// Writes the static copy of the ESP32 board drawing used by the documentation.
//
//   pnpm esp32:board

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { esp32BoardSvg } from '../src/lab/esp32/board-svg';

const target = new URL('../../../docs/engineering/esp32-board.svg', import.meta.url);
writeFileSync(target, esp32BoardSvg());
console.log(`wrote ${fileURLToPath(target)}`);
