import { expect, test } from '@playwright/test';

/** The UNO emulator and the compile round trip: browser → API → sandboxed worker → emulator. */

test('runs the ready-made firmware on the emulated UNO without the server', async ({
  page,
  context,
}) => {
  await page.goto('/bench');
  // Once the app has installed itself, everything this page needs is on the device.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise((resolve) =>
        navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }),
      );
    }
  });
  await context.setOffline(true);
  await page.getByTestId('run-built-in').click();

  await expect(page.getByTestId('serial')).toHaveText('blink');
  const pin = page.getByTestId('pin13');
  await expect(pin).toHaveAttribute('data-on', 'true');
  await expect(pin).toHaveAttribute('data-on', 'false');
  await expect(pin).toHaveAttribute('data-on', 'true');
  // Compiling is clearly unavailable offline rather than failing mysteriously.
  await expect(page.getByTestId('compile-run')).toBeDisabled();
});

test('compiles edited source on the server and runs the result', async ({ page }) => {
  await page.goto('/bench');
  const source = await page.getByTestId('source').inputValue();
  await page
    .getByTestId('source')
    .fill(
      source.replaceAll('"blink\\n"', '"hello lab\\n"').replace('_delay_ms(500)', '_delay_ms(100)'),
    );
  await page.getByTestId('compile-run').click();

  await expect(page.getByTestId('serial')).toHaveText('hello lab');
  const pin = page.getByTestId('pin13');
  await expect(pin).toHaveAttribute('data-on', 'true');
  await expect(pin).toHaveAttribute('data-on', 'false');
});

test('shows compile errors with their line numbers', async ({ page }) => {
  await page.goto('/bench');
  await page.getByTestId('source').fill('int main(void) {\n  PORTZ = 1;\n}\n');
  await page.getByTestId('compile-run').click();
  await expect(page.getByTestId('compile-status')).toContainText('PORTZ');
  await expect(page.getByTestId('compile-status')).toContainText('২');
});
