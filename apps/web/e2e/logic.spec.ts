import { expect, test, type Page } from '@playwright/test';
import { pick } from './pick';
import { withinLabTime } from './lab-time';

/** 74HC logic chips on the breadboard, and the truth-table tool. */

const tap = (page: Page, endpoint: string) => page.locator(`[data-endpoint="${endpoint}"]`).click();
async function place(page: Page, tool: string, hole: string) {
  await pick(page, tool);
  await tap(page, hole);
}

test('a logic chip sits across the gap wherever it is tapped, and can be swapped', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByTestId('new-project').click();
  await expect(page).toHaveURL(/\/lab\//);
  // Tapped in row b: the chip still lands with pin 1 in row f.
  await place(page, 'logic', 'BB1.b10');
  const chip = page.locator('[data-part="U1"]');
  await expect(chip).toBeVisible();
  await expect(chip).toContainText('74HC08');
  await page.locator('[data-hit="U1"]').click();
  await expect(page.getByTestId('flip')).toHaveCount(0);
  await page.getByTestId('logic-chip').selectOption('74HC00');
  await expect(chip).toContainText('74HC00');
});

test('the truth table appears once there is a switch and an LED', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('new-project').click();
  await pick(page, 'battery');
  await place(page, 'switch', 'BB1.a1');
  await expect(page.getByTestId('truth-table')).toHaveCount(0);
  await place(page, 'led', 'BB1.a20');
  await pick(page, 'select');
  await page.getByTestId('make-table').click();
  // One switch: two rows.
  await expect(page.getByTestId('table-row')).toHaveCount(2);
});

test('the diagram draws a chip with its gates in use inside it', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('new-project').click();
  await pick(page, 'battery');
  await place(page, 'logic', 'BB1.e10');
  await page.locator('[data-hit="U1"]').click();
  await page.getByTestId('logic-chip').selectOption('74HC00');
  await place(page, 'led', 'BB1.c20');
  await pick(page, 'wire');
  for (const [from, to] of [
    ['BAT1.pos', 'BB1.a10'],
    ['BAT1.neg', 'BB1.j16'],
    ['BB1.g10', 'BB1.b10'],
    ['BB1.h12', 'BB1.a20'],
    ['BB1.a21', 'BB1.i16'],
  ]) {
    await tap(page, from!);
    await tap(page, to!);
  }
  await pick(page, 'select');
  await page.getByTestId('view-diagram').click();
  const symbol = page.getByTestId('diagram').locator('[data-symbol="U1"]');
  await expect(symbol).toContainText('74HC00');
  // One NAND gate in use, with its legs named as in the datasheet.
  await expect(symbol.locator('[data-gates="1"]')).toHaveCount(1);
  await expect(symbol.locator('[data-gates]')).toContainText('1Y');
  if (process.env.GATE_SHOT)
    await page.getByTestId('diagram').screenshot({ path: process.env.GATE_SHOT });
});

test('a 74HC74 flip-flop and a clock module, whose frequency the inspector sets', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByTestId('new-project').click();
  await place(page, 'logic', 'BB1.e10');
  await page.locator('[data-hit="U1"]').click();
  await page.getByTestId('logic-chip').selectOption('74HC74');
  await expect(page.locator('[data-part="U1"]')).toContainText('74HC74');
  // The clock module's legs: c20 VCC, c21 OUT, c22 GND.
  await place(page, 'clock', 'BB1.c20');
  const clock = page.locator('[data-part="CLK1"]');
  await expect(clock).toContainText('1 Hz');
  await pick(page, 'select');
  await page.locator('[data-hit="CLK1"]').click();
  await page.getByTestId('slider-hz').fill('2');
  await expect(clock).toContainText('2 Hz');
});

test('a seven-segment display lights the segment it is given current for', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('new-project').click();
  await pick(page, 'battery');
  // Legs: h20 e, h21 d, h22 COM, h23 c, h24 DP; d24 b, d23 a, d22 COM, d21 f, d20 g.
  await place(page, 'sevenseg', 'BB1.e20');
  const display = page.locator('[data-part="DS1"]');
  await expect(display.locator('[data-segment]')).toHaveCount(8);
  // Segment a through 1 kΩ from the battery; COM to its negative.
  await place(page, 'resistor', 'BB1.a23');
  await pick(page, 'wire');
  for (const [from, to] of [
    ['BAT1.pos', 'BB1.b27'],
    ['BAT1.neg', 'BB1.j22'],
  ]) {
    await tap(page, from!);
    await tap(page, to!);
  }
  await page.getByTestId('run').click();
  await expect(display.locator('[data-segment="a"]')).toHaveAttribute('data-lit', 'true');
  await expect(display.locator('[data-segment="b"]')).toHaveAttribute('data-lit', 'false');
  await pick(page, 'select');
  await page.locator('[data-hit="DS1"]').click();
  await page.getByTestId('display-kind').locator('button').nth(1).click(); // common anode
  await expect(display.locator('[data-segment="a"]')).toHaveAttribute('data-lit', 'false');
});

test('a 16-pin chip can be swapped between the counter and the decoder', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('new-project').click();
  await place(page, 'logic16', 'BB1.e5');
  const chip = page.locator('[data-part="U1"]');
  await expect(chip).toContainText('74HC161');
  await pick(page, 'select');
  await page.locator('[data-hit="U1"]').click();
  await page.getByTestId('logic-chip').selectOption('CD4511');
  await expect(chip).toContainText('CD4511');
});

test('the logic analyser has a row for a chip leg joined to a clock module', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('new-project').click();
  await pick(page, 'battery');
  // A 74HC74 at e10 (pin 3, 1CLK, in column 12 below the gap) and a clock module at c20.
  await place(page, 'logic', 'BB1.e10');
  await page.locator('[data-hit="U1"]').click();
  await page.getByTestId('logic-chip').selectOption('74HC74');
  await place(page, 'clock', 'BB1.c20');
  await pick(page, 'wire');
  for (const [from, to] of [
    ['BAT1.pos', 'BB1.a20'],
    ['BAT1.neg', 'BB1.a22'],
    ['BB1.a21', 'BB1.j12'],
  ]) {
    await tap(page, from!);
    await tap(page, to!);
  }
  await pick(page, 'select');
  await page.getByTestId('tab-signals').click();
  const legs = page.getByTestId('analyser-legs');
  await expect(legs).toContainText('U1 1CLK');
  await expect(legs).toContainText('CLK1 OUT');
  // Its probe can be chosen for the oscilloscope too.
  await page.getByTestId('channel-2').selectOption('pin:U1.p3');
  await page.getByTestId('run').click();
  await expect
    .poll(async () => Number(await page.getByTestId('stats-2').getAttribute('data-max')), {
      timeout: 6000,
    })
    .toBeGreaterThan(4);

  // A trigger on the clock's rising edge: armed, the picture holds when it comes.
  await page.getByTestId('trigger-source').selectOption('pin:CLK1.out');
  await page.getByTestId('trigger-rise').click();
  await page.getByTestId('trigger-arm').click();
  const state = page.getByTestId('trigger-state');
  await withinLabTime(page, 4000, () =>
    expect(state).toHaveAttribute('data-state', 'held', { timeout: 300 }),
  );
  const at = Number(await state.getAttribute('data-at'));
  expect(at).toBeGreaterThan(0);
  // Held: the edge stays where it was while the circuit runs on.
  await page.waitForTimeout(500);
  await expect(state).toHaveAttribute('data-at', String(at));
  await page.getByTestId('trigger-arm').click();
  await expect(state).toHaveAttribute('data-state', 'idle');
});
