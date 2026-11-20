import { expect, test, type Page } from '@playwright/test';

/**
 * Phase 1: an Arduino UNO in the circuit. Programs are compiled by the real
 * API and sandboxed worker, run on the emulated processor, and drive the
 * simulated circuit.
 */

const tap = (page: Page, endpoint: string) => page.locator(`[data-endpoint="${endpoint}"]`).click();
const led = (page: Page) => page.locator('[data-part="LED1"]');

async function waitUntilOfflineReady(page: Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise((resolve) =>
        navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }),
      );
    }
  });
}

async function openUnoExample(page: Page) {
  await page.goto('/');
  await page.getByTestId('open-example-uno').click();
  await expect(page.locator('[data-part="UNO1"]')).toBeVisible();
}

test('build a board circuit by tapping; the program blinks the LED, also offline', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await page.getByTestId('new-project').click();

  await page.getByTestId('tool-uno').click();
  await page.getByTestId('tool-resistor').click();
  await tap(page, 'c5');
  await page.getByTestId('tool-led').click();
  await tap(page, 'd9');
  await page.getByTestId('tool-wire').click();
  for (const [from, to] of [
    ['UNO1.d13', 'a5'],
    ['a10', 'UNO1.gnd'],
  ]) {
    await tap(page, from);
    await tap(page, to);
  }

  // A new board already carries Blink, so this needs no server.
  await waitUntilOfflineReady(page);
  await context.setOffline(true);
  await page.getByTestId('run').click();
  await expect(led(page)).toHaveAttribute('data-led-state', 'on');
  await expect(led(page)).toHaveAttribute('data-led-state', 'off');
  await expect(led(page)).toHaveAttribute('data-led-state', 'on');
  await expect(page.locator('[data-diag="program-running"]')).toBeVisible();

  // Pin HIGH: (5 V − 1.8 V) / (330 Ω + 25 Ω pin) ≈ 9 mA.
  await expect
    .poll(async () => Number(await led(page).getAttribute('data-current-ma')), { timeout: 4000 })
    .toBeGreaterThan(8.5);

  // Saved with its firmware: after a reload, still offline, it runs again.
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'saved');
  await page.reload();
  await page.getByTestId('run').click();
  await expect(led(page)).toHaveAttribute('data-led-state', 'on');
  await expect(led(page)).toHaveAttribute('data-led-state', 'off');
});

test('a held push button is read by the program', async ({ page }) => {
  await openUnoExample(page);
  await page.getByTestId('tab-code').click();
  await page.getByTestId('starter').selectOption('button');
  await expect(page.getByTestId('upload-status').locator('[data-uploaded]')).toBeVisible();
  await page.getByTestId('tab-circuit').click();
  await page.getByTestId('run').click();
  await expect(led(page)).toHaveAttribute('data-led-state', 'off');

  const button = page.locator('[data-press="SW1"]');
  await button.scrollIntoViewIfNeeded();
  const box = await button.boundingBox();
  if (!box) throw new Error('button not on screen');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(page.locator('[data-part="SW1"]')).toHaveAttribute('data-pressed', 'true');
  await expect(led(page)).toHaveAttribute('data-led-state', 'on');
  await page.mouse.up();
  await expect(led(page)).toHaveAttribute('data-led-state', 'off');
});

test('write a program, upload it, and watch it read the potentiometer', async ({ page }) => {
  await openUnoExample(page);
  await page.getByTestId('run').click();
  await page.getByTestId('tab-code').click();
  await page
    .getByTestId('code')
    .fill(
      'void setup() {\n  Serial.begin(9600);\n}\n\nvoid loop() {\n  Serial.println(analogRead(A0) / 100);\n  delay(100);\n}\n',
    );
  await expect(page.getByTestId('starter')).toHaveValue('custom');
  await page.getByTestId('upload').click();
  await expect(page.getByTestId('upload-status').locator('[data-uploaded]')).toBeVisible();

  // Knob in the middle: 2.5 V → 511 → prints 5.
  const serial = page.getByTestId('serial');
  await expect(serial).toContainText('5\n5\n');

  // Turn the knob fully towards the grounded leg while the program keeps running.
  await page.getByTestId('tab-circuit').click();
  await page.locator('[data-hit="POT1"]').click();
  await page.getByTestId('knob').fill('1');
  await page.getByTestId('tab-code').click();
  await expect(serial).toContainText('0\n0\n0\n');
});

test('compile errors point at the line, and the old program keeps running', async ({ page }) => {
  await openUnoExample(page);
  await page.getByTestId('run').click();
  await page.getByTestId('tab-code').click();
  await page
    .getByTestId('code')
    .fill('void setup() {\n  pinMode(13, OUTPUT);\n  digitalWrit(13, HIGH);\n}\nvoid loop() {}\n');
  await page.getByTestId('upload').click();
  const status = page.getByTestId('upload-status');
  await expect(status).toContainText('digitalWrit');
  await expect(status).toContainText('লাইন ৩');

  // The board still has Blink on it.
  await page.getByTestId('tab-circuit').click();
  await expect(led(page)).toHaveAttribute('data-led-state', 'on');
  await expect(led(page)).toHaveAttribute('data-led-state', 'off');
});

test('uploading is clearly unavailable offline, and ready-made programs still work', async ({
  page,
  context,
}) => {
  await openUnoExample(page);
  await waitUntilOfflineReady(page);
  await page.getByTestId('tab-code').click();
  await expect(page.getByTestId('code')).toBeVisible(); // editor chunk loaded while online
  await context.setOffline(true);
  await page.getByTestId('code').fill('void setup() {}\nvoid loop() {}\n');
  await expect(page.getByTestId('upload')).toBeDisabled();
  await expect(page.getByTestId('upload-status')).toContainText('ইন্টারনেট');
  await page.getByTestId('starter').selectOption('blink');
  await expect(page.getByTestId('upload-status').locator('[data-uploaded]')).toBeVisible();
});
