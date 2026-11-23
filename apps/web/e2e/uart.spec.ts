import { expect, test, type Page } from '@playwright/test';

/** Stage 5a: the ESP32's second serial port, with the NEO-6M GPS and the PMS5003 particle sensor. */

const tap = (page: Page, endpoint: string) => page.locator(`[data-endpoint="${endpoint}"]`).click();
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

test('the GPS program prints the position over RX2, and waits when the sky is hidden', async ({
  page,
}) => {
  await newEsp32Circuit(page);
  await place(page, 'gps', 'c10'); // VCC c10, RX c11, TX c12, GND c13
  await wire(page, [
    ['ESP1.3v3', 'a10'],
    ['ESP1.tx2', 'a11'],
    ['ESP1.rx2', 'a12'],
    ['ESP1.gnd1', 'a13'],
  ]);
  await page.getByTestId('tab-code').click();
  await page.getByTestId('starter').selectOption('gps');
  await expect(page.getByTestId('upload-status').locator('[data-uploaded]')).toBeVisible();
  const serial = page.getByTestId('serial');
  await page.getByTestId('run').click();
  await expect(serial).toContainText('অক্ষাংশ: 23.746500, দ্রাঘিমাংশ: 90.376300, স্যাটেলাইট: 8', {
    timeout: 20_000,
  });

  await page.getByTestId('tab-circuit').click();
  await page.locator('[data-hit="GPS1"]').click();
  await page.getByTestId('gps-fix').click();
  await expect(page.getByTestId('gps-fix')).toHaveAttribute('aria-pressed', 'false');
  await page.getByTestId('tab-code').click();
  await expect(serial).toContainText('অবস্থান এখনো জানা নেই', { timeout: 15_000 });
});

test('the air program reads the PMS5003 and follows its slider; both parts are kept', async ({
  page,
}) => {
  await newEsp32Circuit(page);
  await place(page, 'pms5003', 'c10'); // VCC c10, GND c11, RX c12, TX c13
  await wire(page, [
    ['ESP1.vin', 'a10'],
    ['ESP1.gnd1', 'a11'],
    ['ESP1.tx2', 'a12'],
    ['ESP1.rx2', 'a13'],
  ]);
  await page.getByTestId('tab-code').click();
  await page.getByTestId('starter').selectOption('air');
  await expect(page.getByTestId('upload-status').locator('[data-uploaded]')).toBeVisible();
  const serial = page.getByTestId('serial');
  await page.getByTestId('run').click();
  await expect(serial).toContainText('PM2.5: 35,');

  await page.getByTestId('tab-circuit').click();
  await page.locator('[data-hit="PM1"]').click();
  await page.getByTestId('slider-pm25').fill('120');
  await page.getByTestId('tab-code').click();
  await expect(serial).toContainText('PM2.5: 120,');
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'saved');
  await page.reload();
  await expect(page.locator('[data-part]')).toHaveCount(2);
});
