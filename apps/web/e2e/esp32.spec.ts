import { expect, test, type Page } from '@playwright/test';

/**
 * The ESP32 board (experimental): ready-made programs run from the lab's own
 * board library, against the simulated circuit, with no server.
 */

const led = (page: Page) => page.locator('[data-part="LED1"]');
const ledState = (page: Page) => led(page).getAttribute('data-led-state');

async function openEsp32Example(page: Page) {
  await page.goto('/');
  await page.getByTestId('open-example-esp32').click();
  await expect(page.locator('[data-part="ESP1"]')).toBeVisible();
}

async function chooseStarter(page: Page, starter: string) {
  await page.getByTestId('tab-code').click();
  await page.getByTestId('starter').selectOption(starter);
  await expect(page.getByTestId('upload-status').locator('[data-uploaded]')).toBeVisible();
  await page.getByTestId('tab-circuit').click();
}

test('the ESP32 example blinks its LED from a 3.3 V pin', async ({ page }) => {
  await openEsp32Example(page);
  await page.getByTestId('run').click();
  await expect.poll(() => ledState(page), { timeout: 15_000 }).toBe('on');
  // A red LED through 220 ohms from 3.3 V: about 6 mA, less than half what 5 V gives.
  const current = Number(await led(page).getAttribute('data-current-ma'));
  expect(current).toBeGreaterThan(4);
  expect(current).toBeLessThan(8);
  await expect.poll(() => ledState(page), { timeout: 15_000 }).toBe('off');
  await expect.poll(() => ledState(page), { timeout: 15_000 }).toBe('on');
});

test('the code tab says the ESP32 is experimental and offers only ESP32 programs', async ({
  page,
}) => {
  await openEsp32Example(page);
  await page.getByTestId('tab-code').click();
  await expect(page.getByTestId('code-panel')).toHaveAttribute('data-board', 'esp32');
  await expect(page.getByTestId('esp32-note')).toBeVisible();
  const offered = await page
    .getByTestId('starter')
    .locator('option')
    .evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value));
  expect(offered).toEqual(['blink', 'button', 'fade', 'knob', 'custom']);
});

test('the button program lights the LED while the button is held', async ({ page }) => {
  await openEsp32Example(page);
  await chooseStarter(page, 'button');
  await page.getByTestId('run').click();
  await expect.poll(() => ledState(page), { timeout: 15_000 }).toBe('off');

  const button = page.locator('[data-press="SW1"]');
  await button.scrollIntoViewIfNeeded();
  const box = await button.boundingBox();
  if (!box) throw new Error('button not on screen');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect.poll(() => ledState(page), { timeout: 15_000 }).toBe('on');
  await page.mouse.up();
  await expect.poll(() => ledState(page), { timeout: 15_000 }).toBe('off');
});

test('the knob program prints what the board reads from the potentiometer', async ({ page }) => {
  await openEsp32Example(page);
  await chooseStarter(page, 'knob');
  await page.getByTestId('run').click();
  await page.getByTestId('tab-code').click();
  // Half of 3.3 V reads well below the 2048 an ideal converter would give.
  await expect
    .poll(
      async () => {
        const lines = ((await page.getByTestId('serial').textContent()) ?? '').trim().split(/\s+/);
        return Number(lines.at(-1));
      },
      { timeout: 15_000 },
    )
    .toBeGreaterThan(1700);
  const last = Number(
    ((await page.getByTestId('serial').textContent()) ?? '').trim().split(/\s+/).at(-1),
  );
  expect(last).toBeLessThan(1950);
});

test('an ESP32 board can be added to an empty circuit and removed again', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('new-project').click();
  await page.getByTestId('tool-esp32').click();
  await expect(page.locator('[data-part="ESP1"]')).toBeVisible();
  // One board at a time: with an ESP32 there, a UNO-compatible board is not added.
  await page.getByTestId('tool-uno').click();
  await expect(page.locator('[data-part="UNO1"]')).toHaveCount(0);
  await page.getByTestId('undo').click();
  await expect(page.locator('[data-part="ESP1"]')).toHaveCount(0);
});

test('write an ESP32 program, upload it, and watch it read the potentiometer', async ({ page }) => {
  await openEsp32Example(page);
  await page.getByTestId('run').click();
  await page.getByTestId('tab-code').click();
  await page
    .getByTestId('code')
    .fill(
      'void setup() {\n  Serial.begin(115200);\n  pinMode(2, OUTPUT);\n}\n\nvoid loop() {\n  int tenths = analogReadMilliVolts(34) / 100;\n  digitalWrite(2, tenths > 10);\n  Serial.println(tenths);\n  delay(100);\n}\n',
    );
  await expect(page.getByTestId('starter')).toHaveValue('custom');
  await page.getByTestId('upload').click();
  await expect(page.getByTestId('upload-status').locator('[data-uploaded]')).toBeVisible({
    timeout: 30_000,
  });

  // Knob in the middle: 1.65 V, which the board reports as 16 tenths of a volt.
  const serial = page.getByTestId('serial');
  await expect(serial).toContainText('16\n16\n');
  await page.getByTestId('tab-circuit').click();
  await expect(led(page)).toHaveAttribute('data-led-state', 'on');

  // Turn the knob fully towards the grounded leg while the program keeps running.
  await page.locator('[data-hit="POT1"]').click();
  await page.getByTestId('knob').fill('1');
  await expect(led(page)).toHaveAttribute('data-led-state', 'off');
});

test('an ESP32 compile error points at the line, and the old program keeps running', async ({
  page,
}) => {
  await openEsp32Example(page);
  await page.getByTestId('run').click();
  await page.getByTestId('tab-code').click();
  await page
    .getByTestId('code')
    .fill('void setup() {\n  pinMode(2, OUTPUT);\n  digitalWrit(2, HIGH);\n}\nvoid loop() {}\n');
  await page.getByTestId('upload').click();
  const status = page.getByTestId('upload-status');
  await expect(status).toContainText('digitalWrit', { timeout: 30_000 });
  await expect(status).toContainText('লাইন ৩');

  // The board still has Blink on it.
  await page.getByTestId('tab-circuit').click();
  await expect.poll(() => ledState(page), { timeout: 15_000 }).toBe('on');
  await expect.poll(() => ledState(page), { timeout: 15_000 }).toBe('off');
});

test('the code tab links to a page that says what the ESP32 experiment is and is not', async ({
  page,
}) => {
  await openEsp32Example(page);
  await page.getByTestId('tab-code').click();
  await page.getByTestId('esp32-more').click();
  const about = page.getByTestId('esp32-page');
  await expect(about).toBeVisible();
  // What has not been done is said as plainly as what has.
  const measured = page.getByTestId('esp32-measured');
  await expect(measured).toContainText('৭৪টির মধ্যে ৭৪টি');
  await expect(measured).toContainText('এখনো মাপা হয়নি');
  await expect(measured).toContainText('এখনো করা হয়নি');
  await page.getByTestId('language').click();
  await expect(measured).toContainText('Not measured yet');
});
