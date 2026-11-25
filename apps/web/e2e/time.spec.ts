import { expect, test, type Page } from '@playwright/test';

/** Pause, step and start again (D-112): time in the lab can be held still and moved on by hand. */

const labMs = async (page: Page) =>
  Number(await page.getByTestId('lab-clock').getAttribute('data-ms'));

test('a circuit that changes over time can be paused, stepped and started again', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByTestId('open-example-esp32').click();
  await expect(page.locator('[data-part="ESP1"]')).toBeVisible();
  // Nothing to pause until it runs.
  await expect(page.getByTestId('time-controls')).toHaveCount(0);

  await page.getByTestId('run').click();
  const controls = page.getByTestId('time-controls');
  await expect(controls).toBeVisible();
  await expect.poll(() => labMs(page)).toBeGreaterThan(200);

  // Paused, time stands: the clock does not move, and stepping is offered. (A frame
  // already on its way when the pause was pressed may still arrive: wait for it.)
  await page.getByTestId('time-pause').click();
  await expect(controls).toHaveAttribute('data-paused', 'true');
  let held = -1;
  await expect
    .poll(async () => {
      const before = await labMs(page);
      await page.waitForTimeout(200);
      held = await labMs(page);
      return held - before;
    })
    .toBe(0);
  await page.waitForTimeout(600);
  expect(await labMs(page)).toBe(held);
  await expect(page.getByTestId('time-now')).toContainText(' s');

  // Each step moves it on by exactly the amount chosen.
  await page.getByTestId('time-step-size').selectOption('100');
  await page.getByTestId('time-step').click();
  await expect.poll(() => labMs(page)).toBe(held + 100);
  await page.getByTestId('time-step').click();
  await expect.poll(() => labMs(page)).toBe(held + 200);

  // Run on: time moves again.
  await page.getByTestId('time-pause').click();
  await expect(controls).toHaveAttribute('data-paused', 'false');
  await expect(page.getByTestId('time-step')).toBeDisabled();
  await expect.poll(() => labMs(page)).toBeGreaterThan(held + 400);

  // Start again: back to the beginning, still running.
  await page.getByTestId('time-restart').click();
  await expect.poll(() => labMs(page)).toBeLessThan(held);
  await expect(page.getByTestId('run')).toHaveAttribute('aria-pressed', 'true');
});

test('a circuit with nothing that changes over time has nothing to pause', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('open-example').click();
  await expect(page.locator('[data-hit="BAT1"]')).toBeVisible();
  await page.getByTestId('run').click();
  await expect(page.locator('[data-part="LED1"]')).toHaveAttribute('data-led-state', 'on');
  await expect(page.getByTestId('time-controls')).toHaveCount(0);
});
