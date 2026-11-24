import { expect, test, type Page } from '@playwright/test';
import { pick } from './pick';

/** Stage 2's power parts: the 18650 cell, the TP4056 charger, the LM2596 and the solar panel. */

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

async function newCircuit(page: Page) {
  await page.goto('/');
  await page.getByTestId('new-project').click();
  await expect(page).toHaveURL(/\/lab\//);
}

test('the four power parts can be placed, set and are kept', async ({ page }) => {
  await newCircuit(page);
  const tools = [
    ['solar', 'BB1.a1', 'PV1'],
    ['tp4056', 'BB1.c5', 'CHG1'],
    ['cell', 'BB1.c14', 'CELL1'],
    ['lm2596', 'BB1.c22', 'REG1'],
  ] as const;
  for (const [tool, hole] of tools) await place(page, tool, hole);
  await pick(page, 'select');
  await expect(page.locator('[data-part]')).toHaveCount(tools.length);

  await page.locator('[data-hit="CELL1"]').click();
  await page.getByTestId('slider-charge').fill('0.8');
  await expect(page.locator('[data-part="CELL1"]')).toContainText(/(80|৮০)%/);
  await page.locator('[data-hit="REG1"]').click();
  await page.getByTestId('slider-volts').fill('3.3');
  await expect(page.locator('[data-part="REG1"]')).toContainText(/(3\.3|৩\.৩) V/);
  await page.locator('[data-hit="PV1"]').click();
  await expect(page.getByTestId('slider-light')).toBeVisible();

  await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'saved');
  await page.reload();
  await expect(page.locator('[data-part]')).toHaveCount(tools.length);
  await expect(page.locator('[data-part="CELL1"]')).toContainText(/(80|৮০)%/);
});

test('a solar panel charges a cell through the TP4056 in sun, and stops in the dark', async ({
  page,
}) => {
  await newCircuit(page);
  await place(page, 'solar', 'BB1.a1'); // + a1, − a3
  await place(page, 'tp4056', 'BB1.c10'); // IN+ c10, IN− c11, B+ c13, B− c14, OUT+ c16, OUT− c17
  await place(page, 'cell', 'BB1.c20'); // + c20, − c26
  await wire(page, [
    ['BB1.b1', 'BB1.a10'],
    ['BB1.b3', 'BB1.a11'],
    ['BB1.a20', 'BB1.a13'],
    ['BB1.a26', 'BB1.a14'],
  ]);
  await page.getByTestId('run').click();
  // Full sun: the charger's red light, about 1 A into the cell.
  await expect.poll(() => partAttribute(page, 'CHG1', 'data-activity')).toBe('1.00');
  await page.locator('[data-hit="CELL1"]').click();
  await expect(page.getByTestId('cell-time')).toBeVisible();

  await page.locator('[data-hit="PV1"]').click();
  await page.getByTestId('slider-light').fill('0');
  await expect.poll(() => partAttribute(page, 'CHG1', 'data-activity')).toBe('0.00');
  await page.locator('[data-hit="CELL1"]').click();
  await expect(page.getByTestId('cell-time')).toHaveCount(0);
});
