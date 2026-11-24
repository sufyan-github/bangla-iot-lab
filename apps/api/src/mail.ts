/**
 * Email the lab sends: account verification, a guardian's approval, password
 * resets. The provider is not chosen yet, so the only transport is the local
 * mailbox: messages are kept in memory and written to the log, for development
 * and tests. In production the API refuses to start until a real transport is
 * configured, rather than accept sign-ups whose emails would never arrive.
 */
export interface MailMessage {
  to: string;
  subject: string;
  /** Plain text, Bangla first, then English. */
  text: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

/** Keeps every message, newest last; the log line names the recipient and subject only. */
export class LocalMailbox implements Mailer {
  readonly sent: (MailMessage & { at: string })[] = [];
  constructor(private readonly log: (line: string) => void = () => {}) {}

  async send(message: MailMessage): Promise<void> {
    this.sent.push({ ...message, at: new Date().toISOString() });
    if (this.sent.length > 200) this.sent.shift();
    this.log(`mail to ${message.to}: ${message.subject}`);
  }

  /** The newest message to an address, for tests. */
  latest(to: string): MailMessage | undefined {
    return [...this.sent].reverse().find((m) => m.to === to.toLowerCase());
  }
}
