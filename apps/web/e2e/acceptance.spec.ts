import { expect, test, type Page } from '@playwright/test';

/**
 * Phase 0 acceptance: "A student can create a basic LED circuit, run it,
 * observe correct behaviour, save it, and reopen it offline."
 */

const tap = (page: Page, endpoint: string) => page.locator(`[data-endpoint="${endpoint}"]`).click();
const led = (page: Page) => page.locator('[data-part="LED1"]');

async function ledCurrentMilliamps(page: Page): Promise<number> {
  return Number(await led(page).getAttribute('data-current-ma'));
}

/** Names of the projects in this browser's own storage. */
function savedProjectNames(page: Page): Promise<string[]> {
  return page.evaluate(
    () =>
      new Promise<string[]>((resolve, reject) => {
        const open = indexedDB.open('banglalab');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const all = open.result.transaction('projects').objectStore('projects').getAll();
          all.onerror = () => reject(all.error);
          all.onsuccess = () => {
            open.result.close();
            resolve((all.result as { name: string }[]).map((project) => project.name));
          };
        };
      }),
  );
}

async function waitUntilOfflineReady(page: Page) {
  // The service worker precaches the app during install; once it controls the
  // page, every later load can be served without a network.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise((resolve) =>
        navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }),
      );
    }
  });
}

test('build an LED circuit, run it, save it and reopen it offline', async ({ page, context }) => {
  await page.goto('/');
  await page.getByTestId('new-project').click();
  await expect(page).toHaveURL(/\/lab\//);

  // --- build: battery, resistor, LED and four wires, placed by tapping ---
  await page.getByTestId('tool-battery').click();
  await page.getByTestId('tool-resistor').click();
  await tap(page, 'c5');
  await page.getByTestId('tool-led').click();
  await tap(page, 'd9');
  await page.getByTestId('tool-wire').click();
  for (const [from, to] of [
    ['BAT1.pos', 'tp1'],
    ['BAT1.neg', 'tn1'],
    ['tp4', 'a5'],
    ['a10', 'tn8'],
  ]) {
    await tap(page, from);
    await tap(page, to);
  }
  await expect(page.locator('[data-wire]')).toHaveCount(4);

  // --- run: the LED lights with the current a hand calculation predicts ---
  await expect(led(page)).toHaveAttribute('data-led-state', 'idle');
  await page.getByTestId('run').click();
  await expect(led(page)).toHaveAttribute('data-led-state', 'on');
  const current = await ledCurrentMilliamps(page);
  const handCalculated = ((9 - 1.8) / 330) * 1000; // 21.8 mA
  expect(Math.abs(current - handCalculated) / handCalculated).toBeLessThan(0.02);
  await expect(page.getByTestId('meter-current')).toContainText('mA');
  await expect(page.getByTestId('meter-voltage')).toContainText('V');
  await expect(page.locator('[data-diag="led-on"]')).toBeVisible();

  // --- save: happens automatically, on this device ---
  await page.getByTestId('project-name').fill('আমার LED সার্কিট');
  // Check the device's own storage, not only the indicator: "saved" on screen could be left
  // over from the edit before, and the page is about to be reloaded.
  await expect.poll(() => savedProjectNames(page)).toContain('আমার LED সার্কিট');
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'saved');
  await page.getByTestId('run').click(); // stop

  // --- reopen with no network at all ---
  await waitUntilOfflineReady(page);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId('offline-banner')).toBeVisible();
  await expect(page.getByTestId('project-name')).toHaveValue('আমার LED সার্কিট');
  await expect(page.locator('[data-wire]')).toHaveCount(4);

  await page.getByTestId('run').click();
  await expect(led(page)).toHaveAttribute('data-led-state', 'on');
  expect(await ledCurrentMilliamps(page)).toBeCloseTo(current, 2);

  // The project is also listed on the home page, still offline.
  await page.goto('/');
  await expect(page.getByTestId('project-link')).toContainText('আমার LED সার্কিট');
  await page.getByTestId('project-link').click();
  await expect(page.getByTestId('project-name')).toHaveValue('আমার LED সার্কিট');
});

