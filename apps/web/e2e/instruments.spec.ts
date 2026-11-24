import { expect, test } from '@playwright/test';

/** The bench power supply and the function generator. */

test('a power supply is turned to a voltage, and a generator shows its wave', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('new-project').click();
  await page.getByTestId('tool-supply').click();
  const supply = page.locator('[data-part="PSU1"]');
  await expect(supply).toHaveAttribute('data-source', 'supply');
  await expect(supply.locator('[data-display="0"]')).toHaveText('5.00 V');
  await page.getByTestId('slider-supply').fill('7.3');
  await expect(supply.locator('[data-display="0"]')).toHaveText('7.30 V');

  await page.getByTestId('tool-generator').click();
  const generator = page.locator('[data-part="FG1"]');
  await expect(generator.locator('[data-display="0"]')).toHaveText('square 1 Hz');
  await page.getByTestId('generator-wave').locator('button').nth(1).click(); // sine
  await expect(generator.locator('[data-display="0"]')).toHaveText('sine 1 Hz');
});
