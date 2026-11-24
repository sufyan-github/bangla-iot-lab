import { expect, test } from '@playwright/test';
import { pick } from './pick';

/** The diagram view: the breadboard circuit drawn as a schematic, kept in step with it. */

test('the diagram shows the breadboard circuit as a schematic', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('open-example').click();
  await expect(page).toHaveURL(/\/lab\//);
  await page.getByTestId('view-diagram').click();

  const diagram = page.getByTestId('diagram');
  const symbols = diagram.locator('[data-symbol]');
  await expect(symbols).toHaveCount(3);
  await expect(diagram.locator('[data-symbol="R1"]')).toContainText('R1');
  await expect(diagram.locator('[data-net="supply"]')).toHaveCount(1);
  await expect(diagram.locator('[data-net="ground"]')).toHaveCount(1);
  // The resistor and LED are in series: one net joins exactly those two legs.
  await expect(diagram.locator('[data-legs="R1.b LED1.anode"]')).toHaveCount(1);

  // Tapping a symbol selects the part, so its settings show beside the diagram.
  await diagram.locator('[data-symbol="R1"]').click();
  await expect(diagram.locator('[data-symbol="R1"]')).toHaveAttribute('data-selected', 'true');
  await expect(page.getByTestId('resistance')).toBeVisible();

  // The diagram follows the running circuit and edits made on the breadboard.
  await page.getByTestId('run').click();
  await expect(page.getByTestId('meter-current')).toContainText('mA');
  await page.getByTestId('view-board').click();
  await expect(page.getByTestId('canvas-frame')).toBeVisible();
  await pick(page, 'button');
  await page.locator('[data-endpoint="BB1.h20"]').click();
  await page.getByTestId('view-diagram').click();
  await expect(symbols).toHaveCount(4);
  await page.getByTestId('view-board').click();
  await page.getByTestId('undo').click();
  await page.getByTestId('view-diagram').click();
  await expect(symbols).toHaveCount(3);
});

test('the diagram of a board circuit shows the board as a box with its sockets', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByTestId('open-example-uno').click();
  await page.getByTestId('view-diagram').click();
  const board = page.locator('[data-symbol="UNO1"]');
  await expect(board).toHaveAttribute('data-type', 'uno');
  for (const socket of ['D13', 'D2', 'A0', '5V', 'GND']) await expect(board).toContainText(socket);
  await expect(page.locator('[data-symbol]')).toHaveCount(5);
});

test('an empty circuit says where the diagram will come from', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('new-project').click();
  await page.getByTestId('view-diagram').click();
  await expect(page.getByTestId('diagram-empty')).toBeVisible();
});

test('the diagram shows where current flows while the circuit runs', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('open-example').click();
  await page.getByTestId('view-diagram').click();
  const flow = page.getByTestId('diagram-flow');
  await expect(flow).toHaveCount(0);

  await page.getByTestId('run').click();
  await expect(flow).toBeVisible();
  // One loop: every piece of wire carries the LED's 21.8 mA.
  const pieces = flow.locator('path');
  expect(await pieces.count()).toBeGreaterThan(4);
  for (const milliamps of await pieces.evaluateAll((paths) =>
    paths.map((path) => Number(path.getAttribute('data-ma'))),
  )) {
    expect(milliamps).toBeCloseTo(21.8, 0);
  }

  // Break the loop on the breadboard: the flow stops.
  await page.getByTestId('view-board').click();
  await page.locator('[data-hit="LED1"]').click();
  await page.getByTestId('quick-remove').click();
  await page.getByTestId('view-diagram').click();
  await expect(page.locator('[data-symbol]')).toHaveCount(2);
  await expect(flow).toHaveCount(0);
});
