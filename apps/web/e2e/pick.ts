import type { Page } from '@playwright/test';

/** The parts that stand beside the breadboards: picked up from the list, then put down. */
const BESIDE = ['battery', 'supply', 'generator', 'uno', 'esp32', 'l298n'];

/**
 * Picks a tool or part. Select, wire and probe are always on screen; the parts
 * are in the rail beside the board, which on a phone is opened first.
 *
 * A part that stands beside the breadboards is picked up by one press and goes
 * to its usual place on a second (D-108), which is what tests of the lab want:
 * `workspace.spec.ts` tests putting one down by hand. A breadboard is the half
 * size, as it always was here.
 */
export async function pick(page: Page, item: string): Promise<void> {
  // The lab has loaded once its tools are there.
  await page.getByTestId('tool-select').waitFor();
  const open = page.getByTestId('parts-open');
  if (!['select', 'wire', 'probe'].includes(item) && (await open.isVisible())) await open.click();
  await page.getByTestId(`tool-${item}`).click();
  if (item === 'breadboard') {
    await page.getByTestId('tool-breadboard-half').click();
    await page.getByTestId('tool-breadboard-half').click();
  } else if (BESIDE.includes(item)) {
    await page.getByTestId(`tool-${item}`).click();
  }
}
