// ESP32 feasibility study, step 3: runs the speed test page in headless
// Chromium, at full speed and with the processor slowed down.
//
//   node scripts/esp32-study/bench-browser.mjs <url of the page> [--slow 4,6]
//
// The slowed runs use Chromium's own CPU throttling. They are an ESTIMATE of a
// slower device, not a measurement of one: only a real phone gives that.
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(path.resolve(import.meta.dirname, '../../apps/web/package.json'));
const { chromium } = require('@playwright/test');

const url = process.argv[2];
if (!url) {
  console.error('usage: node scripts/esp32-study/bench-browser.mjs <url> [--slow 4,6]');
  process.exit(2);
}
const slowIndex = process.argv.indexOf('--slow');
const rates = [
  1,
  ...(slowIndex >= 0 ? process.argv[slowIndex + 1].split(',').map(Number) : [4, 6]),
];

const browser = await chromium.launch();
const results = [];
for (const [thread, rate] of [['worker', 1], ...rates.map((r) => ['main', r])]) {
  const page = await browser.newPage();
  const session = await page.context().newCDPSession(page);
  if (rate > 1) await session.send('Emulation.setCPUThrottlingRate', { rate });
  await page.goto(`${url}${thread === 'main' ? '?thread=main' : ''}`);
  await page.waitForFunction(() => globalThis.benchReport, null, { timeout: 600_000 });
  const report = await page.evaluate(() => globalThis.benchReport);
  if (report.error) throw new Error(report.error);
  results.push({ thread, rate, rows: report.rows });
  const slowest = report.rows.reduce((a, b) => (b.timesRealTime < a.timesRealTime ? b : a));
  console.log(
    `${thread} thread, processor slowed ${rate}x: all correct ${report.rows.every((row) => row.same)}, ` +
      `slowest ${slowest.name} at ${slowest.timesRealTime.toFixed(1)}x real time ` +
      `(${slowest.realMs.toFixed(0)} ms for ${slowest.boardMs / 1000} s of board time, ${slowest.hostCalls} calls)`,
  );
  await page.close();
}
console.log(JSON.stringify({ browser: browser.version(), results }));
await browser.close();
