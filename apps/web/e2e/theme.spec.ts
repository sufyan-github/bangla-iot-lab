import { expect, test, type Page } from '@playwright/test';

/** The page's own background colour, as drawn. */
const pageColour = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);
const LIGHT = 'rgb(243, 245, 242)';
const DARK = 'rgb(16, 36, 31)';

test('the colours follow the device, and a choice of light or dark is remembered', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  const button = page.getByTestId('theme');
  await expect(button).toHaveAttribute('data-theme-choice', 'system');
  expect(await pageColour(page)).toBe(DARK);

  await page.emulateMedia({ colorScheme: 'light' });
  expect(await pageColour(page)).toBe(LIGHT);

  // Chosen dark, the lab stays dark on a light device, also after a reload.
  await button.click();
  await expect(button).toHaveAttribute('data-theme-choice', 'dark');
  expect(await pageColour(page)).toBe(DARK);
  await page.reload();
  await expect(page.getByTestId('theme')).toHaveAttribute('data-theme-choice', 'dark');
  expect(await pageColour(page)).toBe(DARK);

  // Chosen light, it stays light on a dark device.
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.getByTestId('theme').click();
  await expect(page.getByTestId('theme')).toHaveAttribute('data-theme-choice', 'light');
  expect(await pageColour(page)).toBe(LIGHT);

  // And back to following the device.
  await page.getByTestId('theme').click();
  await expect(page.getByTestId('theme')).toHaveAttribute('data-theme-choice', 'system');
  expect(await pageColour(page)).toBe(DARK);
});

test('in dark mode, text on the green bar and on amber keeps its contrast', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  // The header's light text on dark green, and the dark text on the amber button.
  const header = await page.evaluate(
    () => getComputedStyle(document.querySelector('header')!).color,
  );
  expect(header).toBe('rgb(242, 246, 240)');
  const primary = page.locator('.btn-primary').first();
  await expect(primary).toBeVisible();
  expect(await primary.evaluate((el) => getComputedStyle(el).color)).toBe('rgb(27, 20, 0)');
});
