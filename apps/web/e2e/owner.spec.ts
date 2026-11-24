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
  await row.getByTestId('school-suspend').click();
  await row.getByTestId('school-suspend-yes').click();
  await expect(row.getByTestId('owner-status')).toHaveText(/স্থগিত|Suspended/);
  await row.getByTestId('school-activate').click();
  await row.getByTestId('school-activate-yes').click();
  await expect(row.getByTestId('owner-status')).toHaveText(/চালু|Working/);

  // A reset link for the teacher, to hand on.
  await page.getByTestId('owner-tab-people').click();
  await page.getByTestId('owner-search').fill(teacherEmail);
  const person = page.getByTestId('owner-person').filter({ hasText: teacherEmail });
  await person.getByTestId('person-reset-link').click();
  await expect(person.getByTestId('reset-link-value')).toHaveText(/\/account\/reset#[\w-]+$/);

  // The owner's own row offers no way to suspend or close it.
  await page.getByTestId('owner-search').fill(email);
  const own = page.getByTestId('owner-person').filter({ hasText: email });
  await expect(own).toBeVisible();
  await expect(own.getByTestId('person-suspend')).toHaveCount(0);
  await expect(own.getByTestId('person-close')).toHaveCount(0);

  await page.getByTestId('owner-tab-activity').click();
  await expect(page.getByTestId('owner-activity')).toContainText('owner.reset-link');
});
