import { expect, test } from '@playwright/test';

/** The glossary (G-1): terms side by side in Bangla and English, found from the lessons too. */

test('the glossary is reached from the menu, and finds a term in either language', async ({
  page,
}) => {
  await page.goto('/');
  // On a phone the page links are behind the menu.
  if (await page.getByTestId('menu').isVisible()) await page.getByTestId('menu').click();
  await page.getByTestId('nav-glossary').click();
  await expect(page).toHaveURL(/\/glossary$/);
  const terms = page.getByTestId('glossary-term');
  await expect(terms.first()).toBeVisible();
  expect(await terms.count()).toBeGreaterThanOrEqual(40);

  // Each term shows both languages: the lab's Bangla word, its English beside it.
  const voltage = page.locator('[data-term="voltage"]');
  await expect(voltage.locator('h3')).toContainText('ভোল্টেজ');
  await expect(voltage.getByTestId('glossary-other')).toHaveText('voltage');
  await expect(voltage).toContainText('বিভব পার্থক্য');

  // A textbook's word finds the lab's term, and so does English in any case.
  const search = page.getByTestId('glossary-search');
  await search.fill('বিভব');
  await expect(terms).toHaveCount(1);
  await expect(terms.first()).toHaveAttribute('data-term', 'voltage');
  await search.fill('RESISTOR');
  await expect(terms.first()).toHaveAttribute('data-term', 'resistor');
  await search.fill('কোনো শব্দ নেই এমন');
  await expect(terms).toHaveCount(0);
  await expect(page.getByTestId('glossary')).toContainText('এই নামে কোনো শব্দ নেই');

  // A topic shows only its terms.
  await search.fill('');
  await page.locator('[data-topic="logic"]').click();
  await expect(page.locator('[data-topic="logic"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-term="flip-flop"]')).toBeVisible();
  await expect(page.locator('[data-term="voltage"]')).toHaveCount(0);
});

test('a link to a term goes to it, and related terms and lessons are linked', async ({ page }) => {
  await page.goto('/glossary#shift-register');
  const entry = page.locator('[data-term="shift-register"]');
  await expect(entry).toBeInViewport();
  await entry.locator('[data-see="flip-flop"]').click();
  await expect(page).toHaveURL(/#flip-flop$/);
  await expect(page.locator('[data-term="flip-flop"]')).toBeInViewport();

  // A common term lists a few lessons, and the rest on request.
  const ground = page.locator('[data-term="ground"]');
  const more = ground.getByTestId('glossary-more-lessons');
  await more.click();
  await expect(more).toHaveCount(0);
  await ground.getByRole('link', { name: /LED আর তার রেজিস্টর/ }).click();
  await expect(page).toHaveURL(/\/lessons#led-resistor$/);
  await expect(page.locator('[data-lesson="led-resistor"]').first()).toBeInViewport();
});

test('in a lesson, a term shows its English and opens its meaning', async ({ page }) => {
  await page.goto('/lessons');
  await page.locator('[data-lesson="led-resistor"]').getByTestId('lesson-start').click();
  await expect(page).toHaveURL(/\/lab\//);
  const term = page
    .getByTestId('lesson-panel')
    .locator('[data-testid="term"][data-term="ohms-law"]');
  await expect(term).toHaveText(/ওহমের সূত্র\s*\(Ohm's law\)/);
  await expect(term).toHaveAttribute('aria-expanded', 'false');

  await term.click();
  const tip = page.getByTestId('lesson-panel').getByTestId('term-tip');
  await expect(tip).toBeVisible();
  await expect(tip).toContainText('I = V ÷ R');
  await expect(tip.getByRole('link')).toHaveAttribute('href', '/glossary#ohms-law');
  await page.keyboard.press('Escape');
  await expect(tip).toBeHidden();
  await expect(term).toHaveAttribute('aria-expanded', 'false');
});
