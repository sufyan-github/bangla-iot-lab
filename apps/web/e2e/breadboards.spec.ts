import { expect, test, type Page } from '@playwright/test';

/**
 * Breadboards are parts: a circuit starts with one, more can be added in three
 * sizes, each is moved by its tab with its parts, and removing one takes its
 * parts and wires with it.
 */

const tap = (page: Page, endpoint: string) => page.locator(`[data-endpoint="${endpoint}"]`).click();
const boards = (page: Page) => page.locator('[data-breadboard]');
const cornerOf = async (page: Page, id: string) =>
  (await page.locator(`[data-breadboard="${id}"]`).getAttribute('transform')) ?? '';

async function newCircuit(page: Page) {
  await page.goto('/');
  await page.getByTestId('new-project').click();
  await expect(page).toHaveURL(/\/lab\//);
}

test('a new circuit has one breadboard; another is added, sized, used, moved and removed', async ({
  page,
}) => {
  await newCircuit(page);
  await expect(boards(page)).toHaveCount(1);

  await page.getByTestId('tool-breadboard').click();
  await expect(boards(page)).toHaveCount(2);
  // The new one is selected, and its inspector offers the three sizes.
  await expect(page.getByTestId('breadboard-half')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('breadboard-full').click();
  await expect(page.getByTestId('breadboard-full')).toHaveAttribute('aria-pressed', 'true');

  await page.getByTestId('tool-led').click();
  await tap(page, 'BB2.c60');
  await expect(page.locator('[data-part="LED1"]')).toBeVisible();

  // Moved by its tab, the board takes the LED with it.
  await page.getByTestId('tool-select').click();
  const before = await cornerOf(page, 'BB2');
  const tabHit = page.locator('[data-hit="BB2"]');
  await tabHit.scrollIntoViewIfNeeded();
  const ledBefore = await page.locator('[data-part="LED1"]').boundingBox();
  const tab = (await tabHit.boundingBox())!;
  // Two hole pitches right and down: small enough to stay on a phone's screen.
  await page.mouse.move(tab.x + tab.width / 2, tab.y + tab.height / 2);
  await page.mouse.down();
  await page.mouse.move(tab.x + tab.width / 2 + 25, tab.y + tab.height / 2 + 25, { steps: 4 });
  await page.mouse.move(tab.x + tab.width / 2 + 50, tab.y + tab.height / 2 + 50, { steps: 4 });
  await page.mouse.up();
  await expect.poll(() => cornerOf(page, 'BB2')).not.toBe(before);
  const ledAfter = await page.locator('[data-part="LED1"]').boundingBox();
  expect(ledAfter!.y).toBeGreaterThan(ledBefore!.y + 10);

  // Removing it says what goes with it, then takes the LED too.
  await page.locator('[data-hit="BB2"]').click();
  await expect(page.getByTestId('breadboard-carries')).toBeVisible();
  await page.getByTestId('remove').click();
  await expect(boards(page)).toHaveCount(1);
  await expect(page.locator('[data-part="LED1"]')).toHaveCount(0);
});

test('a smaller size is not offered while a part sits beyond it', async ({ page }) => {
  await newCircuit(page);
  await page.getByTestId('tool-led').click();
  await tap(page, 'BB1.c25');
  await page.getByTestId('tool-select').click();
  await page.locator('[data-hit="BB1"]').click();
  await expect(page.getByTestId('breadboard-mini')).toBeDisabled();
  await expect(page.getByTestId('breadboard-full')).toBeEnabled();
});
