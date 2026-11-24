import { expect, test } from '@playwright/test';
import { confirmEmail, makeClass, openTeacherSignUp, teacherWithClass } from './account-helpers';

/** A teacher makes a class; a learner joins it with the code and a nickname. */

test('a teacher signs up and makes a class; a learner joins with its code', async ({ page }) => {
  // Each run, and each browser, signs up afresh.
  const email = `teacher-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
  await page.goto('/account');
  await openTeacherSignUp(page);
  await page.getByTestId('teacher-name').fill('রিনা আপা');
  await page.getByTestId('teacher-school').fill('পরীক্ষা বিদ্যালয়');
  await page.getByTestId('teacher-email').fill(email);
  await page.getByTestId('teacher-password').fill('a long pass phrase');
  await page.getByTestId('teacher-submit').click();
  await confirmEmail(page, email);
  await expect(page.getByTestId('nav-account')).toContainText('রিনা আপা');

  // The class can be made only once the school's permission is confirmed.
  await page.getByTestId('class-name').fill('সপ্তম ক');
  await page.getByTestId('class-grade').selectOption('7');
  await expect(page.getByTestId('class-submit')).toBeDisabled();
  await page.getByTestId('class-consent').check();
  await page.getByTestId('class-submit').click();
  const code = (await page.getByTestId('join-code-shown').textContent())!.trim();
  expect(code).toMatch(/^\w{4}-\w{4}$/);
  await expect(page.getByTestId('class-item')).toHaveCount(1);

  // Set the class a lesson; the summary counts the class, not anyone by name.
  await page.getByTestId('class-lessons-open').click();
  await page.getByTestId('assign-lesson').selectOption('push-button');
  await page.getByTestId('assign-submit').click();
  await expect(
    page.locator('[data-testid="class-lesson"][data-lesson="push-button"]'),
  ).toBeVisible();

  await page.getByTestId('sign-out').click();
  await page.getByTestId('entry-class').click();
  await page.getByTestId('join-code').fill(code.toLowerCase());
  await page.getByTestId('join-pseudonym').fill('তারা');
  await page.getByTestId('join-submit').click();
  await expect(page.getByTestId('learner-key')).toHaveText(/^\w{4}-\w{4}-\w{4}$/);
  await page.getByRole('button', { name: /চালিয়ে যাও|Continue/ }).click();
  await expect(page.getByTestId('learner-home')).toContainText('সপ্তম ক');
  await expect(page.getByTestId('nav-account')).toContainText('তারা');
  await expect(page.getByTestId('assigned-lessons')).toContainText(/পুশ বোতাম|push button/i);
});

test('a school admin invites a teacher, who signs up with the code', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  await page.goto('/account');
  await openTeacherSignUp(page);
  await page.getByTestId('teacher-name').fill('প্রধান শিক্ষক');
  await page.getByTestId('teacher-school').fill('আমন্ত্রণ বিদ্যালয়');
  const pageEmail = `admin-${stamp}@example.test`;
  await page.getByTestId('teacher-email').fill(pageEmail);
  await page.getByTestId('teacher-password').fill('a long pass phrase');
  await page.getByTestId('teacher-submit').click();
  await confirmEmail(page, pageEmail);

  // The school's teachers and invitations are under the School tab.
  await page.getByTestId('teacher-tab-school').click();
  await expect(page.getByTestId('school-teacher')).toHaveCount(1);
  await page.getByTestId('invite-teacher').click();
  const code = (await page.getByTestId('invite-code-shown').textContent())!.trim();
  expect(code).toMatch(/^\w{4}-\w{4}-\w{4}$/);
  await expect(page.getByTestId('open-invite')).toHaveCount(1);

  await page.getByTestId('sign-out').click();
  await openTeacherSignUp(page);
  await page.getByTestId('teacher-name').fill('নতুন শিক্ষক');
  await page.getByTestId('teacher-invited').click();
  await page.getByTestId('teacher-invite').fill(code);
  const invitedEmail = `invited-${stamp}@example.test`;
  await page.getByTestId('teacher-email').fill(invitedEmail);
  await page.getByTestId('teacher-password').fill('a long pass phrase');
  await page.getByTestId('teacher-submit').click();
  await confirmEmail(page, invitedEmail);
  await expect(page.getByTestId('nav-account')).toContainText('নতুন শিক্ষক');
  // A teacher here, not its admin: classes, but no invitations.
  await expect(page.getByTestId('new-class')).toBeVisible();
  await page.getByTestId('teacher-tab-school').click();
  await expect(page.getByTestId('school-teachers')).toHaveCount(0);

  // The code is used up.
  await page.getByTestId('join-school-code').fill(code);
  await page.getByTestId('join-school-submit').click();
  await expect(page.getByTestId('account-problem')).toBeVisible();
});

test('a wrong class code is explained', async ({ page }) => {
  await page.goto('/account');
  await page.getByTestId('entry-class').click();
  await page.getByTestId('join-code').fill('AAAA-AAAA');
  await page.getByTestId('join-pseudonym').fill('নদী');
  await page.getByTestId('join-submit').click();
  await expect(page.getByTestId('account-problem')).toBeVisible();
});

test('a project saved to the cloud can be opened again on a device without it', async ({
  page,
}) => {
  const email = `cloud-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
  await page.goto('/account');
  await openTeacherSignUp(page);
  await page.getByTestId('teacher-name').fill('শিক্ষক');
  await page.getByTestId('teacher-school').fill('বিদ্যালয়');
  await page.getByTestId('teacher-email').fill(email);
  await page.getByTestId('teacher-password').fill('a long pass phrase');
  await page.getByTestId('teacher-submit').click();
  await confirmEmail(page, email);
  await expect(page.getByTestId('sign-out')).toBeVisible();

  await page.goto('/');
  await page.getByTestId('open-example').click();
  await expect(page).toHaveURL(/\/lab\//);
  await page.goto('/');
  await page.getByTestId('save-cloud').first().click();
  await expect(page.getByTestId('save-cloud').first()).toHaveText(/হালনাগাদ|Update/);

  // Gone from this device, still in the cloud.
  page.once('dialog', (dialog) => void dialog.accept());
  await page
    .getByTestId('project-list')
    .getByRole('button', { name: /মুছ|Delete/ })
    .first()
    .click();
  await expect(page.getByTestId('cloud-list')).toBeVisible();
  await page.getByTestId('open-cloud').first().click();
  await expect(page).toHaveURL(/\/lab\//);
  // While the lab settles on a phone the part can be drawn in more than one layer at once.
  await expect(page.locator('[data-part="LED1"]').first()).toBeVisible();
});

const stamp = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

test('a teacher moves a learner between classes; an admin removes a teacher', async ({
  page,
  browser,
}) => {
  const first = await teacherWithClass(page, `admin-${stamp()}@example.test`, 'সপ্তম ক');
  await makeClass(page, 'সপ্তম খ');

  const learnerContext = await browser.newContext();
  const learner = await learnerContext.newPage();
  await learner.goto(`${new URL(page.url()).origin}/account`);
  await learner.getByTestId('entry-class').click();
  await learner.getByTestId('join-code').fill(first);
  await learner.getByTestId('join-pseudonym').fill('নদী');
  await learner.getByTestId('join-submit').click();
  await expect(learner.getByTestId('learner-key')).toBeVisible();
  await learnerContext.close();

  await page.reload();
  const classA = page.getByTestId('class-item').filter({ hasText: 'সপ্তম ক' });
  const classB = page.getByTestId('class-item').filter({ hasText: 'সপ্তম খ' });
  await classA.getByTestId('class-roster').click();
  await classA.getByTestId('move-to').selectOption({ label: 'সপ্তম খ' });
  await expect(classA.getByTestId('roster-learner')).toHaveCount(0);
  await classB.getByTestId('class-roster').click();
  await expect(classB.getByTestId('roster-learner')).toHaveText(/নদী/);

  // An invited teacher joins; the admin removes them again.
  await page.getByTestId('teacher-tab-school').click();
  await page.getByTestId('invite-teacher').click();
  const invite = (await page.getByTestId('invite-code-shown').textContent())!.trim();
  const otherContext = await browser.newContext();
  const other = await otherContext.newPage();
  await other.goto(`${new URL(page.url()).origin}/account`);
  await openTeacherSignUp(other);
  await other.getByTestId('teacher-name').fill('অতিথি');
  await other.getByTestId('teacher-invited').click();
  await other.getByTestId('teacher-invite').fill(invite);
  const otherEmail = `guest-${stamp()}@example.test`;
  await other.getByTestId('teacher-email').fill(otherEmail);
  await other.getByTestId('teacher-password').fill('a long pass phrase');
  await other.getByTestId('teacher-submit').click();
  await confirmEmail(other, otherEmail);
  await expect(other.getByTestId('new-class')).toBeVisible();
  await otherContext.close();

  await page.reload();
  await page.getByTestId('teacher-tab-school').click();
  const guest = page.getByTestId('school-teacher').filter({ hasText: 'অতিথি' });
  await guest.getByTestId('remove-teacher').click();
  await guest.getByTestId('confirm-remove-teacher').click();
  await expect(page.getByTestId('school-teacher')).toHaveCount(1);
});
