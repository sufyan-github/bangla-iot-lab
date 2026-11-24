import { expect, test } from '@playwright/test';

/** A teacher makes a class; a learner joins it with the code and a nickname. */

test('a teacher signs up and makes a class; a learner joins with its code', async ({ page }) => {
  // Each run, and each browser, signs up afresh.
  const email = `teacher-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
  await page.goto('/account');
  await page.getByTestId('teacher-switch').click();
  await page.getByTestId('teacher-name').fill('রিনা আপা');
  await page.getByTestId('teacher-school').fill('পরীক্ষা বিদ্যালয়');
  await page.getByTestId('teacher-email').fill(email);
  await page.getByTestId('teacher-password').fill('a long pass phrase');
  await page.getByTestId('teacher-submit').click();
  await expect(page.getByTestId('nav-account')).toHaveText('রিনা আপা');

  // The class can be made only once the school's permission is confirmed.
  await page.getByTestId('class-name').fill('সপ্তম ক');
  await page.getByTestId('class-grade').selectOption('7');
  await expect(page.getByTestId('class-submit')).toBeDisabled();
  await page.getByTestId('class-consent').check();
  await page.getByTestId('class-submit').click();
  const code = (await page.getByTestId('join-code-shown').textContent())!.trim();
  expect(code).toMatch(/^\w{4}-\w{4}$/);
  await expect(page.getByTestId('class-item')).toHaveCount(1);

  await page.getByTestId('sign-out').click();
  await page.getByTestId('join-code').fill(code.toLowerCase());
  await page.getByTestId('join-pseudonym').fill('তারা');
  await page.getByTestId('join-submit').click();
  await expect(page.getByTestId('learner-key')).toHaveText(/^\w{4}-\w{4}-\w{4}$/);
  await page.getByRole('button', { name: /চালিয়ে যাও|Continue/ }).click();
  await expect(page.getByTestId('learner-home')).toContainText('সপ্তম ক');
  await expect(page.getByTestId('nav-account')).toHaveText('তারা');
});

test('a wrong class code is explained', async ({ page }) => {
  await page.goto('/account');
  await page.getByTestId('join-code').fill('AAAA-AAAA');
  await page.getByTestId('join-pseudonym').fill('নদী');
  await page.getByTestId('join-submit').click();
  await expect(page.getByTestId('account-problem')).toBeVisible();
});
