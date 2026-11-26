import { expect, test, type Page } from '@playwright/test';
import { pick } from './pick';

/**
 * Putting the program on a real UNO-compatible board (D-117), with the USB
 * port played by a stand-in for the board's bootloader inside the page. No
 * real board is involved; that is still to be checked by hand.
 */

/** Gives the page a serial port whose board answers as Optiboot does. */
function fakeUno() {
  const STK = { OK: 0x10, INSYNC: 0x14 };
  const board = {
    flash: new Uint8Array(32768).fill(0xff),
    written: 0,
    started: false,
    listening: false,
    address: 0,
  };
  (window as unknown as { fakeUno: typeof board }).fakeUno = board;
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const reply = (...data: number[]) =>
    controller.enqueue(Uint8Array.from([STK.INSYNC, ...data, STK.OK]));
  const port = {
    readable: new ReadableStream<Uint8Array>({ start: (c) => void (controller = c) }),
    writable: new WritableStream<Uint8Array>({
      write(bytes) {
        if (!board.listening) return;
        switch (bytes[0]) {
          case 0x30:
          case 0x50:
            return reply();
          case 0x41:
            return reply(8);
          case 0x75:
            return reply(0x1e, 0x95, 0x0f);
          case 0x55:
            board.address = (bytes[1]! | (bytes[2]! << 8)) * 2;
            return reply();
          case 0x64: {
            const length = (bytes[1]! << 8) | bytes[2]!;
            board.flash.set(bytes.subarray(4, 4 + length), board.address);
            board.written += length;
            return reply();
          }
          case 0x74: {
            const length = (bytes[1]! << 8) | bytes[2]!;
            return reply(...board.flash.subarray(board.address, board.address + length));
          }
          case 0x51:
            board.listening = false;
            board.started = true;
            return reply();
        }
      },
    }),
    async open() {},
    async close() {},
    async setSignals(signals: { dataTerminalReady?: boolean }) {
      // The reset pulse starts the bootloader.
      if (signals.dataTerminalReady) board.listening = true;
    },
  };
  Object.defineProperty(navigator, 'serial', {
    value: { requestPort: async () => port },
    configurable: true,
  });
}

async function unoWithBlink(page: Page) {
  await page.goto('/');
  await page.getByTestId('new-project').click();
  await expect(page).toHaveURL(/\/lab\//);
  await pick(page, 'uno');
  await page.getByTestId('tab-code').click();
  await page.getByTestId('starter').selectOption('blink');
  await expect(page.getByTestId('upload-status').locator('[data-uploaded]')).toBeVisible();
}

test('the program goes onto a real board, is checked, and starts', async ({ page }) => {
  await page.addInitScript(fakeUno);
  await unoWithBlink(page);
  await page.getByTestId('real-board-upload').click();
  await expect(page.getByTestId('real-board-status')).toHaveAttribute('data-status', 'done', {
    timeout: 20_000,
  });
  const board = await page.evaluate(() => {
    const fake = (window as unknown as { fakeUno: { written: number; started: boolean } }).fakeUno;
    return { written: fake.written, started: fake.started };
  });
  expect(board.started).toBe(true);
  expect(board.written % 128).toBe(0);
  expect(board.written).toBeGreaterThan(0);
});

test('a browser that cannot reach USB boards says where it can be done', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'serial', { value: undefined, configurable: true });
  });
  await unoWithBlink(page);
  await expect(page.getByTestId('real-board-unsupported')).toBeVisible();
  await expect(page.getByTestId('real-board-upload')).toHaveCount(0);
});
