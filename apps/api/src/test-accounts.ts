import type { buildApp } from './app';
import type { LocalMailbox } from './mail';

/**
 * Test helpers for accounts: a teacher signs up, then confirms the email from
 * the link in the local mailbox, which signs them in (D-098).
 */
type App = Awaited<ReturnType<typeof buildApp>>;

/** The session cookie a response set, as a request header. */
export const cookieOf = (response: { headers: Record<string, unknown> }) =>
  String(response.headers['set-cookie']).split(';')[0]!;

/** The token in the newest email to an address: the part after # in its link. */
export const tokenIn = (mailbox: LocalMailbox, to: string) =>
  /\/account\/\w+#([\w-]+)/.exec(mailbox.latest(to)?.text ?? '')?.[1] ?? '';

/** Signs a teacher up and confirms the email; the cookie of the session it starts. */
export async function signUpTeacher(
  app: App,
  mailbox: LocalMailbox,
  payload: { email: string } & Record<string, unknown>,
) {
  const response = await app.inject({ method: 'POST', url: '/v1/auth/sign-up', payload });
  if (response.statusCode !== 202) throw new Error(`sign-up failed: ${response.body}`);
  const verified = await app.inject({
    method: 'POST',
    url: '/v1/auth/verify-email',
    payload: { token: tokenIn(mailbox, payload.email.toLowerCase()) },
  });
  if (verified.statusCode !== 200) throw new Error(`verification failed: ${verified.body}`);
  return cookieOf(verified);
}
