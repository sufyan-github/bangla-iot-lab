// ESP32 feasibility study, step 4: how fast esp32sim runs in a browser.
//
//   node scripts/esp32-study/option-a-browser.mjs <folder with bootloader.bin, partitions.bin, firmware.bin>
//        [--seconds n] [--slow n] [--url <page>]
//
// Opens esp32sim's own page (its emulator built as WebAssembly, run in a worker
// of the tab) in headless Chromium, gives it a firmware built for the classic
// ESP32 and watches the sketch's serial output. The firmware must print lines
// "t <milliseconds on the board's clock> ..." about once a second; comparing
// those with real time gives the speed. The page reads the files in the tab and
// uploads nothing, by its own documentation.
//
// --slow n slows the page's own thread with Chromium's CPU throttling. The
// emulator runs in a worker, which that setting may not reach, so a slowed
// figure from this script is not to be trusted without checking; it is printed
// with that warning.
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(path.resolve(import.meta.dirname, '../../apps/web/package.json'));
const { chromium } = require('@playwright/test');

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};
const build = args[0];
if (!build || build.startsWith('--')) {
  console.error(
    'usage: node scripts/esp32-study/option-a-browser.mjs <build folder> [--seconds n] [--slow n] [--url page]',
  );
  process.exit(2);
}
const seconds = Number(option('seconds', 30));
const slow = Number(option('slow', 1));
const url = option('url', 'https://mikroverk.github.io/esp32sim/run.html?wasm');

const browser = await chromium.launch();
const page = await browser.newPage();
const lines = [];
// The worker's serial messages reach the page; read them where the page does.
await page.exposeFunction('studySerial', (text, at) => lines.push({ text, at }));
await page.addInitScript(() => {
  const Original = globalThis.Worker;
  globalThis.Worker = class extends Original {
    constructor(...rest) {
      super(...rest);
      this.addEventListener('message', (event) => {
        const data = event.data;
        const text = typeof data === 'string' ? data : (data?.text ?? data?.serial ?? null);
        if (typeof text === 'string' && text.includes('serial'))
          globalThis.studySerial(text, performance.now());
      });
    }
  };
});
if (slow > 1) {
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setCPUThrottlingRate', { rate: slow });
}
await page.goto(url, { waitUntil: 'load' });
await page.locator('#fw_board').selectOption('esp32');
await page.locator('#fw_flash').fill('4');
await page.locator('#fw_psram').fill('0');
await page.locator('#fw_bootloader').setInputFiles(path.join(build, 'bootloader.bin'));
await page.locator('#fw_ptable').setInputFiles(path.join(build, 'partitions.bin'));
await page.locator('#fw_app').setInputFiles(path.join(build, 'firmware.bin'));
const started = Date.now();
await page.locator('#fw_go').click();
await page.waitForTimeout(seconds * 1000);
const status = await page.locator('#fw_status').textContent();
await browser.close();

const text = lines
  .map((line) => {
    try {
      return JSON.parse(line.text).data ?? '';
    } catch {
      return '';
    }
  })
  .join('');
const ticks = [];
let seen = '';
for (const line of lines) {
  try {
    seen += JSON.parse(line.text).data ?? '';
  } catch {
    continue;
  }
  for (const match of seen.matchAll(/^t (\d+)/gm)) {
    const boardMs = Number(match[1]);
    if (!ticks.some((tick) => tick.boardMs === boardMs)) ticks.push({ boardMs, at: line.at });
  }
}
console.log(`page status: ${status}`);
console.log(`serial messages: ${lines.length}; first text: ${JSON.stringify(text.slice(0, 120))}`);
if (ticks.length >= 3) {
  const first = ticks[1]; // skip the first: it includes the boot
  const last = ticks.at(-1);
  const speed = (last.boardMs - first.boardMs) / (last.at - first.at);
  console.log(
    `${ticks.length} clock lines in ${Math.round((Date.now() - started) / 1000)} s; board time ran at ${speed.toFixed(2)} times real time` +
      (slow > 1
        ? ` with the page thread slowed ${slow}x (the worker may not be slowed: check before trusting)`
        : ''),
  );
  console.log(`last line: ${text.trim().split('\n').at(-1)}`);
} else {
  console.log(`only ${ticks.length} clock lines were seen: no speed figure`);
}
