import { expect, test } from '@playwright/test';
import { emailedLink, stamp, teacherWithClass } from './account-helpers';

/**
 * Accounts of people on their own (D-096): a learner under 18 whose guardian
 * approves by email, and an adult who confirms their email and can reset a
 * forgotten password. Emails are read from the API's local mailbox.
 */
const PASSWORD = 'a long pass phrase';

test('a learner under 18: the guardian approves by email, then the learner signs in and joins a class', async ({
  page,
  browser,
}) => {
  const username = `l${stamp().replace(/\D/g, '').slice(-14)}`;
  const guardian = `guardian-${stamp()}@example.test`;
  await page.goto('/account');
  await page.getByTestId('entry-new').click();
  await page.getByTestId('new-learner').click();
  await page.getByTestId('learner-pseudonym').fill('আকাশ');
  await page.getByTestId('learner-username').fill(username);
  await page.getByTestId('learner-password').fill(PASSWORD);
  await page.getByTestId('learner-guardian').fill(guardian);
  await page.getByTestId('learner-submit').click();
  await expect(page.getByTestId('check-email')).toContainText(guardian);

  // Signing in before the guardian approves is explained, with a way to resend.
  await page.getByTestId('account-back').click();
  await page.getByTestId('entry-sign-in').click();
  await page.getByTestId('signin-identifier').fill(username);
  await page.getByTestId('signin-password').fill(PASSWORD);
  await page.getByTestId('signin-submit').click();
  await expect(page.getByTestId('account-problem')).toBeVisible();
  await expect(page.getByTestId('signin-resend')).toBeVisible();

  // The guardian, on their own device, opens the link and approves.
  const link = await emailedLink(page, guardian, 'approve');
  const guardianContext = await browser.newContext();
  const guardianPage = await guardianContext.newPage();
  await guardianPage.goto(new URL(link, page.url()).toString());
  // The token leaves the address bar at once.
  await expect(guardianPage).toHaveURL(/\/account\/approve$/);
  await expect(guardianPage.getByText(username)).toBeVisible();
  await expect(guardianPage.getByTestId('approve-submit')).toBeDisabled();
  await guardianPage.getByTestId('approve-confirm').check();
  await guardianPage.getByTestId('approve-submit').click();
  await expect(guardianPage.getByTestId('approved')).toBeVisible();
  // Approving signs no one in on the guardian's device.
  await expect(guardianPage.getByTestId('nav-account')).not.toContainText('আকাশ');
  await guardianContext.close();

  await page.getByTestId('signin-submit').click();
  await expect(page.getByTestId('learner-home')).toBeVisible();
  await expect(page.getByTestId('own-sign-in')).toContainText(username);
  await expect(page.getByTestId('nav-account')).toContainText('আকাশ');

  // A teacher, on another device, makes a class; the learner joins on the same account.
  const elsewhere = await browser.newContext();
  const teacher = await elsewhere.newPage();
  const code = await teacherWithClass(teacher, `t-${stamp()}@example.test`, 'অষ্টম ক');
  await elsewhere.close();
  await page.getByTestId('learner-class-code').fill(code);
  await page.getByTestId('learner-class-submit').click();
  await expect(page.getByTestId('learner-home')).toContainText('অষ্টম ক');
  // No key: this learner signs in with their name and password.
  await expect(page.getByTestId('learner-key')).toHaveCount(0);
});

test('an adult confirms their email, and resets a forgotten password', async ({ page }) => {
  const email = `adult-${stamp()}@example.test`;
  await page.goto('/account');
  await page.getByTestId('entry-new').click();
  await page.getByTestId('new-adult').click();
  await page.getByTestId('adult-name').fill('রহিম');
  await page.getByTestId('adult-email').fill(email);
  await page.getByTestId('adult-password').fill(PASSWORD);
  await page.getByTestId('adult-submit').click();
  await expect(page.getByTestId('check-email')).toContainText(email);

  await page.goto(await emailedLink(page, email, 'verify'));
  await expect(page).toHaveURL(/\/account\/verify$/);
  await page.getByTestId('verify-submit').click();
  // Confirmed and signed in: an adult on their own gets the learner's home, not a school's.
  await expect(page.getByTestId('learner-home')).toBeVisible();
  await expect(page.getByTestId('my-progress')).toBeVisible();
  await expect(page.getByTestId('learner-join-class')).toHaveCount(0);

  await page.getByTestId('sign-out').click();
  await page.getByTestId('entry-sign-in').click();
  await page.getByTestId('signin-forgot').click();
  await page.getByTestId('forgot-identifier').fill(email);
  await page.getByTestId('forgot-submit').click();
  await expect(page.getByTestId('forgot-sent')).toBeVisible();

  await page.goto(await emailedLink(page, email, 'reset'));
  await page.getByTestId('reset-password').fill('a brand new phrase');
  await page.getByTestId('reset-submit').click();
  await expect(page.getByTestId('password-saved')).toBeVisible();

  await page.goto('/account');
  await page.getByTestId('entry-sign-in').click();
  await page.getByTestId('signin-identifier').fill(email);
  await page.getByTestId('signin-password').fill(PASSWORD);
  await page.getByTestId('signin-submit').click();
  await expect(page.getByTestId('account-problem')).toBeVisible();
  await page.getByTestId('signin-password').fill('a brand new phrase');
  await page.getByTestId('signin-submit').click();
  await expect(page.getByTestId('learner-home')).toBeVisible();
});