test('explains common mistakes and keeps working after each fix', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('open-example').click();
  await page.getByTestId('run').click();
  await expect(led(page)).toHaveAttribute('data-led-state', 'on');

  // LED the wrong way round.
  await page.locator('[data-hit="LED1"]').click();
  await page.getByTestId('flip').click();
  await expect(led(page)).toHaveAttribute('data-led-state', 'reversed');
  await expect(page.locator('[data-diag="led-reversed-LED1"]')).toContainText('LED1');
  await page.getByTestId('flip').click();
  await expect(led(page)).toHaveAttribute('data-led-state', 'on');

  // Resistor too small.
  await page.locator('[data-hit="R1"]').click();
  await page.getByTestId('resistance').selectOption('100');
  await expect(led(page)).toHaveAttribute('data-led-state', 'overcurrent');
  await expect(page.locator('[data-diag="led-overcurrent-LED1"]')).toBeVisible();
  await page.getByTestId('resistance').selectOption('470');
  await expect(led(page)).toHaveAttribute('data-led-state', 'on');

  // Removing a wire opens the circuit.
  await page.locator('[data-hit="W4"]').click({ force: true });
  await page.getByTestId('remove').click();
  await expect(led(page)).toHaveAttribute('data-led-state', 'off');
  await expect(page.locator('[data-diag^="open-circuit"]')).toBeVisible();

  // A refused edit is explained and changes nothing.
  await page.getByTestId('tool-led').click();
  await tap(page, 'c5');
  await expect(page.getByTestId('notice')).toBeVisible();
  await expect(page.locator('[data-part]')).toHaveCount(3);
});

test('dragging a lead moves it; a plain tap does not', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('open-example').click();
  await page.getByTestId('run').click();
  await page.locator('[data-hit="LED1"]').click();
  const handle = page.locator('[data-handle="LED1.cathode"]');
  const box = await handle.boundingBox();
  if (!box) throw new Error('handle not on screen');
  const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

  // A tap that lands off-centre on the handle must not nudge the lead to the next hole.
  await page.mouse.click(centre.x + 6, centre.y + 6);
  await expect(led(page)).toHaveAttribute('data-led-state', 'on');

  // Drag the cathode from d10 to e9. Column 9 already holds the anode, so both
  // legs then share a strip and the LED goes dark.
  const pitch = (24 * Number(await page.locator('svg[role="img"]').getAttribute('width'))) / 960;
  await page.mouse.move(centre.x, centre.y);
  await page.mouse.down();
  await page.mouse.move(centre.x - pitch, centre.y + pitch, { steps: 6 });
  await page.mouse.up();
  await expect(led(page)).toHaveAttribute('data-led-state', 'off');
  await expect(page.locator('[data-diag="legs-in-same-strip-LED1"]')).toBeVisible();
});

test('switches between Bangla and English', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('আমার সার্কিট');
  await expect(page.locator('html')).toHaveAttribute('lang', 'bn');
  await page.getByTestId('language').click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('My circuits');
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('My circuits');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});

test('the application carries its licence notices and the firmware source offer', async ({
  page,
  request,
}) => {
  await page.goto('/');
  await page.getByTestId('nav-licences').click();
  const notices = page.getByTestId('licences');
  await expect(notices.locator('[data-notice="app"]')).toContainText('Apache-2.0');
  // The starter firmware is LGPL: the notice must say so and point at its source.
  const firmware = notices.locator('[data-notice="firmware"]');
  await expect(firmware).toContainText('LGPL-2.1-or-later');
  await expect(firmware.locator('a[href*="third_party/arduino-avr"]')).toHaveCount(1);
  // The licence texts are served with the application itself.
  for (const file of ['LICENSE.txt', 'NOTICE.txt', 'LGPL-2.1.txt', 'THIRD_PARTY_LICENSES.md']) {
    const response = await request.get(`/licences/${file}`);
    expect(response.ok(), file).toBe(true);
  }
  expect(await (await request.get('/licences/LGPL-2.1.txt')).text()).toContain(
    'GNU LESSER GENERAL PUBLIC LICENSE',
  );
});
