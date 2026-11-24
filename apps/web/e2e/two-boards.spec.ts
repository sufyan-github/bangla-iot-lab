import { expect, test, type Page } from '@playwright/test';
import { pick } from './pick';
import { withinLabTime } from './lab-time';

/**
 * Two boards in one circuit: each has its own program, chosen in its own tab
 * of the code view, and two ESP32 boards talk over a serial wire.
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

/** Puts a ready-made program on one board, chosen by its tab in the code view. */
async function program(page: Page, board: string, starter: string) {
  await page.getByTestId('tab-code').click();
  await page.getByTestId(`code-board-${board}`).click();
  await expect(page.getByTestId(`code-board-${board}`)).toHaveAttribute('aria-selected', 'true');
  await page.getByTestId('starter').selectOption(starter);
  await expect(page.getByTestId('upload-status').locator('[data-uploaded]')).toBeVisible();
}

test('two ESP32 boards, each with its own program, talk over a serial wire', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('new-project').click();
  await expect(page).toHaveURL(/\/lab\//);
  await pick(page, 'esp32');
  await pick(page, 'esp32');
  await expect(page.locator('[data-part="ESP2"]')).toBeVisible();
  // A third board is refused.
  await pick(page, 'uno');
  await expect(page.locator('[data-part="UNO1"]')).toHaveCount(0);

  await wire(page, [
    ['ESP1.tx2', 'ESP2.rx2'],
    ['ESP1.gnd1', 'ESP2.gnd1'],
  ]);
  await expect(page.locator('[data-wire]')).toHaveCount(2);

  await program(page, 'ESP1', 'sender');
  await program(page, 'ESP2', 'receiver');
  await page.getByTestId('run').click();
  // The receiver's monitor shows what the sender sent.
  await withinLabTime(page, 6000, () =>
    expect(page.getByTestId('serial')).toContainText('পেলাম: count 1', { timeout: 300 }),
  );
  await page.getByTestId('code-board-ESP1').click();
  await expect(page.getByTestId('serial')).toContainText('পাঠালাম: 1');
  await expect(page.locator('[data-diag="no-common-ground"]')).toHaveCount(0);
});
