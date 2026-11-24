import { expect, test } from '@playwright/test';
import { writeProgram } from './editor';
import { withinLabTime } from './lab-time';

/**
 * A program in several files: tabs in the code editor, each sent to the
 * compile server, built together and run on the ESP32 board.
 */

test('a sketch with a header in a second tab builds, runs, and keeps its tabs', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByTestId('open-example-esp32').click();
  await expect(page.locator('[data-part="ESP1"]')).toBeVisible();
  await page.getByTestId('tab-code').click();

  // A name a file cannot have is refused; a good one becomes a tab.
  await page.getByTestId('new-tab-name').fill('my message.h');
  await expect(page.getByTestId('tab-name-error')).toBeVisible();
  await expect(page.getByTestId('add-tab')).toBeDisabled();
  await page.getByTestId('new-tab-name').fill('message.h');
  await page.getByTestId('add-tab').click();
  await expect(page.getByTestId('code-tab-message.h')).toHaveAttribute('aria-selected', 'true');
  await writeProgram(page, '#pragma once\n#define MESSAGE "hello from a tab"\n');

  await page.getByTestId('code-tab-sketch.ino').click();
  await writeProgram(
    page,
    '#include "message.h"\nvoid setup() {\n  Serial.begin(115200);\n  Serial.println(MESSAGE);\n}\nvoid loop() {}\n',
  );
  await page.getByTestId('upload').click();
  await expect(page.getByTestId('upload-status').locator('[data-uploaded]')).toBeVisible({
    timeout: 60_000,
  });
  await page.getByTestId('run').click();
  await withinLabTime(page, 5000, () =>
    expect(page.getByTestId('serial')).toContainText('hello from a tab', { timeout: 300 }),
  );

  // Saved with the project: the tab is still there after a reload.
  await page.getByTestId('run').click();
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'saved');
  await page.reload();
  await page.getByTestId('tab-code').click();
  await expect(page.getByTestId('code-tab-message.h')).toBeVisible();
  await page.getByTestId('code-tab-message.h').click();
  await page.getByTestId('remove-tab').click();
  await expect(page.getByTestId('code-tab-message.h')).toHaveCount(0);
});
