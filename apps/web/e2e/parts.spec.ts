import { expect, test, type Page } from '@playwright/test';

/** The wider parts library: placing, operating and reading the parts added in Phase 1. */

const tap = (page: Page, endpoint: string) => page.locator(`[data-endpoint="${endpoint}"]`).click();
const part = (page: Page, id: string) => page.locator(`[data-part="${id}"]`);

async function newCircuit(page: Page) {
  await page.goto('/');
  await page.getByTestId('new-project').click();
  await expect(page).toHaveURL(/\/lab\//);
}
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

test('every part in the palette can be placed, and the circuit still solves', async ({ page }) => {
  await newCircuit(page);
  await page.getByTestId('tool-battery').click();
  const tools = [
    ['resistor', 'a1'],
    ['led', 'a7'],
    ['button', 'a10'],
    ['switch', 'a14'],
    ['potentiometer', 'a18'],
    ['capacitor', 'a22'],
    ['diode', 'a26'],
    ['transistor', 'h1'],
    ['buzzer', 'h5'],
    ['motor', 'h9'],
    ['ldr', 'h14'],
    ['temperature', 'h18'],
    ['soil', 'h22'],
    ['ir', 'h26'],
    ['relay', 'e20'],
    ['servo', 'e1'],
    ['ultrasonic', 'j1'],
    ['lcd', 'j8'],
  ] as const;
  for (const [tool, hole] of tools) await place(page, tool, hole);
  await expect(page.locator('[data-part]')).toHaveCount(tools.length + 1);

  await wire(page, [['BAT1.pos', 'tp1']]);
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
  await page.getByTestId('tool-battery').click();
  await place(page, 'switch', 'a1'); // a1 – a3
  await place(page, 'resistor', 'b3'); // b3 – b7
  await place(page, 'led', 'c7'); // c7 – c8
  await wire(page, [
    ['BAT1.pos', 'b1'],
    ['d8', 'BAT1.neg'],
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
  await page.getByTestId('tool-uno').click();
  await place(page, 'temperature', 'c10'); // legs: c10 supply, c11 output, c12 ground
  await wire(page, [
    ['UNO1.5v', 'a10'],
    ['UNO1.a0', 'a11'],
    ['UNO1.gnd', 'a12'],
  ]);
  await page.getByTestId('run').click();
  await expect(part(page, 'TMP1')).toHaveAttribute('data-voltage', '0.250'); // 25 °C

  await page.locator('[data-hit="TMP1"]').click();
  await page.getByTestId('slider').fill('40');
  await expect(part(page, 'TMP1')).toHaveAttribute('data-voltage', '0.400');
  await expect(page.getByTestId('inspector')).toContainText('৪০°C');
});

test('a buzzer sounds when powered and can be muted', async ({ page }) => {
  await newCircuit(page);
  await page.getByTestId('tool-battery').click();
  await place(page, 'buzzer', 'a1');
  await expect(page.getByTestId('mute')).toBeVisible();
  await wire(page, [
    ['BAT1.pos', 'b1'],
    ['b3', 'BAT1.neg'],
  ]);
  await page.getByTestId('run').click();
  await expect(part(page, 'BZ1')).toHaveAttribute('data-activity', '1.00');
  await page.getByTestId('mute').click();
  await expect(page.getByTestId('mute')).toHaveAttribute('aria-pressed', 'false');
  await expect(part(page, 'BZ1')).toHaveAttribute('data-activity', '1.00'); // still shown as sounding
});

/** Picks a ready-made program for the board, then returns to the circuit. */
async function chooseStarter(page: Page, starter: string) {
  await page.getByTestId('tab-code').click();
  await page.getByTestId('starter').selectOption(starter);
  await expect(page.getByTestId('upload-status').locator('[data-uploaded]')).toBeVisible();
}

test('a servo follows the angle its program sets', async ({ page }) => {
  await newCircuit(page);
  await page.getByTestId('tool-uno').click();
  await place(page, 'servo', 'c10'); // legs: c10 ground, c11 supply, c12 signal
  await wire(page, [
    ['UNO1.gnd', 'a10'],
    ['UNO1.5v', 'a11'],
    ['UNO1.d9', 'a12'],
  ]);
  await chooseStarter(page, 'servo');
  await page.getByTestId('tab-circuit').click();
  await page.getByTestId('run').click();

  const angle = async () => Number(await part(page, 'SRV1').getAttribute('data-angle'));
  await expect.poll(angle, { timeout: 8000 }).toBeGreaterThan(150);
  await expect.poll(angle, { timeout: 8000 }).toBeLessThan(30);
});

test('an ultrasonic sensor reports the distance set on its slider', async ({ page }) => {
  await newCircuit(page);
  await page.getByTestId('tool-uno').click();
  await place(page, 'ultrasonic', 'c10'); // legs: c10 supply, c11 trig, c12 echo, c13 ground
  await wire(page, [
    ['UNO1.5v', 'a10'],
    ['UNO1.d7', 'a11'],
    ['UNO1.d6', 'a12'],
    ['UNO1.gnd', 'a13'],
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
  await page.getByTestId('tool-uno').click();
  await place(page, 'lcd', 'h5'); // sixteen legs along row h, columns 5 to 20
  await wire(page, [
    ['UNO1.gnd', 'j5'], // VSS
    ['UNO1.5v', 'j6'], // VDD
    ['UNO1.d12', 'j8'], // RS
    ['UNO1.d11', 'j10'], // E
    ['UNO1.d5', 'j15'], // D4
    ['UNO1.d4', 'j16'], // D5
    ['UNO1.d3', 'j17'], // D6
    ['UNO1.d2', 'j18'], // D7
  ]);
  await chooseStarter(page, 'lcd');
  await page.getByTestId('tab-circuit').click();
  await expect(part(page, 'LCD1')).not.toHaveAttribute('data-lcd', /.+/);
  await page.getByTestId('run').click();
  await expect(part(page, 'LCD1')).toHaveAttribute('data-lcd', /^Hello, Bangla! {2}\|\d+ s/);
  await expect(part(page, 'LCD1')).toContainText('H');
});
