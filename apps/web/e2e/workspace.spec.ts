import { expect, test, type Page } from '@playwright/test';
import { nothingChosen } from './panels';
import { pick } from './pick';

/**
 * How the lab's screen is shared out (D-106): the parts list and the work
 * panel are narrow rails, so the board has the room. These tests start from a
 * browser that has chosen nothing.
 */
test.use({ storageState: nothingChosen });

const widthOf = (page: Page, testid: string) =>
  page.getByTestId(testid).evaluate((element) => Math.round(element.getBoundingClientRect().width));

async function openLedExample(page: Page) {
  await page.goto('/');
  await page.getByTestId('open-example').click();
  await expect(page.getByTestId('canvas-frame')).toBeVisible();
}

test.describe('on a wide screen', () => {
  test.skip(({ isMobile }) => isMobile, 'the rails open under a mouse');

  test('the rails leave the board the room, and the parts open under the pointer', async ({
    page,
  }) => {
    await openLedExample(page);
    const rail = page.getByTestId('parts-rail');
    await expect(rail).toHaveAttribute('data-open', 'false');
    // Of 1366 px, the two rails take 140: the board has the rest.
    expect(await widthOf(page, 'canvas-frame')).toBeGreaterThan(1200);

    // Under the pointer the list widens to show names, and a part stays where it was.
    const led = page.getByTestId('tool-led');
    await led.scrollIntoViewIfNeeded();
    const before = await led.boundingBox();
    await rail.hover();
    await expect(rail).toHaveAttribute('data-open', 'true');
    await expect(page.getByTestId('parts-search')).toBeVisible();
    const after = await led.boundingBox();
    expect(after!.y).toBe(before!.y);
    expect(after!.x).toBe(before!.x);

    // Picking a part folds the list at once, so the board is clear to place it.
    await led.click();
    await expect(led).toHaveAttribute('aria-pressed', 'true');
    await expect(rail).toHaveAttribute('data-open', 'false');
    await expect(page.getByTestId('parts-search')).toHaveCount(0);
  });

  test('the work panel opens over the board, and can be kept open', async ({ page }) => {
    await openLedExample(page);
    const panel = page.getByTestId('work-panel');
    const body = page.getByTestId('work-panel-body');
    await expect(panel).toHaveAttribute('data-open', 'false');
    await expect(body).toBeHidden();
    const board = await widthOf(page, 'canvas-frame');

    // Under the pointer it opens over the board, which keeps its size; Run stays in reach.
    await page.getByTestId('tab-circuit').hover();
    await expect(body).toBeVisible();
    expect(await widthOf(page, 'canvas-frame')).toBe(board);
    await expect(page.getByTestId('run')).toBeInViewport();
    await page.getByTestId('run').hover();
    await expect(body).toBeHidden();

    // Kept open, it stands beside the board, and is still there after a reload.
    await page.getByTestId('tab-circuit').hover();
    await page.getByTestId('panel-keep').click();
    await expect(panel).toHaveAttribute('data-kept', 'true');
    await page.getByTestId('run').hover();
    await expect(body).toBeVisible();
    expect(await widthOf(page, 'canvas-frame')).toBeLessThan(board);
    await page.reload();
    await expect(page.getByTestId('work-panel')).toHaveAttribute('data-kept', 'true');
    await expect(page.getByTestId('work-panel-body')).toBeVisible();
  });

  test('"the board alone" puts both rails away, and brings them back', async ({ page }) => {
    await openLedExample(page);
    const only = page.getByTestId('canvas-only');
    await only.click();
    await expect(only).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('parts-rail')).toHaveCount(0);
    await expect(page.getByTestId('work-panel')).toHaveCount(0);
    expect(await widthOf(page, 'canvas-frame')).toBe(1366);
    await only.click();
    await expect(page.getByTestId('parts-rail')).toBeVisible();
    await expect(page.getByTestId('work-panel')).toBeVisible();
  });

  test('a part is still picked and placed with the rails folded', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('new-project').click();
    await pick(page, 'resistor');
    await page.locator('[data-endpoint="BB1.a5"]').click();
    await expect(page.locator('[data-part="R1"]')).toBeVisible();
  });
});

test.describe('on a phone', () => {
  test.skip(({ isMobile }) => !isMobile, 'the narrow column that opens on a tap');

  test('the parts are a narrow column; a first tap opens it, a second picks', async ({ page }) => {
    await openLedExample(page);
    const rail = page.getByTestId('parts-rail');
    await expect(rail).toHaveAttribute('data-open', 'false');
    expect(await widthOf(page, 'parts-rail')).toBe(48);

    // A finger on a drawing opens the list first, so the part is chosen by its name.
    const led = page.getByTestId('tool-led');
    await led.tap();
    await expect(rail).toHaveAttribute('data-open', 'true');
    await expect(led).toHaveAttribute('aria-pressed', 'false');
    await led.tap();
    await expect(led).toHaveAttribute('aria-pressed', 'true');
    await expect(rail).toHaveAttribute('data-open', 'false');
  });
});
