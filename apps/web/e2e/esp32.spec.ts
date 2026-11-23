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
    'light',
    'motion',
    'rgb',
    'oled',
    'motor',
    'rain',
    'soil',
    'gas',
    'obstacle',
    'beep',
    'streetlight',
    'rainalert',
    'dustbin',
    'security',
    'plant',
    'airquality',
    'parking',
    'robot',
    'counter',
    'relay',
    'watering',
    'water',
    'power',
    'weather',
    'monitor',
    'thermo',
    'gps',
    'air',
    'bluetooth',
    'mp3',
    'sms',
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
  // The first frame lit can be only partly on when the emulated chip runs slower than
  // a real board, so wait for the current to settle rather than reading it once.
  const current = () => led(page).getAttribute('data-current-ma').then(Number);
  await expect.poll(current, slow).toBeGreaterThan(4);
  expect(await current()).toBeLessThan(8);
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

// ---- the kit's simple sensors and its RGB LED ----

const partAttribute = (page: Page, id: string, name: string) =>
  page.locator(`[data-part="${id}"]`).getAttribute(name);

test('the kit’s five new parts can be placed and are kept', async ({ page }) => {
  await newEsp32Circuit(page);
  const tools = [
    ['ldrmodule', 'a1'],
    ['rain', 'a6'],
    ['mq135', 'a11'],
    ['pir', 'a16'],
    ['rgbled', 'a20'],
  ] as const;
  for (const [tool, hole] of tools) await place(page, tool, hole);
  await expect(page.locator('[data-part]')).toHaveCount(tools.length + 1);
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'saved');
  await page.reload();
  await expect(page.locator('[data-part]')).toHaveCount(tools.length + 1);
});

test('an LDR module lights the LED in the dark, and its own light when it is bright', async ({
  page,
}) => {
  await newEsp32Circuit(page);
  await place(page, 'ldrmodule', 'c10'); // legs: c10 VCC, c11 GND, c12 DO, c13 AO
  await place(page, 'resistor', 'c20'); // c20 – c24
  await place(page, 'led', 'e24'); // e24 – e25
  await wire(page, [
    ['ESP1.3v3', 'a10'],
    ['ESP1.gnd1', 'a11'],
    ['ESP1.d27', 'a12'],
    ['ESP1.d34', 'a13'],
    ['ESP1.d2', 'a20'],
    ['ESP1.gnd2', 'a25'],
  ]);
  await chooseStarter(page, 'light');
  await page.getByTestId('run').click();
  // It arrives in middling light, which the module still counts as dark: DO is HIGH.
  await expect.poll(() => ledState(page), SAMPLING).toBe('on');
  await expect.poll(() => partAttribute(page, 'LDM1', 'data-activity')).toBe('0.00');

  await page.locator('[data-hit="LDM1"]').click();
  await page.getByTestId('slider-light').fill('0.95');
  await expect.poll(() => ledState(page), SAMPLING).toBe('off');
  await expect.poll(() => partAttribute(page, 'LDM1', 'data-activity')).toBe('1.00');
  // AO in bright light: a tenth of 3.3 V or so.
  const volts = Number(await partAttribute(page, 'LDM1', 'data-voltage'));
  expect(volts).toBeGreaterThan(0.2);
  expect(volts).toBeLessThan(0.6);
});

test('a motion sensor holds its output after the movement stops', async ({ page }) => {
  await newEsp32Circuit(page);
  await place(page, 'pir', 'c10'); // legs: c10 VCC, c11 OUT, c12 GND
  await wire(page, [
    ['ESP1.vin', 'a10'],
    ['ESP1.d27', 'a11'],
    ['ESP1.gnd1', 'a12'],
  ]);
  await page.getByTestId('run').click();
  const high = () => partAttribute(page, 'PIR1', 'data-activity');
  await expect.poll(high).toBe('0.00');
  // Something moves, then stops at once.
  await page.locator('[data-press="PIR1"]').click();
  await expect.poll(high, SAMPLING).toBe('1.00');
  await page.locator('[data-press="PIR1"]').click();
  // Still HIGH a second later; LOW once its three seconds are over.
  await page.waitForTimeout(1000);
  expect(await high()).toBe('1.00');
  await expect.poll(high, SAMPLING).toBe('0.00');
  await expect(page.locator('[data-diag^="module-underpowered"]')).toHaveCount(0);
});

test('a motion sensor on 3.3 V does nothing, and the lab says why', async ({ page }) => {
  await newEsp32Circuit(page);
  await place(page, 'pir', 'c10');
  await wire(page, [
    ['ESP1.3v3', 'a10'],
    ['ESP1.gnd1', 'a12'],
  ]);
  await page.getByTestId('run').click();
  await page.locator('[data-press="PIR1"]').click();
  await expect(page.locator('[data-diag^="module-underpowered"]')).toBeVisible();
  expect(await partAttribute(page, 'PIR1', 'data-activity')).toBe('0.00');
});

test('the RGB LED shows the colours the program mixes', async ({ page }) => {
  await newEsp32Circuit(page);
  await place(page, 'rgbled', 'e10'); // legs: e10 R, e11 G, e12 B, e13 −
  // A resistor for each colour, each ending in that colour's column.
  await place(page, 'resistor', 'c6'); // c6 – c10
  await place(page, 'resistor', 'd7'); // d7 – d11
  await place(page, 'resistor', 'b8'); // b8 – b12
  await wire(page, [
    ['ESP1.d25', 'a6'],
    ['ESP1.d26', 'a7'],
    ['ESP1.d27', 'a8'],
    ['ESP1.gnd1', 'a13'],
  ]);
  await chooseStarter(page, 'rgb');
  await page.getByTestId('run').click();
  const colours = () => partAttribute(page, 'RGB1', 'data-colours');
  // Each colour alone, then the mixtures, a second each.
  for (const mix of ['r', 'g', 'b', 'rg', 'gb', 'rb', 'rgb']) {
    await expect.poll(colours, SAMPLING).toBe(mix);
  }
  await expect(page.locator('[data-diag^="led-"]')).toHaveCount(0);
});

