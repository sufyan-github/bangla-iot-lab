import { expect, test, type Page } from '@playwright/test';
import { pick } from './pick';

/** Stage 4: the DS18B20 over 1-Wire, the waterproof ultrasonic sensor, the line sensor, the siren. */

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

test('the thermometer program reads a DS18B20 once it has its pull-up', async ({ page }) => {
  await newEsp32Circuit(page);
  await place(page, 'ds18b20', 'BB1.c10'); // GND c10, DQ c11, VDD c12
  await wire(page, [
    ['ESP1.gnd1', 'BB1.a10'],
    ['ESP1.d4', 'BB1.a11'],
    ['ESP1.3v3', 'BB1.a12'],
  ]);
  await page.getByTestId('tab-code').click();
  await page.getByTestId('starter').selectOption('thermo');
  await expect(page.getByTestId('upload-status').locator('[data-uploaded]')).toBeVisible();
  const serial = page.getByTestId('serial');

  // No pull-up yet: no probe is found, and the lab says what is missing.
  await page.getByTestId('run').click();
  await expect(serial).toContainText('প্রোব পাওয়া গেছে: 0');
  await page.getByTestId('tab-circuit').click();
  await expect(page.locator('[data-diag^="onewire-no-pullup"]')).toBeVisible();
  await page.getByTestId('run').click(); // stop

  await place(page, 'resistor', 'BB1.d11'); // d11 – d15
  await wire(page, [['BB1.b12', 'BB1.b15']]);
  await page.locator('[data-hit="R1"]').click();
  await page.getByTestId('resistance').selectOption('4700');
  await page.getByTestId('run').click();
  await expect(page.locator('[data-diag^="onewire-no-pullup"]')).toHaveCount(0);
  await page.getByTestId('tab-code').click();
  await expect(serial).toContainText('প্রোব পাওয়া গেছে: 1');
  await expect(serial).toContainText('প্রোব 1: 25.00 °C');
});

test('the waterproof sensor, line sensor and siren can be placed and are kept', async ({
  page,
}) => {
  await newEsp32Circuit(page);
  await place(page, 'jsnsr04t', 'BB1.a1');
  await place(page, 'linesensor', 'BB1.a7');
  await place(page, 'siren', 'BB1.a17');
  await pick(page, 'select');
  await expect(page.locator('[data-part]')).toHaveCount(4);
  await page.locator('[data-hit="LINE1"]').click();
  // Channel 3 starts on the line; put channel 4 on it too.
  await page.getByTestId('line-channel-4').click();
  await expect(page.getByTestId('line-channel-4')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'saved');
  await page.reload();
  await expect(page.locator('[data-part]')).toHaveCount(4);
});
