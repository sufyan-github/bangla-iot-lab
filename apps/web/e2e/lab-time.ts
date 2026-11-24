import type { Page } from '@playwright/test';

/** The lab's own time since the circuit was switched on, in milliseconds. */
export async function labNow(page: Page): Promise<number> {
  return Number((await page.getByTestId('lab-clock').getAttribute('data-ms')) ?? 0);
}

/**
 * Keeps trying an assertion until it passes, or until the lab itself has run
 * for `labMs` without it passing. The simulation slows down when the computer
 * is busy, so a wall-clock timeout would fail a test that is only slow; this
 * waits for what the circuit would take on any computer. A test that never
 * passes still fails, at the latest after `wallMs` of real time.
 *
 * The assertion should be quick to fail (give its own `timeout` of a few
 * hundred milliseconds).
 */
export async function withinLabTime(
  page: Page,
  labMs: number,
  assertion: () => Promise<unknown>,
  wallMs = 180_000,
): Promise<void> {
  const start = await labNow(page);
  const giveUp = Date.now() + wallMs;
  for (;;) {
    try {
      await assertion();
      return;
    } catch (error) {
      // Lab time is read after the attempt, so a circuit that was just switched on
      // (its clock back at 0) still gets its full allowance.
      const now = await labNow(page);
      const ran = now >= start ? now - start : now;
      if (ran > labMs || Date.now() > giveUp) throw error;
    }
    await page.waitForTimeout(150);
  }
}
