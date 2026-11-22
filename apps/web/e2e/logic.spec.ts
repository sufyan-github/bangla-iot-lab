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
