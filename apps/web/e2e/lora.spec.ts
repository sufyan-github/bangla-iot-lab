import { expect, test, type Page } from '@playwright/test';
import { pick } from './pick';

/**
 * Stage 7: two ESP32 boards, each with a Ra-02 LoRa radio on its SPI bus,
 * driven by the LoRa library in the ready-made programs.
 */

const tap = (page: Page, endpoint: string) => page.locator(`[data-endpoint="${endpoint}"]`).click();
async function wire(page: Page, pairs: [string, string][]) {
  await pick(page, 'wire');
  for (const [from, to] of pairs) {
    await tap(page, from);
    await tap(page, to);
  }
  await pick(page, 'select');
}
async function program(page: Page, board: string, starter: string) {
  await page.getByTestId('tab-code').click();
  await page.getByTestId(`code-board-${board}`).click();
  await page.getByTestId('starter').selectOption(starter);
  await expect(page.getByTestId('upload-status').locator('[data-uploaded]')).toBeVisible();
}

/** The ESP32 pins a radio's legs go to, leg by leg from the left: GND, 3.3V, RST, DIO0, NSS, MOSI, MISO, SCK. */
const PINS = ['gnd1', '3v3', 'd14', 'd2', 'd5', 'd23', 'd19', 'd18'];

test('two boards talk over LoRa, and the signal weakens with distance', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('new-project').click();
  await expect(page).toHaveURL(/\/lab\//);
  await pick(page, 'esp32');
  await pick(page, 'esp32');
  await pick(page, 'lora');
  await tap(page, 'BB1.c1');
  await pick(page, 'lora');
  await tap(page, 'BB1.c11');
  await expect(page.locator('[data-part="LORA2"]')).toBeVisible();
  await wire(page, [
    ...PINS.map((pin, i): [string, string] => [`ESP1.${pin}`, `BB1.a${1 + i}`]),
    ...PINS.map((pin, i): [string, string] => [`ESP2.${pin}`, `BB1.a${11 + i}`]),
  ]);
  // The second radio half a kilometre down the road.
  await page.getByTestId('tab-circuit').click();
  await page.locator('[data-hit="LORA2"]').click();
  await page.getByTestId('slider-km').fill('0.5');
  await expect(page.getByTestId('radio-distance')).toBeVisible();

  await program(page, 'ESP1', 'lora-send');
  await program(page, 'ESP2', 'lora-receive');
  await page.getByTestId('run').click();
  await expect(page.getByTestId('serial')).toContainText(/পেলাম: hello \d+ {2}RSSI: -\d+ dBm/, {
    timeout: 25_000,
  });

  await page.getByTestId('tab-circuit').click();
  await page.locator('[data-hit="LORA2"]').click();
  await expect(page.getByTestId('radio-rssi')).toBeVisible();
  await expect(page.locator('[data-diag="module-overvoltage"]')).toHaveCount(0);
});
