import { expect, test } from '@playwright/test';
import { emailedLink, stamp } from './account-helpers';

/** Closing accounts (D-100): one's own, and a learner's by their guardian. */
const PASSWORD = 'a long pass phrase';

test('an adult closes their own account, and cannot sign in again', async ({ page }) => {
  const email = `closing-${stamp()}@example.test`;
  await page.goto('/account');
  await page.getByTestId('entry-new').click();
  await page.getByTestId('new-adult').click();
  await page.getByTestId('adult-name').fill('রহিম');
  await page.getByTestId('adult-email').fill(email);
  await page.getByTestId('adult-password').fill(PASSWORD);
  await page.getByTestId('adult-submit').click();
  await page.goto(await emailedLink(page, email, 'verify'));
  await page.getByTestId('verify-submit').click();
  await expect(page.getByTestId('learner-home')).toBeVisible();

  await page.getByTestId('close-account-ask').click();
  await page.getByTestId('close-account-password').fill('not the password');
  await page.getByTestId('close-account-confirm').click();
  await expect(page.getByTestId('account-problem')).toBeVisible();
  await page.getByTestId('close-account-password').fill(PASSWORD);
  await page.getByTestId('close-account-confirm').click();
  await expect(page.getByTestId('entry')).toBeVisible();

  await page.getByTestId('entry-sign-in').click();
  await page.getByTestId('signin-identifier').fill(email);
  await page.getByTestId('signin-password').fill(PASSWORD);
  await page.getByTestId('signin-submit').click();
  await expect(page.getByTestId('account-problem')).toBeVisible();
});

test('a guardian closes a learner’s own account from the link in their email', async ({
  page,
  browser,
}) => {
  const username = `c${stamp().replace(/\D/g, '').slice(-14)}`;
  const guardian = `guardian-${stamp()}@example.test`;
  await page.goto('/account');
  await page.getByTestId('entry-new').click();
  await page.getByTestId('new-learner').click();
  await page.getByTestId('learner-pseudonym').fill('মেঘ');
  await page.getByTestId('learner-username').fill(username);
  await page.getByTestId('learner-password').fill(PASSWORD);
  await page.getByTestId('learner-guardian').fill(guardian);
  await page.getByTestId('learner-submit').click();
  await expect(page.getByTestId('check-email')).toBeVisible();

  // The guardian approves, then later asks to close it, on their own device.
  const guardianContext = await browser.newContext();
  const guardianPage = await guardianContext.newPage();
  await guardianPage.goto(
    new URL(await emailedLink(page, guardian, 'approve'), page.url()).toString(),
  );
  await guardianPage.getByTestId('approve-confirm').check();
  await guardianPage.getByTestId('approve-submit').click();
  await expect(guardianPage.getByTestId('approved')).toBeVisible();

  await guardianPage.goto(new URL('/account', page.url()).toString());
  await guardianPage.getByTestId('entry-guardian').click();
  await guardianPage.getByTestId('guardian-username').fill(username);
  await guardianPage.getByTestId('guardian-email').fill(guardian);
  await guardianPage.getByTestId('guardian-submit').click();
  await expect(guardianPage.getByTestId('guardian-sent')).toBeVisible();
  await guardianPage.goto(
    new URL(await emailedLink(page, guardian, 'close'), page.url()).toString(),
  );
  await expect(guardianPage.getByText(username)).toBeVisible();
  await guardianPage.getByTestId('close-by-link').click();
  await expect(guardianPage.getByTestId('account-closed')).toBeVisible();
  await guardianContext.close();

  await page.goto('/account');
  await page.getByTestId('entry-sign-in').click();
  await page.getByTestId('signin-identifier').fill(username);
  await page.getByTestId('signin-password').fill(PASSWORD);
  await page.getByTestId('signin-submit').click();
  await expect(page.getByTestId('account-problem')).toBeVisible();
});
