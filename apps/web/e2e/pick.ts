import type { Page } from '@playwright/test';

/**
 * Picks a tool or part. Select, wire and probe are always on screen; the parts
 * are in the rail beside the board, which on a phone is opened first.
 */
export async function pick(page: Page, item: string): Promise<void> {
  // The lab has loaded once its tools are there.
  await page.getByTestId('tool-select').waitFor();
  const open = page.getByTestId('parts-open');
  if (!['select', 'wire', 'probe'].includes(item) && (await open.isVisible())) await open.click();
  await page.getByTestId(`tool-${item}`).click();
}
