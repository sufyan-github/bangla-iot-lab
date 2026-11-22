import { expect, type Page } from '@playwright/test';

/**
 * Replaces the program in the code editor, and checks that it did. On the
 * phone-sized profile the editor now and then keeps the old text and puts the
 * new text after it; a test that did not check would then compile two
 * programs joined together and blame the compiler.
 */
const squeeze = (text: string) => text.replace(/\s+/g, '');

export async function writeProgram(page: Page, code: string): Promise<void> {
  const editor = page.getByTestId('code');
  await expect(async () => {
    await editor.fill(code);
    // Compared without spaces and line ends: the editor shows an empty line its own way.
    const shown = (await editor.locator('.cm-line').allInnerTexts()).join('');
    expect(squeeze(shown)).toBe(squeeze(code));
  }).toPass({ timeout: 20_000 });
}
