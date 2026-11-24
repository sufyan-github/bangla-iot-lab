import { expect, type Page } from '@playwright/test';

/** Steps on the account page that several browser tests share. */

/** From the signed-out account page to the teacher's sign-up form. */
export async function openTeacherSignUp(page: Page) {
  await page.getByTestId('entry-new').click();
  await page.getByTestId('new-teacher').click();
}

/** Signs a new teacher up on the page and makes a class; returns the class's join code. */
export async function teacherWithClass(
  page: Page,
  email: string,
  className: string,
  schoolName = 'বিদ্যালয়',
) {
  await page.goto('/account');
  await openTeacherSignUp(page);
  await page.getByTestId('teacher-name').fill('শিক্ষক');
  await page.getByTestId('teacher-school').fill(schoolName);
  await page.getByTestId('teacher-email').fill(email);
  await page.getByTestId('teacher-password').fill('a long pass phrase');
  await page.getByTestId('teacher-submit').click();
  return makeClass(page, className);
}
export async function makeClass(page: Page, className: string) {
  await page.getByTestId('class-name').fill(className);
  await page.getByTestId('class-consent').check();
  await page.getByTestId('class-submit').click();
  await expect(page.getByTestId('join-code-shown')).toBeVisible();
  return (await page.getByTestId('join-code-shown').textContent())!.trim();
}

/**
 * The newest link the API's local mailbox holds for an address: the path and
 * token, to open on the web page. Needs the API started with DEV_MAILBOX=1.
 */
export async function emailedLink(page: Page, to: string, kind: 'verify' | 'approve' | 'reset') {
  const api = process.env.E2E_API_URL ?? 'http://127.0.0.1:4000';
  let link = '';
  await expect
    .poll(async () => {
      const answer = await page.request.get(`${api}/v1/dev/mail?to=${encodeURIComponent(to)}`);
      const { messages } = (await answer.json()) as { messages: { text: string }[] };
      const text = messages.at(-1)?.text ?? '';
      link = new RegExp(`/account/${kind}#[\\w-]+`).exec(text)?.[0] ?? '';
      return link;
    })
    .not.toBe('');
  return link;
}

export const stamp = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
