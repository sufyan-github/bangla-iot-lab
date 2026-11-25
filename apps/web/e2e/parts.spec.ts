import { expect, test, type Page } from '@playwright/test';
import { pick } from './pick';
import { withinLabTime } from './lab-time';

/** The wider parts library: placing, operating and reading the parts added in Phase 1. */

const tap = (page: Page, endpoint: string) => page.locator(`[data-endpoint="${endpoint}"]`).click();
const part = (page: Page, id: string) => page.locator(`[data-part="${id}"]`);

async function newCircuit(page: Page) {
  await page.goto('/');
  await page.getByTestId('new-project').click();
  await expect(page).toHaveURL(/\/lab\//);
}
async function place(page: Page, tool: string, hole: string) {
  await pick(page, tool);
  await tap(page, hole);
}
async function wire(page: Page, pairs: [string, string][]) {
  await pick(page, 'wire');
  for (const [from, to] of pairs) {
    await tap(page, from);
    await tap(page, to);
  }
  await pick(page, 'select');
}

test('every part in the palette can be placed, and the circuit still solves', async ({ page }) => {
  await newCircuit(page);
  await pick(page, 'battery');
  const tools = [
    ['resistor', 'BB1.a1'],
    ['led', 'BB1.a7'],
    ['button', 'BB1.a10'],
    ['switch', 'BB1.a14'],
    ['potentiometer', 'BB1.a18'],
    ['capacitor', 'BB1.a22'],
    ['diode', 'BB1.a26'],
    ['transistor', 'BB1.h1'],
    ['buzzer', 'BB1.h5'],
    ['motor', 'BB1.h9'],
    ['ldr', 'BB1.h14'],
    ['temperature', 'BB1.h18'],
    ['soilmodule', 'BB1.h22'],
    ['ir', 'BB1.h26'],
    ['relay', 'BB1.e20'],
    ['servo', 'BB1.e1'],
    ['ultrasonic', 'BB1.j1'],
    ['lcd', 'BB1.j8'],
    ['dht11', 'BB1.j25'],
  ] as const;
  for (const [tool, hole] of tools) await place(page, tool, hole);
  await expect(page.locator('[data-part]')).toHaveCount(tools.length + 1);

  await wire(page, [['BAT1.pos', 'BB1.tp1']]);
  await page.getByTestId('run').click();
  await expect(page.getByTestId('meter')).toContainText('V');
  await expect(page.locator('[data-diag^="solver-failed"]')).toHaveCount(0);
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'saved');

  // Everything is still there after a reload.
  await page.reload();
  await expect(page.locator('[data-part]')).toHaveCount(tools.length + 1);
});

test('a switch turns the LED on and off while the circuit runs', async ({ page }) => {
  await newCircuit(page);
  await pick(page, 'battery');
  await place(page, 'switch', 'BB1.a1'); // a1 – a3
  await place(page, 'resistor', 'BB1.b3'); // b3 – b7
  await place(page, 'led', 'BB1.c7'); // c7 – c8
  await wire(page, [
    ['BAT1.pos', 'BB1.b1'],
    ['BB1.d8', 'BAT1.neg'],
  ]);
  await page.getByTestId('run').click();
  await expect(part(page, 'LED1')).toHaveAttribute('data-led-state', 'off');
  // The whole battery voltage sits across the open switch.
  await expect(part(page, 'S1')).toHaveAttribute('data-voltage', '9.000');

  await page.locator('[data-press="S1"]').click();
  await expect(part(page, 'LED1')).toHaveAttribute('data-led-state', 'on');
  await page.locator('[data-press="S1"]').click();
  await expect(part(page, 'LED1')).toHaveAttribute('data-led-state', 'off');
});

test('a temperature sensor on the board follows its slider', async ({ page }) => {
  await newCircuit(page);
  await pick(page, 'uno');
  await place(page, 'temperature', 'BB1.c10'); // legs: c10 supply, c11 output, c12 ground
  await wire(page, [
    ['UNO1.5v', 'BB1.a10'],
    ['UNO1.a0', 'BB1.a11'],
    ['UNO1.gnd', 'BB1.a12'],
  ]);
  await page.getByTestId('run').click();
  await expect(part(page, 'TMP1')).toHaveAttribute('data-voltage', '0.750'); // 25 °C on a TMP36

  await page.locator('[data-hit="TMP1"]').click();
  await page.getByTestId('slider').fill('40');
  await expect(part(page, 'TMP1')).toHaveAttribute('data-voltage', '0.900');
  await expect(page.getByTestId('inspector')).toContainText('৪০°C');
});

test('a buzzer sounds when powered and can be muted', async ({ page }) => {
  await newCircuit(page);
  await pick(page, 'battery');
  await place(page, 'buzzer', 'BB1.a1');
  await expect(page.getByTestId('mute')).toBeVisible();
  await wire(page, [
    ['BAT1.pos', 'BB1.b1'],
    ['BB1.b3', 'BAT1.neg'],
  ]);
  await page.getByTestId('run').click();
  await expect(part(page, 'BZ1')).toHaveAttribute('data-activity', '1.00');
  await page.getByTestId('mute').click();
  await expect(page.getByTestId('mute')).toHaveAttribute('aria-pressed', 'false');
  await expect(part(page, 'BZ1')).toHaveAttribute('data-activity', '1.00'); // still shown as sounding
});