test('the OLED display shows what the program draws, and stays dark with its wires swapped', async ({
  page,
}) => {
  await newEsp32Circuit(page);
  await place(page, 'oled', 'c10'); // legs: c10 GND, c11 VCC, c12 SCL, c13 SDA
  await wire(page, [
    ['ESP1.gnd1', 'a10'],
    ['ESP1.3v3', 'a11'],
    ['ESP1.d22', 'a12'],
    ['ESP1.d21', 'a13'],
  ]);
  await chooseStarter(page, 'oled');
  await page.getByTestId('run').click();
  const lit = async () => Number(await partAttribute(page, 'OLED1', 'data-oled'));
  // The title, a line, a large digit and a square: several hundred lit pixels.
  await expect.poll(lit, SAMPLING).toBeGreaterThan(300);
  // The square is filled on even counts and empty on odd ones, so the picture changes.
  const first = await lit();
  await expect.poll(lit, SAMPLING).not.toBe(first);
  await page.locator('[data-hit="OLED1"]').click();
  await expect(page.getByTestId('oled-preview')).toHaveAttribute('data-lit', 'true');
  await expect(page.locator('[data-diag^="pin-over"], [data-diag^="module-"]')).toHaveCount(0);
});

test('an OLED display with SCL and SDA swapped shows nothing', async ({ page }) => {
  await newEsp32Circuit(page);
  await place(page, 'oled', 'c10');
  await wire(page, [
    ['ESP1.gnd1', 'a10'],
    ['ESP1.3v3', 'a11'],
    ['ESP1.d21', 'a12'],
    ['ESP1.d22', 'a13'],
  ]);
  await chooseStarter(page, 'oled');
  await page.getByTestId('run').click();
  await page.waitForTimeout(2500);
  expect(await partAttribute(page, 'OLED1', 'data-oled')).toBe('dark');
});

// ---- the motor driver and the battery pack ----

test('the motor program runs a motor both ways through the L298N driver', async ({ page }) => {
  test.setTimeout(90_000);
  await newEsp32Circuit(page);
  await page.getByTestId('tool-battery').click();
  // The kit's pack of six AA cells.
  await page.getByRole('button', { name: /7[.,]2|৭[.,]২/ }).click();
  await page.getByTestId('tool-l298n').click();
  await expect(page.locator('[data-part="DRV1"]')).toBeVisible();
  // Speed comes from the program, so the ENA jumper is taken off.
  await page.getByTestId('jumper-enaJumper').getByRole('button').nth(1).click();
  await place(page, 'motor', 'c10'); // legs: c10 and c13
  await wire(page, [
    ['BAT1.pos', 'DRV1.vs'],
    ['BAT1.neg', 'DRV1.gnd'],
    ['ESP1.gnd1', 'DRV1.gnd'],
    ['ESP1.d25', 'DRV1.ena'],
    ['ESP1.d26', 'DRV1.in1'],
    ['ESP1.d27', 'DRV1.in2'],
    ['DRV1.out1', 'a10'],
    ['DRV1.out2', 'a13'],
  ]);
  await chooseStarter(page, 'motor');
  await page.getByTestId('run').click();
  await expect(page.locator('[data-part="DRV1"]')).toHaveAttribute('data-awake', 'true');
  const speed = async () => Number(await partAttribute(page, 'M1', 'data-activity'));
  // Forwards at nearly full speed, stopped, then backwards at about half.
  await expect.poll(speed, SAMPLING).toBeGreaterThan(0.85);
  await expect.poll(speed, SAMPLING).toBe(0);
  await expect.poll(speed, SAMPLING).toBeLessThan(-0.35);
  await expect(page.locator('[data-diag^="pin-over"], [data-diag^="module-"]')).toHaveCount(0);
});

// ---- saved settings (Preferences) ----

test('saved settings outlast stopping the circuit and a reload, and can be erased', async ({
  page,
}) => {
  await newEsp32Circuit(page);
  await chooseStarter(page, 'counter');
  const serial = page.getByTestId('serial');
  const runOnce = async (expected: string) => {
    await page.getByTestId('run').click();
    await page.getByTestId('tab-code').click();
    await expect(serial).toContainText(expected, { timeout: 15_000 });
    await page.getByTestId('run').click();
    await page.getByTestId('tab-circuit').click();
  };
  await runOnce('বোর্ড চালু হয়েছে 1 বার');
  await runOnce('বোর্ড চালু হয়েছে 2 বার');

  // The board's inspector shows what is saved; kept with the project after a reload.
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'saved');
  await page.reload();
  await page.locator('[data-hit="ESP1"]').click();
  const saved = page.getByTestId('saved-settings');
  await expect(saved).toHaveAttribute('data-count', '1');
  await expect(saved.getByTestId('saved-setting')).toContainText('starts = 2');
  await runOnce('বোর্ড চালু হয়েছে 3 বার');

  // Erasing is only offered while the circuit is stopped.
  await page.getByTestId('run').click();
  await page.locator('[data-hit="ESP1"]').click();
  await expect(page.getByTestId('erase-settings')).toBeDisabled();
  await page.getByTestId('run').click();
  await page.locator('[data-hit="ESP1"]').click();
  await page.getByTestId('erase-settings').click();
  await expect(saved).toHaveAttribute('data-count', '0');
  await runOnce('বোর্ড চালু হয়েছে 1 বার');
});
