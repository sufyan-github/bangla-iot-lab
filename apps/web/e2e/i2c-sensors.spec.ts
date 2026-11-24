import { expect, test, type Page } from '@playwright/test';
import { pick } from './pick';
import { withinLabTime } from './lab-time';

/** Stage 3's I2C sensors: the BME280 and the INA219, read by their real libraries on the ESP32. */

const tap = (page: Page, endpoint: string) => page.locator(`[data-endpoint="${endpoint}"]`).click();
async function place(page: Page, tool: string, hole: string) {
  await pick(page, tool);
  await tap(page, hole);
}
async function wire(page: Page, pairs: [string, string][]) {
  await pick(page, 'wire');
  for (const [from, to] of pairs) {
    await tap(page, from);
    await tap(page, to);
  }
  await pick(page, 'select');
}
async function newEsp32Circuit(page: Page) {
  await page.goto('/');
  await page.getByTestId('new-project').click();
  await expect(page).toHaveURL(/\/lab\//);
  await pick(page, 'esp32');
  await expect(page.locator('[data-part="ESP1"]')).toBeVisible();
}
async function chooseStarter(page: Page, starter: string) {
  await page.getByTestId('tab-code').click();
  await page.getByTestId('starter').selectOption(starter);
  await expect(page.getByTestId('upload-status').locator('[data-uploaded]')).toBeVisible();
}

test('the weather program reads the BME280 over I2C and follows its sliders', async ({ page }) => {
  await newEsp32Circuit(page);
  await place(page, 'bme280', 'BB1.c10'); // VIN c10, GND c11, SCL c12, SDA c13
  await wire(page, [
    ['ESP1.3v3', 'BB1.a10'],
    ['ESP1.gnd1', 'BB1.a11'],
    ['ESP1.d22', 'BB1.a12'],
    ['ESP1.d21', 'BB1.a13'],
  ]);
  await chooseStarter(page, 'weather');
  await page.getByTestId('run').click();
  const serial = page.getByTestId('serial');
  await expect(serial).toContainText('BME280 পাওয়া গেছে');
  await expect(serial).toContainText('তাপমাত্রা: 28.0 °C, আর্দ্রতা: 70 %, বায়ুচাপ: 1010.0 hPa');

  await page.getByTestId('tab-circuit').click();
  await page.locator('[data-hit="BME1"]').click();
  await page.getByTestId('slider-celsius').fill('31.5');
  await page.getByTestId('tab-code').click();
  await withinLabTime(page, 6000, () =>
    expect(serial).toContainText('তাপমাত্রা: 31.5 °C', { timeout: 300 }),
  );
});

test('the INA219 can be placed and kept, and its pins are named in the diagram', async ({
  page,
}) => {
  await newEsp32Circuit(page);
  await place(page, 'ina219', 'BB1.c10');
  await pick(page, 'select');
  await expect(page.locator('[data-part="INA1"]')).toBeVisible();
  await wire(page, [['ESP1.d22', 'BB1.a12']]);
  await page.getByTestId('view-diagram').click();
  await expect(page.getByTestId('diagram').locator('[data-symbol="INA1"]')).toContainText('SCL');
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'saved');
  await page.reload();
  await expect(page.locator('[data-part="INA1"]')).toBeVisible();
});
