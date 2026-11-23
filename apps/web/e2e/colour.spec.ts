import { expect, test, type Page } from '@playwright/test';

/**
 * Stage 6: the WS2812B LED ring, driven through the lab's own NeoPixel
 * library, and the ST7789 colour display on the ESP32's SPI bus, driven by
 * Adafruit's library.
 */

const SAMPLING = { timeout: 20_000, intervals: [100, 200, 300] };
const tap = (page: Page, endpoint: string) => page.locator(`[data-endpoint="${endpoint}"]`).click();
const partAttribute = (page: Page, id: string, name: string) =>
  page.locator(`[data-part="${id}"]`).getAttribute(name);
async function place(page: Page, tool: string, hole: string) {
  await page.getByTestId(`tool-${tool}`).click();
  await tap(page, hole);
}
async function wire(page: Page, pairs: [string, string][]) {
  await page.getByTestId('tool-wire').click();
  for (const [from, to] of pairs) {
    await tap(page, from);
    await tap(page, to);
  }
  await page.getByTestId('tool-select').click();
}
async function newEsp32Circuit(page: Page) {
  await page.goto('/');
  await page.getByTestId('new-project').click();
  await expect(page).toHaveURL(/\/lab\//);
  await page.getByTestId('tool-esp32').click();
  await expect(page.locator('[data-part="ESP1"]')).toBeVisible();
}
async function chooseStarter(page: Page, starter: string) {
  await page.getByTestId('tab-code').click();
  await page.getByTestId('starter').selectOption(starter);
  await expect(page.getByTestId('upload-status').locator('[data-uploaded]')).toBeVisible();
  await page.getByTestId('tab-circuit').click();
}

test('the ring program lights all twelve LEDs, green to red, with its knob input high', async ({
  page,
}) => {
  await newEsp32Circuit(page);
  await place(page, 'ledring', 'BB1.c10'); // VCC c10, GND c11, DIN c12, DOUT c13
  await wire(page, [
    ['ESP1.vin', 'BB1.a10'],
    ['ESP1.gnd1', 'BB1.a11'],
    ['ESP1.d4', 'BB1.a12'],
    // In place of the knob: the input it reads held at 3.3 V.
    ['ESP1.d34', 'ESP1.3v3'],
  ]);
  await chooseStarter(page, 'ring');
  await page.getByTestId('run').click();
  const colours = async () => (await partAttribute(page, 'RING1', 'data-ring')) ?? '';
  await expect.poll(colours, SAMPLING).toMatch(/^003c00,.*,3c0000$/);
  expect((await colours()).split(',')).toHaveLength(12);
  await page.locator('[data-hit="RING1"]').click();
  await expect(page.getByTestId('ring-current')).toBeVisible();
  // A ring of another size, chosen in the inspector, is kept.
  await page
    .getByTestId('ring-leds')
    .getByRole('button', { name: /^(16|১৬)$/ })
    .click();
  await expect.poll(async () => (await colours()).split(',').length, SAMPLING).toBe(16);
  await expect(page.locator('[data-diag^="module-"], [data-diag^="ring-"]')).toHaveCount(0);
});

test('the colour display shows what the program draws, and goes dark with BLK on GND', async ({
  page,
}) => {
  await newEsp32Circuit(page);
  await place(page, 'tft', 'BB1.c10'); // GND c10, VCC c11, SCL c12, SDA c13, RES c14, DC c15, CS c16, BLK c17
  await wire(page, [
    ['ESP1.gnd1', 'BB1.a10'],
    ['ESP1.3v3', 'BB1.a11'],
    ['ESP1.d18', 'BB1.a12'],
    ['ESP1.d23', 'BB1.a13'],
    ['ESP1.d4', 'BB1.a14'],
    ['ESP1.d2', 'BB1.a15'],
    ['ESP1.d5', 'BB1.a16'],
  ]);
  await chooseStarter(page, 'tft');
  await page.getByTestId('run').click();
  const lit = async () => Number(await partAttribute(page, 'TFT1', 'data-tft'));
  // Three bars of 60 × 110 and the title: well over twenty thousand coloured pixels.
  await expect.poll(lit, SAMPLING).toBeGreaterThan(20_000);
  await page.locator('[data-hit="TFT1"]').click();
  await expect(page.getByTestId('tft-preview')).toHaveAttribute('data-lit', 'true');

  await page.getByTestId('run').click(); // stop
  await wire(page, [['ESP1.gnd2', 'BB1.a17']]);
  await page.getByTestId('run').click();
  await page.waitForTimeout(2500);
  expect(await partAttribute(page, 'TFT1', 'data-tft')).toBe('dark');
});
