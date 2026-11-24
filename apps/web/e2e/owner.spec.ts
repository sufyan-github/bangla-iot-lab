import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import { emailedLink, stamp, teacherWithClass } from './account-helpers';

/**
 * The lab office (D-097). An owner is made the way the real one is: an adult
 * signs up, confirms the email, and the server command grants the role.
 */
test('the owner suspends and restarts a school, and makes a reset link for a teacher', async ({
  page,
  browser,
}) => {
  // A school, made by its teacher on another device.
  const school = `বিদ্যালয় ${stamp()}`;
  const teacherEmail = `t-${stamp()}@example.test`;
  const elsewhere = await browser.newContext();
  await teacherWithClass(await elsewhere.newPage(), teacherEmail, 'সপ্তম ক', school);
  await elsewhere.close();

  const email = `owner-${stamp()}@example.test`;
  await page.goto('/account');
  await page.getByTestId('entry-new').click();
  await page.getByTestId('new-adult').click();
  await page.getByTestId('adult-name').fill('মালিক');
  await page.getByTestId('adult-email').fill(email);
  await page.getByTestId('adult-password').fill('a long pass phrase');
  await page.getByTestId('adult-submit').click();
  await page.goto(await emailedLink(page, email, 'verify'));
  await page.getByTestId('verify-submit').click();
  await expect(page.getByTestId('learner-home')).toBeVisible();
  // Not an owner yet: no link, and the page says so.
  await expect(page.getByTestId('nav-owner')).toHaveCount(0);
  await page.goto('/owner');
  await expect(page.getByTestId('owner-only')).toBeVisible();

  execFileSync('pnpm', ['--filter', '@banglalab/api', 'owner:grant', email], { stdio: 'ignore' });
  await page.reload();
  await expect(page.getByTestId('owner-page')).toBeVisible();
  await expect(page.getByTestId('owner-counts')).toBeVisible();

  // Suspend the school, then start it again.
  await page.getByTestId('owner-search').fill(school);
  const row = page.getByTestId('owner-school').filter({ hasText: school });
  await expect(row.getByTestId('owner-status')).toHaveText(/চালু|Working/);
  // Each change asks first, in a dialog.
  await row.getByTestId('school-suspend').click();
  await page.getByTestId('confirm-yes').click();
  await expect(row.getByTestId('owner-status')).toHaveText(/স্থগিত|Suspended/);
  await row.getByTestId('school-activate').click();
  await page.getByTestId('confirm-yes').click();
  await expect(row.getByTestId('owner-status')).toHaveText(/চালু|Working/);

  // A reset link for the teacher, to hand on.
  await page.getByRole('tab', { name: /মানুষ|People/ }).click();
  await page.getByTestId('owner-search').fill(teacherEmail);
  const person = page.getByTestId('owner-person').filter({ hasText: teacherEmail });
  await person.getByTestId('person-reset-link').click();
  await expect(page.getByTestId('reset-link-value')).toHaveAttribute(
    'data-link',
    /\/account\/reset#[\w-]+$/,
  );

  // The owner's own row offers no way to suspend or close it.
  await page.getByTestId('owner-search').fill(email);
  const own = page.getByTestId('owner-person').filter({ hasText: email });
  await expect(own).toBeVisible();
  await expect(own.getByTestId('person-suspend')).toHaveCount(0);
  await expect(own.getByTestId('person-close')).toHaveCount(0);

  await page.getByRole('tab', { name: /কার্যকলাপ|Activity/ }).click();
  await expect(page.getByTestId('owner-activity')).toContainText('owner.reset-link');
});

for (const scheme of ['light', 'dark'] as const) {
  test(`the office’s styles change nothing elsewhere in the lab, ${scheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    const look = () =>
      page.evaluate(() => {
        const root = getComputedStyle(document.documentElement);
        return {
          font: root.fontFamily,
          scheme: root.colorScheme,
          sizes: [
            '--text-xs',
            '--text-sm',
            '--text-base',
            '--text-lg',
            '--text-xl',
            '--text-3xl',
          ].map((name) => root.getPropertyValue(name).trim()),
        };
      });
    await page.goto('/lessons');
    const before = await look();
    expect(before.font).toContain('Noto Sans Bengali');
    // Opening the office loads its code and styles (even signed out, which shows
    // only a notice); Back returns within the app, without reloading the page.
    await page.goto('/lessons');
    await page.evaluate(() => {
      history.pushState(null, '', '/owner');
      dispatchEvent(new PopStateEvent('popstate'));
    });
    await expect(page.getByTestId('owner-only')).toBeVisible();
    expect(
      await page.evaluate(() =>
        [...document.styleSheets].some((sheet) =>
          [...sheet.cssRules].some((rule) => rule.cssText.includes('kumo')),
        ),
      ),
    ).toBe(true);
    await page.goBack();
    await expect(page).toHaveURL(/\/lessons$/);
    expect(await look()).toEqual(before);
  });
}
