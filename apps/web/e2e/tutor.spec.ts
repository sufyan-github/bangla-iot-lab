import { expect, test, type Page } from '@playwright/test';
import { pick } from './pick';

/** The tutor's hints (D-116): asked for, told a step at a time, and gone once fixed. */

const tap = (page: Page, endpoint: string) => page.locator(`[data-endpoint="${endpoint}"]`).click();

test('a hint asks first, then shows where, then says how to fix it, and goes once fixed', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByTestId('new-project').click();
  await expect(page).toHaveURL(/\/lab\//);
  await pick(page, 'battery');
  await pick(page, 'resistor');
  await tap(page, 'BB1.a1'); // a1 – a5
  // The resistor's first leg is joined to the battery; its other leg is in a row of its own.
  await pick(page, 'wire');
  await tap(page, 'BAT1.pos');
  await tap(page, 'BB1.b1');
  await pick(page, 'select');

  await page.getByTestId('tutor').click();
  const card = page.getByTestId('tutor-card');
  await expect(card).toHaveAttribute('data-rule', 'loose-leg');
  await expect(page.getByTestId('tutor-nudge')).toContainText('R1');
  // Nothing is ringed, and no fix is given, until asked for.
  await expect(page.locator('[data-ring="BB1.a5"]')).toHaveCount(0);
  await expect(page.getByTestId('tutor-fix')).toHaveCount(0);

  await page.getByTestId('tutor-where').click();
  await expect(page.locator('[data-ring="BB1.a5"]')).toBeVisible();
  await page.getByTestId('tutor-fix-button').click();
  await expect(page.getByTestId('tutor-fix')).toBeVisible();

  // Wired back to the battery, the leg is joined, and the card says nothing is left to hint at.
  await pick(page, 'wire');
  await tap(page, 'BB1.b5');
  await tap(page, 'BAT1.neg');
  await pick(page, 'select');
  await expect(page.getByTestId('tutor-none')).toBeVisible();
  await expect(page.locator('[data-ring="BB1.a5"]')).toHaveCount(0);

  await page.getByTestId('tutor-close').click();
  await expect(card).toHaveCount(0);
});
