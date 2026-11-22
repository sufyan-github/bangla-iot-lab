import { expect, test, type Page } from '@playwright/test';

/** The kit lessons: the list, a lesson's steps checked by the lab, and progress kept on the device. */

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
const checks = (page: Page) => page.getByTestId('lesson-check');
async function expectStepDone(page: Page) {
  await expect(checks(page).and(page.locator('[data-passed="false"]'))).toHaveCount(0, {
    timeout: 15_000,
  });
}

test('the lessons page lists the kit lessons, then the projects, in order', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('nav-lessons').click();
  await expect(page).toHaveURL(/\/lessons$/);
  const parts = page.getByTestId('lesson-list').getByTestId('lesson-card');
  await expect(parts).toHaveCount(17);
  await expect(parts.first()).toHaveAttribute('data-lesson', 'esp32-blink');
  await expect(parts.last()).toHaveAttribute('data-lesson', 'saved-settings');
  await expect(parts.first()).toHaveAttribute('data-state', 'new');
  const projects = page.getByTestId('project-lesson-list').getByTestId('lesson-card');
  await expect(projects).toHaveCount(8);
  await expect(projects.first()).toHaveAttribute('data-lesson', 'street-light');
  await expect(projects.last()).toHaveAttribute('data-lesson', 'obstacle-robot');
  // Each project names the lessons worth taking first.
  await expect(projects.first().getByTestId('lesson-after')).toBeVisible();
});

test('a project opens with its own numbering and its battery in place', async ({ page }) => {
  await page.goto('/lessons');
  const robot = page.locator('[data-lesson="obstacle-robot"]');
  await robot.getByTestId('lesson-start').click();
  const panel = page.getByTestId('lesson-panel');
  await expect(panel).toHaveAttribute('data-lesson', 'obstacle-robot');
  await expect(panel).toContainText(/প্রকল্প ৮|Project 8/);
  await expect(page.locator('[data-part="BAT1"]')).toBeVisible();
  await expect(page.locator('[data-part="ESP1"]')).toBeVisible();
});

test('the first lesson is checked step by step, and its progress is kept', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/lessons');
  await page.getByTestId('lesson-start').first().click();
  await expect(page).toHaveURL(/\/lab\//);
  const panel = page.getByTestId('lesson-panel');
  await expect(panel).toHaveAttribute('data-lesson', 'esp32-blink');
  await expect(page.locator('[data-part="ESP1"]')).toBeVisible();

  // Step 1 is read and passed.
  await page.getByTestId('lesson-next').click();

  // Step 2: the LED and its resistor, wired to D2. Nothing is done until it is all there.
  await expect(checks(page)).toHaveCount(4);
  await expect(checks(page).first()).toHaveAttribute('data-passed', 'false');
  await page.getByTestId('tab-circuit').click();
  await place(page, 'resistor', 'c20'); // c20 – c24
  await place(page, 'led', 'e24'); // e24 – e25
  await wire(page, [
    ['ESP1.d2', 'a20'],
    ['ESP1.gnd2', 'a25'],
  ]);
  await page.getByTestId('tab-lesson').click();
  await expectStepDone(page);
  await expect(page.getByTestId('lesson-step').nth(1)).toHaveAttribute('data-done', 'true');
  await page.getByTestId('lesson-next').click();

  // Step 3: the lesson's program goes on the board.
  await expect(checks(page).first()).toHaveAttribute('data-passed', 'false');
  await page.getByTestId('lesson-program').click();
  await expectStepDone(page);
  await page.getByTestId('lesson-next').click();

  // Step 4: run it, and see the LED both lit and dark.
  await page.getByTestId('run').click();
  await expect(page.getByTestId('lesson-finished')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('lesson-open-next')).toBeVisible();
  await page.getByTestId('run').click();

  // Kept on this device: after a reload the lesson is still finished.
  await page.reload();
  await expect(page.getByTestId('lesson-finished')).toBeVisible();
  await page.goto('/lessons');
  await expect(page.getByTestId('lesson-card').first()).toHaveAttribute('data-state', 'done');
  await expect(page.getByTestId('lesson-card').nth(1)).toHaveAttribute('data-state', 'new');
});

test('a step that is not done says what is still missing', async ({ page }) => {
  await page.goto('/lessons');
  await page.getByTestId('lesson-start').nth(1).click(); // the LED and its resistor
  await expect(page.getByTestId('lesson-panel')).toHaveAttribute('data-lesson', 'led-resistor');
  await page.getByTestId('lesson-next').click();
  // The LED straight on 3V3, without its resistor: joined, but not as the step asks.
  await page.getByTestId('tab-circuit').click();
  await place(page, 'led', 'e24');
  await wire(page, [
    ['ESP1.3v3', 'a24'],
    ['ESP1.gnd2', 'a25'],
  ]);
  await page.getByTestId('tab-lesson').click();
  await expect(checks(page).nth(0)).toHaveAttribute('data-passed', 'true'); // an LED is there
  await expect(checks(page).nth(1)).toHaveAttribute('data-passed', 'false'); // no resistor
  await expect(checks(page).nth(2)).toHaveAttribute('data-passed', 'true'); // its − to GND
  await expect(page.getByTestId('lesson-step').nth(1)).toHaveAttribute('data-done', 'false');
});

test('the private handbook text is not in an ordinary build', async ({ page }) => {
  await page.goto('/lessons');
  await page.getByTestId('lesson-start').first().click();
  await expect(page.getByTestId('lesson-panel')).toBeVisible();
  await expect(page.getByTestId('lesson-handbook')).toHaveCount(0);
});
