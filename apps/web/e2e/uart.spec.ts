import { expect, test, type Page } from '@playwright/test';
import { pick } from './pick';

/**
 * Stage 5: the ESP32's second serial port, with the NEO-6M GPS, the PMS5003
 * particle sensor, the HC-05 Bluetooth module and its phone, the DFPlayer Mini
 * and the SIM800L.
 */

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

test('the GPS program prints the position over RX2, and waits when the sky is hidden', async ({
  page,
}) => {
  await newEsp32Circuit(page);
  await place(page, 'gps', 'BB1.c10'); // VCC c10, RX c11, TX c12, GND c13
  await wire(page, [
    ['ESP1.3v3', 'BB1.a10'],
    ['ESP1.tx2', 'BB1.a11'],
    ['ESP1.rx2', 'BB1.a12'],
    ['ESP1.gnd1', 'BB1.a13'],
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
  await place(page, 'pms5003', 'BB1.c10'); // VCC c10, GND c11, RX c12, TX c13
  await wire(page, [
    ['ESP1.vin', 'BB1.a10'],
    ['ESP1.gnd1', 'BB1.a11'],
    ['ESP1.tx2', 'BB1.a12'],
    ['ESP1.rx2', 'BB1.a13'],
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

test('the phone switches the LED over Bluetooth, and reads the board’s answers', async ({
  page,
}) => {
  await newEsp32Circuit(page);
  await place(page, 'bluetooth', 'BB1.c10'); // VCC c10, GND c11, TXD c12, RXD c13
  await place(page, 'resistor', 'BB1.f20'); // f20 – f24
  await place(page, 'led', 'BB1.g24'); // anode g24, cathode g25
  await wire(page, [
    ['ESP1.vin', 'BB1.a10'],
    ['ESP1.gnd1', 'BB1.a11'],
    ['ESP1.rx2', 'BB1.a12'],
    ['ESP1.tx2', 'BB1.a13'],
    ['ESP1.d2', 'BB1.j20'],
    ['ESP1.gnd2', 'BB1.j25'],
  ]);
  await page.locator('[data-hit="R1"]').click();
  await page.getByTestId('resistance').selectOption('220');
  await page.getByTestId('tab-code').click();
  await page.getByTestId('starter').selectOption('bluetooth');
  await expect(page.getByTestId('upload-status').locator('[data-uploaded]')).toBeVisible();
  await page.getByTestId('run').click();
  await page.getByTestId('tab-circuit').click();
  await page.locator('[data-hit="BT1"]').click();
  const phone = page.getByTestId('phone');
  await expect(phone.getByTestId('phone-state')).toHaveAttribute('data-connected', 'true');
  await expect(phone.locator('[data-from="module"]').first()).toContainText('হ্যালো!');
  await phone.getByTestId('phone-input').fill('1');
  await phone.getByTestId('phone-send').click();
  await expect(phone.locator('[data-from="phone"]')).toHaveText(['1']);
  await expect(phone.locator('[data-from="module"]').last()).toHaveText('বাতি জ্বলছে');
  await expect(page.locator('[data-part="LED1"]')).toHaveAttribute('data-led-state', 'on');
});

test('the MP3 program finds the player and plays; a SIM800L on 5 V is flagged', async ({
  page,
}) => {
  await newEsp32Circuit(page);
  await place(page, 'mp3', 'BB1.c10'); // VCC c10, RX c11, TX c12, GND c13
  await place(page, 'gsm', 'BB1.c20'); // VCC c20, RXD c21, TXD c22, GND c23
  await wire(page, [
    ['ESP1.vin', 'BB1.a10'],
    ['ESP1.tx2', 'BB1.a11'],
    ['ESP1.rx2', 'BB1.a12'],
    ['ESP1.gnd1', 'BB1.a13'],
    ['BB1.b10', 'BB1.a20'],
    ['BB1.b13', 'BB1.a23'],
  ]);
  await page.getByTestId('tab-code').click();
  await page.getByTestId('starter').selectOption('mp3');
  await expect(page.getByTestId('upload-status').locator('[data-uploaded]')).toBeVisible();
  await page.getByTestId('run').click();
  await expect(page.getByTestId('serial')).toContainText('গান 1 বাজছে', { timeout: 20_000 });
  await page.getByTestId('tab-circuit').click();
  await page.locator('[data-hit="MP1"]').click();
  await expect(page.getByTestId('player-state')).toHaveAttribute('data-playing', 'true');
  await expect(page.getByTestId('player-state')).toHaveAttribute('data-track', '1');
  await expect(page.locator('[data-diag^="gsm-overvoltage"]')).toBeVisible();
});
