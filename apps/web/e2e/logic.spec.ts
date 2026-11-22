import { expect, test, type Page } from '@playwright/test';

/** 74HC logic chips on the breadboard, and the truth-table tool. */

const tap = (page: Page, endpoint: string) => page.locator(`[data-endpoint="${endpoint}"]`).click();
async function place(page: Page, tool: string, hole: string) {
  await page.getByTestId(`tool-${tool}`).click();
  await tap(page, hole);
}

test('a logic chip sits across the gap wherever it is tapped, and can be swapped', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByTestId('new-project').click();
  await expect(page).toHaveURL(/\/lab\//);
  // Tapped in row b: the chip still lands with pin 1 in row f.
  await place(page, 'logic', 'b10');
  const chip = page.locator('[data-part="U1"]');
  await expect(chip).toBeVisible();
  await expect(chip).toContainText('74HC08');
  await page.locator('[data-hit="U1"]').click();
  await expect(page.getByTestId('flip')).toHaveCount(0);
  await page.getByTestId('logic-chip').selectOption('74HC00');
  await expect(chip).toContainText('74HC00');
});

test('the truth table appears once there is a switch and an LED', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('new-project').click();
  await page.getByTestId('tool-battery').click();
  await place(page, 'switch', 'a1');
  await expect(page.getByTestId('truth-table')).toHaveCount(0);
  await place(page, 'led', 'a20');
  await page.getByTestId('tool-select').click();
  await page.getByTestId('make-table').click();
  // One switch: two rows.
  await expect(page.getByTestId('table-row')).toHaveCount(2);
});

test('the diagram draws a chip with its gates in use inside it', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('new-project').click();
  await page.getByTestId('tool-battery').click();
  await place(page, 'logic', 'e10');
  await page.locator('[data-hit="U1"]').click();
  await page.getByTestId('logic-chip').selectOption('74HC00');
  await place(page, 'led', 'c20');
  await page.getByTestId('tool-wire').click();
  for (const [from, to] of [
    ['BAT1.pos', 'a10'],
    ['BAT1.neg', 'j16'],
    ['g10', 'b10'],
    ['h12', 'a20'],
    ['a21', 'i16'],
  ]) {
    await tap(page, from!);
    await tap(page, to!);
  }
  await page.getByTestId('tool-select').click();
  await page.getByTestId('view-diagram').click();
  const symbol = page.getByTestId('diagram').locator('[data-symbol="U1"]');
  await expect(symbol).toContainText('74HC00');
  // One NAND gate in use, with its legs named as in the datasheet.
  await expect(symbol.locator('[data-gates="1"]')).toHaveCount(1);
  await expect(symbol.locator('[data-gates]')).toContainText('1Y');
  if (process.env.GATE_SHOT)
    await page.getByTestId('diagram').screenshot({ path: process.env.GATE_SHOT });
});
