import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

/** The serial monitor's graph: numbers a program prints, drawn as lines. */

test('the knob program’s readings are drawn on the serial graph', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('open-example-esp32').click();
  await page.getByTestId('tab-code').click();
  await page.getByTestId('starter').selectOption('knob');
  await expect(page.getByTestId('upload-status').locator('[data-uploaded]')).toBeVisible();
  await page.getByTestId('run').click();
  await page.getByTestId('serial-plot').click();
  const plot = page.locator('[data-testid="serial-plot"][data-series]');
  await expect(plot).toHaveAttribute('data-series', '1', { timeout: 15_000 });
  await expect(plot.locator('path')).toHaveCount(1);
  // The readings as a spreadsheet: a header, then one row for each line printed.
  const download = page.waitForEvent('download');
  await page.getByTestId('plot-csv').click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('serial-plot.csv');
  const csv = readFileSync((await file.path())!, 'utf8').replace(/^\uFEFF/, '');
  expect(csv.split('\r\n')[0]).toBe('sample,1');
  expect(csv.split('\r\n')[1]).toMatch(/^1,\d+$/);
  // Back to the text, which is still there.
  await page.getByTestId('serial-text').click();
  await expect(page.getByTestId('serial')).toBeVisible();
});
