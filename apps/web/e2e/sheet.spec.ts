import { expect, test, type Page } from '@playwright/test';

/** The logic sheet: gates as symbols, wired port to port, worked out as logic. */

/** Taps the sheet at a grid step (the sheet is 40 × 24 steps). */
async function tapSheet(page: Page, gx: number, gy: number) {
  const svg = page.getByTestId('sheet').locator('svg');
  const box = (await svg.boundingBox())!;
  await svg.click({ position: { x: (gx / 40) * box.width, y: (gy / 24) * box.height } });
}
async function place(page: Page, tool: string, gx: number, gy: number) {
  await page.getByTestId(`sheet-tool-${tool}`).click();
  await tapSheet(page, gx, gy);
}
const port = (page: Page, name: string) => page.locator(`[data-port="${name}"]`).click();

test('two switches, an AND gate and a lamp: the lamp lights only with both on', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByTestId('new-project').click();
  await page.getByTestId('view-sheet').click();
  await place(page, 'input', 3, 3);
  await place(page, 'input', 3, 9);
  await place(page, 'AND', 11, 6);
  await place(page, 'output', 19, 6);
  await page.getByTestId('sheet-tool-select').click();
  for (const [from, to] of [
    ['IN1.q', 'G1.a'],
    ['IN2.q', 'G1.b'],
    ['G1.y', 'OUT1.a'],
  ]) {
    await port(page, from!);
    await port(page, to!);
  }
  await expect(page.locator('[data-wire]')).toHaveCount(3);
  const lamp = page.locator('[data-element="OUT1"]');
  await expect(lamp).toHaveAttribute('data-high', 'false');
  await page.locator('[data-element="IN1"] rect').first().click();
  await expect(lamp).toHaveAttribute('data-high', 'false');
  await page.locator('[data-element="IN2"] rect').first().click();
  await expect(lamp).toHaveAttribute('data-high', 'true');

  // The truth table of what was drawn.
  await page.getByTestId('sheet-table').click();
  await expect(page.getByTestId('sheet-row')).toHaveCount(4);
  await expect(page.getByTestId('sheet-row').last()).toHaveText(/1\s*1\s*1/);
  // And its expression, in the simplest form.
  await expect(page.getByTestId('sheet-expression')).toHaveText('OUT1 = A·B');

  // Undo turns IN2 back off, so the lamp goes out; redo turns it on again.
  await page.getByTestId('sheet-undo').click();
  await expect(lamp).toHaveAttribute('data-high', 'false');
  await page.getByTestId('sheet-redo').click();
  await expect(lamp).toHaveAttribute('data-high', 'true');

  // Two outputs cannot be joined.
  await port(page, 'IN1.q');
  await port(page, 'IN2.q');
  await expect(page.getByTestId('sheet-problem')).toBeVisible();

  // The sheet is saved with the project.
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'saved');
  await page.reload();
  await page.getByTestId('view-sheet').click();
  await expect(page.locator('[data-wire]')).toHaveCount(3);
});

test('a clock and a D flip-flop with Q̅ to D: the flip-flop turns over by itself', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByTestId('new-project').click();
  await page.getByTestId('view-sheet').click();
  await place(page, 'clock', 3, 6);
  await place(page, 'DFF', 11, 6);
  await page.getByTestId('sheet-tool-select').click();
  await port(page, 'CLK1.q');
  await port(page, 'FF1.clk');
  await port(page, 'FF1.nq');
  await port(page, 'FF1.d');
  const flipFlop = page.locator('[data-element="FF1"]');
  // At 1 Hz it turns over once a second.
  await expect(flipFlop).toHaveAttribute('data-high', 'true', { timeout: 3000 });
  await expect(flipFlop).toHaveAttribute('data-high', 'false', { timeout: 3000 });
  // With a clock there is no truth table.
  await page.getByTestId('sheet-table').click();
  await expect(page.getByTestId('sheet-no-table')).toBeVisible();
});
