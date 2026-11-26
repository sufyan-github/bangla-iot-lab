import blinkHex from '@banglalab/board-emulators/fixtures/starters/blink.hex?raw';
import { describe, expect, it } from 'vitest';
import {
  PAGE_SIZE,
  STK,
  UploadError,
  programImage,
  uploadToUno,
  type BootloaderPort,
  type UploadStage,
} from './stk500';

/**
 * A stand-in for the bootloader of an UNO, answering as Optiboot's source
 * says it does: only after a reset, INSYNC and OK around any data, a word
 * address, and pages written into its flash.
 */
class FakeOptiboot implements BootloaderPort {
  flash = new Uint8Array(32_768).fill(0xff);
  started = false;
  resets = 0;
  private listening = false;
  private replies: number[] = [];
  private address = 0;
  constructor(
    private readonly options: {
      signature?: number[];
      silent?: boolean;
      /** Corrupts what it stores at this byte address. */
      corruptAt?: number;
    } = {},
  ) {}

  async reset() {
    this.resets += 1;
    this.listening = !this.options.silent;
    this.started = false;
  }
  async drain() {
    this.replies = [];
  }
  async read(count: number) {
    if (this.replies.length < count) return null;
    return Uint8Array.from(this.replies.splice(0, count));
  }
  async write(bytes: Uint8Array) {
    if (!this.listening) return;
    if (bytes[bytes.length - 1] !== STK.CRC_EOP) throw new Error('command without CRC_EOP');
    const reply = (...data: number[]) => {
      this.replies.push(STK.INSYNC, ...data, STK.OK);
    };
    switch (bytes[0]) {
      case STK.GET_SYNC:
      case STK.ENTER_PROGMODE:
        return reply();
      case STK.GET_PARAMETER:
        return reply(bytes[1] === STK.SW_MAJOR ? 8 : bytes[1] === STK.SW_MINOR ? 3 : 3);
      case STK.READ_SIGN:
        return reply(...(this.options.signature ?? [0x1e, 0x95, 0x0f]));
      case STK.LOAD_ADDRESS:
        this.address = (bytes[1]! | (bytes[2]! << 8)) * 2;
        return reply();
      case STK.PROG_PAGE: {
        const length = (bytes[1]! << 8) | bytes[2]!;
        if (bytes[3] !== 0x46) throw new Error('not flash');
        const data = bytes.subarray(4, 4 + length);
        this.flash.set(data, this.address);
        const corrupt = this.options.corruptAt;
        if (corrupt !== undefined && corrupt >= this.address && corrupt < this.address + length) {
          this.flash[corrupt] ^= 0xff;
        }
        return reply();
      }
      case STK.READ_PAGE: {
        const length = (bytes[1]! << 8) | bytes[2]!;
        return reply(...this.flash.subarray(this.address, this.address + length));
      }
      case STK.LEAVE_PROGMODE:
        this.listening = false;
        this.started = true;
        return reply();
      default:
        throw new Error(`unexpected command ${bytes[0]}`);
    }
  }
}

describe('putting a program on a real UNO (D-117)', () => {
  it('writes the program a page at a time, reads it back, and starts it', async () => {
    const board = new FakeOptiboot();
    const stages = new Set<UploadStage>();
    const result = await uploadToUno(board, blinkHex, (stage) => stages.add(stage));
    const image = programImage(blinkHex);
    expect(board.flash.subarray(0, image.length)).toEqual(image);
    // Nothing beyond the program is touched.
    expect(board.flash.subarray(image.length).every((b) => b === 0xff)).toBe(true);
    expect(board.started).toBe(true);
    expect(result).toEqual({ bytes: image.length, bootloader: '8.3' });
    expect([...stages]).toEqual(['connecting', 'writing', 'checking', 'done']);
  });

  /** An Intel HEX data record, with its checksum. */
  const record = (address: number, data: number[]) => {
    const bytes = [data.length, address >> 8, address & 0xff, 0, ...data];
    const sum = (0x100 - (bytes.reduce((a, b) => a + b, 0) & 0xff)) & 0xff;
    return `:${[...bytes, sum]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()}`;
  };
  const hexOf = (...records: string[]) => [...records, ':00000001FF', ''].join('\n');

  it('lays the program out in whole pages, with 0xFF where nothing is written', () => {
    const image = programImage(hexOf(record(0, [1, 2, 3, 4]), record(0x82, [0xaa, 0xbb])));
    expect(image.length).toBe(2 * PAGE_SIZE);
    expect([...image.subarray(0, 5)]).toEqual([1, 2, 3, 4, 0xff]);
    expect([...image.subarray(0x82, 0x85)]).toEqual([0xaa, 0xbb, 0xff]);
  });

  it('refuses a program too big for an UNO, before touching the board', () => {
    // 32 256 bytes are free below the bootloader: a last byte at 0x7DFF fits, one at 0x7E00 does not.
    expect(() => programImage(hexOf(record(0x7dff, [0xaa])))).not.toThrow();
    expect(() => programImage(hexOf(record(0x7e00, [0xaa])))).toThrow(UploadError);
  });

  it('says so when the bootloader never answers, after trying again with a reset', async () => {
    const board = new FakeOptiboot({ silent: true });
    await expect(uploadToUno(board, blinkHex)).rejects.toMatchObject({ problem: 'no-reply' });
    expect(board.resets).toBeGreaterThan(1);
  });

  it('will not write to a chip that is not an ATmega328P', async () => {
    const board = new FakeOptiboot({ signature: [0x1e, 0x94, 0x06] });
    await expect(uploadToUno(board, blinkHex)).rejects.toMatchObject({
      problem: 'wrong-chip',
      detail: '1e 94 6',
    });
    expect(board.flash.every((b) => b === 0xff)).toBe(true);
  });

  it('catches a page that did not read back as written', async () => {
    const board = new FakeOptiboot({ corruptAt: 130 });
    await expect(uploadToUno(board, blinkHex)).rejects.toMatchObject({
      problem: 'verify-failed',
      detail: String(PAGE_SIZE),
    });
    expect(board.started).toBe(false);
  });
});
