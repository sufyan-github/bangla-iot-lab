import { expect, test, type Page } from '@playwright/test';
import { writeProgram } from './editor';

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
  await writeProgram(
    page,
    'void setup() {\n  Serial.begin(9600);\n}\n\nvoid loop() {\n  Serial.println(analogRead(A0) / 100);\n  delay(100);\n}\n',
  );
  await expect(page.getByTestId('starter')).toHaveValue('custom');
  await page.getByTestId('upload').click();
  // A compile on a busy machine can take many seconds; this is not a test of its speed.
  await expect(page.getByTestId('upload-status').locator('[data-uploaded]')).toBeVisible({
    timeout: 30_000,
  });

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
  await writeProgram(
    page,
    'void setup() {\n  pinMode(13, OUTPUT);\n  digitalWrit(13, HIGH);\n}\nvoid loop() {}\n',
  );
  await page.getByTestId('upload').click();
  const status = page.getByTestId('upload-status');
  await expect(status).toContainText('digitalWrit', { timeout: 30_000 });
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
  await writeProgram(page, 'void setup() {}\nvoid loop() {}\n');
  await expect(page.getByTestId('upload')).toBeDisabled();
  await expect(page.getByTestId('upload-status')).toContainText('ইন্টারনেট');
  await page.getByTestId('starter').selectOption('blink');
  await expect(page.getByTestId('upload-status').locator('[data-uploaded]')).toBeVisible();
});

test('the oscilloscope and logic analyser show the blinking pin', async ({ page }) => {
  await openUnoExample(page);
  await page.getByTestId('tab-signals').click();
  await expect(page.getByTestId('channel-1')).toHaveValue('part:LED1');
  await page.getByTestId('run').click();

  // LED voltage swings between dark (about 0 V) and lit (about 1.78 V), half the time each.
  const stats = page.getByTestId('stats-1');
  await expect
    .poll(async () => Number(await stats.getAttribute('data-max')), { timeout: 6000 })
    .toBeGreaterThan(1.7);
  expect(Number(await stats.getAttribute('data-max'))).toBeLessThan(1.9);
  await page.getByTestId('span-5000').click();
  // Over several blinks the average settles near half the lit voltage (about 0.9 V).
  await expect
    .poll(
      async () => {
        const average = Number(await stats.getAttribute('data-average'));
        return average > 0.6 && average < 1.2;
      },
      { timeout: 10_000 },
    )
    .toBe(true);
  expect(Math.abs(Number(await stats.getAttribute('data-min')))).toBeLessThan(0.05);

  // A second channel on the pin itself: 0 V to nearly 5 V.
  await page.getByTestId('channel-2').selectOption('socket:UNO1.d13');
  const pin = page.getByTestId('stats-2');
  await expect
    .poll(async () => Number(await pin.getAttribute('data-max')), { timeout: 6000 })
    .toBeGreaterThan(4.5);
});

test('a capacitor charges over time on the oscilloscope', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('new-project').click();
  await page.getByTestId('tool-battery').click();
  await page.getByTestId('tool-resistor').click();
  await tap(page, 'a5');
  await page.getByTestId('tool-capacitor').click();
  await tap(page, 'b9');
  await page.getByTestId('tool-wire').click();
  for (const [from, to] of [
    ['BAT1.pos', 'c5'],
    ['c11', 'BAT1.neg'],
  ]) {
    await tap(page, from);
    await tap(page, to);
  }
  // 330 Ω and 100 µF: time constant 33 ms, so it is full within a fraction of a second.
  await page.getByTestId('tab-signals').click();
  await expect(page.getByTestId('channel-1')).toHaveValue('part:C1');
  await page.getByTestId('run').click();
  const stats = page.getByTestId('stats-1');
  await expect
    .poll(async () => Number(await stats.getAttribute('data-max')), { timeout: 6000 })
    .toBeGreaterThan(8.9);
  expect(Number(await stats.getAttribute('data-max'))).toBeLessThanOrEqual(9.001);
  expect(Number(await stats.getAttribute('data-min'))).toBeLessThan(2); // it started empty
});
