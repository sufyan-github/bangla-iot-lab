import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

/** The ESP32's own web page, opened in the lab's browser panel. */

test('the web page program joins Wi-Fi and its page switches the LED', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('open-example-esp32').click();
  await expect(page.locator('[data-part="ESP1"]')).toBeVisible();
  await page.getByTestId('tab-code').click();
  await page.getByTestId('starter').selectOption('webserver');
  await expect(page.getByTestId('upload-status').locator('[data-uploaded]')).toBeVisible();
  await page.getByTestId('run').click();

  await page.getByTestId('tab-network').click();
  await page.getByTestId('tab-web').click();
  const shown = page.getByTestId('web-page');
  // The board takes a moment to join the network; until then the panel says so.
  await expect
    .poll(
      async () => {
        await page.getByTestId('web-go').click();
        return shown.isVisible();
      },
      { timeout: 15_000, intervals: [500, 1000] },
    )
    .toBe(true);
  await expect(shown).toHaveAttribute('data-status', '200');
  await expect(shown.locator('iframe')).toHaveAttribute('sandbox', '');

  // The page's own link switches the LED on.
  await page.getByTestId('web-links').getByRole('button', { name: 'জ্বালাও' }).click();
  await page.getByTestId('tab-circuit').click();
  await expect
    .poll(() => page.locator('[data-part="LED1"]').getAttribute('data-led-state'), {
      timeout: 10_000,
    })
    .toBe('on');
});

test('a program asks the lab’s made-up web services, and the panel lists its requests', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByTestId('open-example-esp32').click();
  await expect(page.locator('[data-part="ESP1"]')).toBeVisible();
  await page.getByTestId('tab-code').click();
  await page.getByTestId('starter').selectOption('webclient');
  await expect(page.getByTestId('upload-status').locator('[data-uploaded]')).toBeVisible();
  await page.getByTestId('run').click();

  await page.getByTestId('tab-network').click();
  await page.getByTestId('tab-web').click();
  const calls = page.getByTestId('web-call');
  // Newest first: the reading kept in log.lab, after the weather it asked for.
  await expect(calls.first()).toContainText('log.lab', { timeout: 15_000 });
  await expect(calls.first()).toHaveAttribute('data-status', '201');
  await expect(calls.nth(1)).toContainText('http://weather.lab/now?city=Dhaka');
  await expect(calls.nth(1)).toHaveAttribute('data-status', '200');
});

test('the browser panel says why a board without Wi-Fi cannot be reached', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('open-example-esp32').click();
  await page.getByTestId('run').click();
  await page.getByTestId('tab-network').click();
  await page.getByTestId('tab-web').click();
  await page.getByTestId('web-go').click();
  await expect(page.getByTestId('web-problem')).toBeVisible();
});

test('the MQTT program shows the knob on the IoT dashboard, and "on" lights the LED', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByTestId('open-example-esp32').click();
  await page.getByTestId('tab-code').click();
  await page.getByTestId('starter').selectOption('mqtt');
  await expect(page.getByTestId('upload-status').locator('[data-uploaded]')).toBeVisible();
  await page.getByTestId('run').click();
  await page.getByTestId('tab-network').click();
  await page.getByTestId('tab-iot').click();
  const knob = page.locator('[data-testid="iot-topic"][data-topic="lab/knob"]');
  await expect(knob).toBeVisible({ timeout: 15_000 });
  await expect(knob.getByTestId('iot-value')).toHaveText(/^\d+$/);
  // Every message so far, as a data log.
  const download = page.waitForEvent('download');
  await page.getByTestId('iot-csv').click();
  const csv = readFileSync((await (await download).path())!, 'utf8');
  expect(csv).toContain('time_s,from,topic,payload');
  expect(csv).toMatch(/\r\n[\d.]+,ESP1,lab\/knob,\d+\r\n/);
  await page.getByTestId('iot-topic-input').fill('lab/led');
  await page.getByTestId('iot-quick-on').click();
  await page.getByTestId('tab-circuit').click();
  await expect
    .poll(() => page.locator('[data-part="LED1"]').getAttribute('data-led-state'), {
      timeout: 10_000,
    })
    .toBe('on');
});
