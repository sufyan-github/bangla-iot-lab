import { expect, test, type Page } from '@playwright/test';

/** The logic sheet: gates as symbols, wired port to port, worked out as logic. */

/** Taps the sheet at a grid step (the sheet is 40 × 24 steps). */
async function tapSheet(page: Page, gx: number, gy: number) {
  const svg = page.getByTestId('sheet-canvas');
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

  // Named, the lamp is called by its name in the expression.
  await page.locator('[data-element="OUT1"] rect').first().click();
  await page.getByTestId('sheet-label').fill('Both');
  await page.getByTestId('sheet-label').press('Enter');
  await page.getByTestId('sheet-table').click();
  await expect(page.getByTestId('sheet-expression')).toHaveText('Both = A·B');
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

  // The timing diagram: the clock's line, and Q changing at half its rate.
  await page.getByTestId('sheet-timing').click();
  const rows = page.getByTestId('timing-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toHaveAttribute('data-signal', 'CLK1');
  await expect(rows.last()).toHaveAttribute('data-signal', 'FF1.Q');
  const changes = async (i: number) => Number(await rows.nth(i).getAttribute('data-changes'));
  await expect.poll(() => changes(0), { timeout: 4000 }).toBeGreaterThanOrEqual(5);
  expect(await changes(1)).toBeGreaterThanOrEqual(2);
  expect(await changes(1)).toBeLessThan(await changes(0));

  // Held still, the lines stop moving.
  await page.getByTestId('timing-hold').click();
  const held = await changes(0);
  await page.waitForTimeout(1200);
  expect(await changes(0)).toBe(held);
});

/** Drags a box over the sheet, from one grid step to another. */
async function dragBox(page: Page, from: [number, number], to: [number, number]) {
  const box = (await page.getByTestId('sheet-canvas').boundingBox())!;
  const at = ([gx, gy]: [number, number]) =>
    [box.x + (gx / 40) * box.width, box.y + (gy / 24) * box.height] as const;
  await page.mouse.move(...at(from));
  await page.mouse.down();
  await page.mouse.move(...at([(from[0] + to[0]) / 2, (from[1] + to[1]) / 2]), { steps: 4 });
  await page.mouse.move(...at(to), { steps: 4 });
  await page.mouse.up();
}

test('a box chooses several; they are copied with their wire, pasted and removed together', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByTestId('new-project').click();
  await page.getByTestId('view-sheet').click();
  await place(page, 'NOT', 3, 3);
  await place(page, 'output', 9, 3);
  await page.getByTestId('sheet-tool-select').click();
  await port(page, 'G1.y');
  await port(page, 'OUT1.a');
  await expect(page.locator('[data-wire]')).toHaveCount(1);

  await dragBox(page, [1, 1], [14, 7]);
  await expect(page.locator('[data-selected="true"]')).toHaveCount(2);
  await page.getByTestId('sheet-copy').click();
  await page.getByTestId('sheet-paste').click();
  // Two more elements, with new ids, joined as the originals are; the copies are chosen.
  await expect(page.locator('[data-element]')).toHaveCount(4);
  await expect(page.locator('[data-element="G2"]')).toHaveCount(1);
  await expect(page.locator('[data-element="OUT2"]')).toHaveCount(1);
  await expect(page.locator('[data-wire]')).toHaveCount(2);
  await expect(page.locator('[data-selected="true"]')).toHaveCount(2);
  // The copied NOT gate lights its own copied lamp.
  await expect(page.locator('[data-element="OUT2"]')).toHaveAttribute('data-high', 'true');

  await page.getByTestId('sheet-delete').click();
  await expect(page.locator('[data-element]')).toHaveCount(2);
  await expect(page.locator('[data-wire]')).toHaveCount(1);
  await page.getByTestId('sheet-undo').click();
  await expect(page.locator('[data-element]')).toHaveCount(4);
});

test('a clock drives a counter, whose bits show on a hex digit', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('new-project').click();
  await page.getByTestId('view-sheet').click();
  await place(page, 'clock', 3, 4);
  await place(page, 'CNT', 10, 3);
  await place(page, 'HEX', 18, 4);
  await page.getByTestId('sheet-tool-select').click();
  await port(page, 'CLK1.q');
  await port(page, 'CNT1.clk');
  for (let bit = 0; bit < 4; bit++) {
    await port(page, `CNT1.q${bit}`);
    await port(page, `HEX1.d${bit}`);
  }
  await expect(page.locator('[data-wire]')).toHaveCount(5);
  // At 1 Hz the digit counts up once a second, as the counter does.
  const digit = page.locator('[data-element="HEX1"] [data-value]');
  const counter = page.locator('[data-element="CNT1"] [data-value]');
  await expect(digit).toHaveAttribute('data-value', '2', { timeout: 4000 });
  await expect(counter).toHaveAttribute('data-value', /^[23]$/);

  // Its bits are lines on the timing diagram.
  await page.getByTestId('sheet-timing').click();
  await expect(page.locator('[data-testid="timing-row"][data-signal="CNT1.Q0"]')).toBeVisible();
});
