import { expect, test, type Page } from '@playwright/test';
import { writeProgram } from './editor';

/**
 * The ESP32 board (experimental): ready-made programs run from the lab's own
 * board library, against the simulated circuit, with no server.
 */

const led = (page: Page) => page.locator('[data-part="LED1"]');
const ledState = (page: Page) => led(page).getAttribute('data-led-state');
/**
 * How often to look at the LED. Not a round number on purpose: looking once a
 * second at a lamp that blinks once a second sees the same half of the blink
 * every time.
 */
const SAMPLING = { timeout: 15_000, intervals: [70, 110, 130] };

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
  await expect.poll(() => ledState(page), SAMPLING).toBe('on');
  // A red LED through 220 ohms from 3.3 V: about 6 mA, less than half what 5 V gives.
  const current = Number(await led(page).getAttribute('data-current-ma'));
  expect(current).toBeGreaterThan(4);
  expect(current).toBeLessThan(8);
  await expect.poll(() => ledState(page), SAMPLING).toBe('off');
  await expect.poll(() => ledState(page), SAMPLING).toBe('on');
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
  expect(offered).toEqual([
    'blink',
    'button',
    'fade',
    'knob',
    'servo',
    'distance',
    'dht',
    'custom',
  ]);
});

test('the button program lights the LED while the button is held', async ({ page }) => {
  await openEsp32Example(page);
  await chooseStarter(page, 'button');
  await page.getByTestId('run').click();
  await expect.poll(() => ledState(page), SAMPLING).toBe('off');

  const button = page.locator('[data-press="SW1"]');
  await button.scrollIntoViewIfNeeded();
  const box = await button.boundingBox();
  if (!box) throw new Error('button not on screen');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect.poll(() => ledState(page), SAMPLING).toBe('on');
  await page.mouse.up();
  await expect.poll(() => ledState(page), SAMPLING).toBe('off');
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
  await writeProgram(
    page,
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
  await writeProgram(
    page,
    'void setup() {\n  pinMode(2, OUTPUT);\n  digitalWrit(2, HIGH);\n}\nvoid loop() {}\n',
  );
  await page.getByTestId('upload').click();
  const status = page.getByTestId('upload-status');
  await expect(status).toContainText('digitalWrit', { timeout: 30_000 });
  await expect(status).toContainText('লাইন ৩');

  // The board still has Blink on it.
  await page.getByTestId('tab-circuit').click();
  await expect.poll(() => ledState(page), SAMPLING).toBe('on');
  await expect.poll(() => ledState(page), SAMPLING).toBe('off');
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

/**
 * The second way of running an ESP32 program: the board's real firmware, built
 * by the compile server with Espressif's toolchain, in an emulator of the chip.
 * The first build after the server starts compiles the Arduino core, so these
 * tests wait longer than the others.
 */
async function uploadForEmulator(page: Page) {
  await page.getByTestId('tab-code').click();
  await page.getByTestId('engine-emulator').check();
  await expect(page.getByTestId('esp32-note')).toContainText('esp32sim');
  await expect(page.getByTestId('upload')).toBeEnabled();
  await page.getByTestId('upload').click();
  await expect(page.getByTestId('upload-status').locator('[data-uploaded]')).toBeVisible({
    timeout: 120_000,
  });
}

test('the ESP32 can run the board’s real software in an emulator of the chip', async ({ page }) => {
  test.setTimeout(240_000);
  await openEsp32Example(page);
  await uploadForEmulator(page);
  await page.getByTestId('tab-circuit').click();
  await page.getByTestId('run').click();
  const slow = { timeout: 60_000, intervals: [70, 110, 130] };
  await expect.poll(() => ledState(page), slow).toBe('on');
  const current = Number(await led(page).getAttribute('data-current-ma'));
  expect(current).toBeGreaterThan(4);
  expect(current).toBeLessThan(8);
  await expect.poll(() => ledState(page), slow).toBe('off');
  // Every real ESP32 prints this line of its start-up code when it is switched on.
  await page.getByTestId('tab-code').click();
  await expect(page.getByTestId('serial')).toContainText('ets Jul 29 2019');
});

test('the lab says so when the emulated chip cannot keep up with a real board', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await openEsp32Example(page);
  await page.getByTestId('tab-code').click();
  // A loop that never waits: the emulator has to run every one of its instructions.
  await writeProgram(
    page,
    'unsigned long next = 0;\nvoid setup() { pinMode(2, OUTPUT); }\nvoid loop() {\n  if (millis() >= next) { digitalWrite(2, !digitalRead(2)); next += 300; }\n}\n',
  );
  await expect(page.getByTestId('starter')).toHaveValue('custom');
  await page.getByTestId('engine-emulator').check();
  await page.getByTestId('upload').click();
  await expect(page.getByTestId('upload-status').locator('[data-uploaded]')).toBeVisible({
    timeout: 120_000,
  });
  await page.getByTestId('tab-circuit').click();
  await page.getByTestId('run').click();
  await expect(page.getByText(/আসল সময়ের চেয়ে ধীরে চলছে/)).toBeVisible({ timeout: 60_000 });
  // It still runs, in slow motion: the LED does change.
  await expect
    .poll(() => ledState(page), { timeout: 90_000, intervals: [70, 110, 130] })
    .toBe('on');
});

test('going back to the lab’s own model runs the ready-made program again, offline', async ({
  page,
}) => {
  await openEsp32Example(page);
  await page.getByTestId('tab-code').click();
  await page.getByTestId('engine-emulator').check();
  // The program on the board was built for the other engine: it has to be uploaded again.
  await expect(page.getByTestId('upload-status').locator('[data-uploaded]')).toHaveCount(0);
  await page.getByTestId('engine-library').check();
  await expect(page.getByTestId('upload-status').locator('[data-uploaded]')).toBeVisible();
  await page.getByTestId('tab-circuit').click();
  await page.getByTestId('run').click();
  await expect.poll(() => ledState(page), SAMPLING).toBe('on');
});

// ---- parts of the school kit on the ESP32 ----

const tap = (page: Page, endpoint: string) => page.locator(`[data-endpoint="${endpoint}"]`).click();
async function place(page: Page, tool: string, hole: string) {
  await page.getByTestId(`tool-${tool}`).click();
  await tap(page, hole);
}
async function wire(page: Page, pairs: [string, string][]) {
  await page.getByTestId('tool-wire').click();
  for (const [from, to] of pairs) {
    await tap(page, from);
    await tap(page, to);
  }
  await page.getByTestId('tool-select').click();
}
async function newEsp32Circuit(page: Page) {
  await page.goto('/');
  await page.getByTestId('new-project').click();
  await expect(page).toHaveURL(/\/lab\//);
  await page.getByTestId('tool-esp32').click();
  await expect(page.locator('[data-part="ESP1"]')).toBeVisible();
}

test('a DHT11 on the ESP32 is read by the program and follows its sliders', async ({ page }) => {
  await newEsp32Circuit(page);
  await place(page, 'dht11', 'c10'); // legs: c10 supply, c11 data, c12 ground
  await wire(page, [
    ['ESP1.3v3', 'a10'],
    ['ESP1.d4', 'a11'],
    ['ESP1.gnd1', 'a12'],
  ]);
  await chooseStarter(page, 'dht');
  await page.getByTestId('run').click();
  await page.getByTestId('tab-code').click();
  const serial = page.getByTestId('serial');
  // The part arrives set to 28 °C and 70 %; the program asks every two seconds.
  await expect(serial).toContainText('তাপমাত্রা 28 °C, আর্দ্রতা 70 %', { timeout: 20_000 });

  await page.getByTestId('tab-circuit').click();
  await page.locator('[data-hit="DHT1"]').click();
  await page.getByTestId('slider-celsius').fill('35');
  await page.getByTestId('slider-humidity').fill('82');
  await page.getByTestId('tab-code').click();
  await expect(serial).toContainText('তাপমাত্রা 35 °C, আর্দ্রতা 82 %', { timeout: 20_000 });
});

test('a servo on the ESP32 sweeps when it is powered from VIN', async ({ page }) => {
  test.setTimeout(90_000);
  await newEsp32Circuit(page);
  await place(page, 'servo', 'c10'); // legs: c10 ground, c11 supply, c12 signal
  await wire(page, [
    ['ESP1.gnd1', 'a10'],
    ['ESP1.vin', 'a11'],
    ['ESP1.d13', 'a12'],
  ]);
  await chooseStarter(page, 'servo');
  await page.getByTestId('run').click();
  const angle = async () =>
    Number(await page.locator('[data-part="SRV1"]').getAttribute('data-angle'));
  await expect.poll(angle, { timeout: 30_000, intervals: [70, 110, 130] }).toBeGreaterThan(150);
  await expect.poll(angle, { timeout: 30_000, intervals: [70, 110, 130] }).toBeLessThan(30);
});

test('the lab warns when the ultrasonic sensor’s 5 V echo goes straight into an ESP32 pin', async ({
  page,
}) => {
  await newEsp32Circuit(page);
  await place(page, 'ultrasonic', 'c10'); // legs: c10 supply, c11 trig, c12 echo, c13 ground
  await wire(page, [
    ['ESP1.vin', 'a10'],
    ['ESP1.d5', 'a11'],
    ['ESP1.d18', 'a12'],
    ['ESP1.gnd1', 'a13'],
  ]);
  await chooseStarter(page, 'distance');
  await page.getByTestId('run').click();
  await expect(page.locator('[data-diag^="pin-overvoltage"]')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('[data-diag^="pin-overvoltage"]')).toContainText('D18');
});