test('the buzzer module sounds on HIGH, or on LOW once set so', async ({ page }) => {
  await newCircuit(page);
  await pick(page, 'battery');
  await place(page, 'buzzermodule', 'BB1.a1'); // pins: a1 S, a2 +, a3 −
  // S and + to the battery's +, − to its −.
  await wire(page, [
    ['BAT1.pos', 'BB1.b1'],
    ['BAT1.pos', 'BB1.b2'],
    ['BB1.b3', 'BAT1.neg'],
  ]);
  await page.getByTestId('run').click();
  await expect(part(page, 'BZ1')).toHaveAttribute('data-activity', '1.00');

  // A board that sounds on LOW is silent with S HIGH.
  await page.locator('[data-hit="BZ1"]').click();
  await page.getByTestId('buzzer-trigger').getByRole('button').nth(1).click();
  await expect(part(page, 'BZ1')).toHaveAttribute('data-activity', '0.00');
});

test('the soil sensor board: AO falls as the soil gets wetter, and DO lights past the trimmer', async ({
  page,
}) => {
  await newCircuit(page);
  await pick(page, 'uno');
  await place(page, 'soilmodule', 'BB1.c10'); // pins: c10 VCC, c11 GND, c12 DO, c13 AO
  await wire(page, [
    ['UNO1.5v', 'BB1.a10'],
    ['UNO1.gnd', 'BB1.a11'],
  ]);
  await page.getByTestId('run').click();
  // 30% wet: AO at 0.9 − 0.6 × 0.3 = 0.72 of 5 V, and DO still HIGH.
  await expect(part(page, 'SOIL1')).toHaveAttribute('data-voltage', '3.600');
  await expect(part(page, 'SOIL1')).toHaveAttribute('data-activity', '0.00');

  await page.locator('[data-hit="SOIL1"]').click();
  await page.getByTestId('slider-moisture').fill('0.8');
  await expect(part(page, 'SOIL1')).toHaveAttribute('data-voltage', '2.100');
  await expect(part(page, 'SOIL1')).toHaveAttribute('data-activity', '1.00');
});

/** Picks a ready-made program for the board, then returns to the circuit. */
async function chooseStarter(page: Page, starter: string) {
  await page.getByTestId('tab-code').click();
  await page.getByTestId('starter').selectOption(starter);
  await expect(page.getByTestId('upload-status').locator('[data-uploaded]')).toBeVisible();
}

test('a servo follows the angle its program sets', async ({ page }) => {
  // The sweep takes about three seconds each way on a real board. A loaded
  // machine emulates the board slower than that, and this test is about where
  // the servo goes, not how fast: so it waits generously.
  test.setTimeout(90_000);
  await newCircuit(page);
  await pick(page, 'uno');
  await place(page, 'servo', 'BB1.c10'); // legs: c10 ground, c11 supply, c12 signal
  await wire(page, [
    ['UNO1.gnd', 'BB1.a10'],
    ['UNO1.5v', 'BB1.a11'],
    ['UNO1.d9', 'BB1.a12'],
  ]);
  await chooseStarter(page, 'servo');
  await page.getByTestId('tab-circuit').click();
  await page.getByTestId('run').click();

  const angle = async () => Number(await part(page, 'SRV1').getAttribute('data-angle'));
  // Waited for in the lab's own time: the sweep takes a few seconds of it, however busy the computer.
  await withinLabTime(page, 15_000, async () => expect(await angle()).toBeGreaterThan(150));
  await withinLabTime(page, 15_000, async () => expect(await angle()).toBeLessThan(30));
});

test('an ultrasonic sensor reports the distance set on its slider', async ({ page }) => {
  await newCircuit(page);
  await pick(page, 'uno');
  await place(page, 'ultrasonic', 'BB1.c10'); // legs: c10 supply, c11 trig, c12 echo, c13 ground
  await wire(page, [
    ['UNO1.5v', 'BB1.a10'],
    ['UNO1.d7', 'BB1.a11'],
    ['UNO1.d6', 'BB1.a12'],
    ['UNO1.gnd', 'BB1.a13'],
  ]);
  await chooseStarter(page, 'distance');
  await page.getByTestId('run').click();
  // 50 cm by default; pulseIn() reads a little short, as on a real board.
  await expect(page.getByTestId('serial')).toContainText(/(49|50)\s+(49|50)\s/);

  await page.getByTestId('tab-circuit').click();
  await page.locator('[data-hit="US1"]').click();
  await page.getByTestId('slider').fill('120');
  await page.getByTestId('tab-code').click();
  await expect(page.getByTestId('serial')).toContainText(/(119|120)\s+(119|120)\s/);
});

test('an LCD shows the text its program prints', async ({ page }) => {
  await newCircuit(page);
  await pick(page, 'uno');
  await place(page, 'lcd', 'BB1.h5'); // sixteen legs along row h, columns 5 to 20
  await wire(page, [
    ['UNO1.gnd', 'BB1.j5'], // VSS
    ['UNO1.5v', 'BB1.j6'], // VDD
    ['UNO1.d12', 'BB1.j8'], // RS
    ['UNO1.d11', 'BB1.j10'], // E
    ['UNO1.d5', 'BB1.j15'], // D4
    ['UNO1.d4', 'BB1.j16'], // D5
    ['UNO1.d3', 'BB1.j17'], // D6
    ['UNO1.d2', 'BB1.j18'], // D7
  ]);
  await chooseStarter(page, 'lcd');
  await page.getByTestId('tab-circuit').click();
  await expect(part(page, 'LCD1')).not.toHaveAttribute('data-lcd', /.+/);
  await page.getByTestId('run').click();
  await expect(part(page, 'LCD1')).toHaveAttribute('data-lcd', /^Hello, Bangla! {2}\|\d+ s/);
  await expect(part(page, 'LCD1')).toContainText('H');
});
