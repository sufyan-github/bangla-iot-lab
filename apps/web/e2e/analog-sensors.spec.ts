import { expect, test, type Page } from '@playwright/test';
import { pick } from './pick';

/** Stage 1's analog sensor modules: voltage, current, CO, pH, TDS and turbidity. */

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
const partAttribute = (page: Page, id: string, name: string) =>
  page.locator(`[data-part="${id}"]`).getAttribute(name);

async function newEsp32Circuit(page: Page) {
  await page.goto('/');
  await page.getByTestId('new-project').click();
  await expect(page).toHaveURL(/\/lab\//);
  await pick(page, 'esp32');
  await expect(page.locator('[data-part="ESP1"]')).toBeVisible();
}

test('the six sensors can be placed, set and are kept', async ({ page }) => {
  await newEsp32Circuit(page);
  const tools = [
    ['voltagesensor', 'BB1.a1', 'VS1'],
    ['acs712', 'BB1.a5', 'CS1'],
    ['mq7', 'BB1.a13', 'MQ1'],
    ['ph', 'BB1.a18', 'PH1'],
    ['tds', 'BB1.a23', 'TDS1'],
    ['turbidity', 'BB1.a27', 'TU1'],
  ] as const;
  for (const [tool, hole] of tools) await place(page, tool, hole);
  await pick(page, 'select');
  await expect(page.locator('[data-part]')).toHaveCount(tools.length + 1);
  for (const [, , id] of tools) await expect(page.locator(`[data-part="${id}"]`)).toBeVisible();

  // Each has its own control in the inspector.
  await page.locator('[data-hit="CS1"]').click();
  await page.getByTestId('acs712-range').selectOption('20A');
  await expect(page.locator('[data-part="CS1"]')).toContainText('20A');
  await page.locator('[data-hit="PH1"]').click();
  await page.getByTestId('slider-ph').fill('4');
  // Numbers are shown in Bangla digits when the page is in Bangla.
  await expect(page.locator('[data-part="PH1"]')).toContainText(/pH (4|৪)/);
  await page.locator('[data-hit="MQ1"]').click();
  await expect(page.getByTestId('slider-co')).toBeVisible();
  await page.locator('[data-hit="TDS1"]').click();
  await page.getByTestId('slider').fill('500');
  await expect(page.locator('[data-part="TDS1"]')).toContainText(/(500|৫০০) ppm/);

  await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'saved');
  await page.reload();
  await expect(page.locator('[data-part]')).toHaveCount(tools.length + 1);
  await expect(page.locator('[data-part="CS1"]')).toContainText('20A');
});

test('the voltage sensor gives a fifth of the battery it measures', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('new-project').click();
  await pick(page, 'battery');
  await place(page, 'voltagesensor', 'BB1.c10'); // c10 VCC, c11 GND, c12 S
  await wire(page, [
    ['BAT1.pos', 'BB1.a10'],
    ['BAT1.neg', 'BB1.a11'],
  ]);
  const battery = Number(await partAttribute(page, 'BAT1', 'data-voltage'));
  await expect
    .poll(async () => Number(await partAttribute(page, 'VS1', 'data-voltage')))
    .toBeCloseTo(Math.abs(battery) / 5, 1);
});

test('the TDS meter’s output follows its slider on the ESP32’s 3.3 V', async ({ page }) => {
  await newEsp32Circuit(page);
  await place(page, 'tds', 'BB1.c10'); // c10 A, c11 +, c12 −
  await wire(page, [
    ['ESP1.3v3', 'BB1.a11'],
    ['ESP1.gnd1', 'BB1.a12'],
  ]);
  const output = async () => Number(await partAttribute(page, 'TDS1', 'data-voltage'));
  // The board gives its 3.3 V while it runs; its ready-made program is enough.
  await expect(page.getByTestId('run')).toBeEnabled({ timeout: 30_000 });
  await page.getByTestId('run').click();
  await page.locator('[data-hit="TDS1"]').click();
  await page.getByTestId('slider').fill('0');
  await expect.poll(output).toBeLessThan(0.01);
  await page.getByTestId('slider').fill('1000');
  // About 2.2 V for 1000 ppm by DFRobot's formula.
  await expect.poll(output).toBeGreaterThan(2.1);
  await expect(page.locator('[data-diag^="module-underpowered"]')).toHaveCount(0);
});
