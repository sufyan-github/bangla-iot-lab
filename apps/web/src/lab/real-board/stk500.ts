import { parseIntelHex } from '@banglalab/board-emulators';

/**
 * Putting a program on a real UNO-compatible board (D-117): the STK500
 * version 1 protocol its bootloader (Optiboot) speaks, as the Arduino IDE's
 * uploader (avrdude, programmer "arduino") uses it.
 *
 * VERIFIED from avrdude's arduino.c and stk500.c and Optiboot's optiboot.c and
 * stk500.h: every command ends with CRC_EOP; the bootloader answers INSYNC,
 * any data, then OK; addresses are 16-bit word addresses, low byte first; a
 * page's length is in bytes, high byte first, with 'F' for flash. The
 * ATmega328P's signature is 1E 95 0F, its pages are 128 bytes, and an UNO
 * leaves 32 256 bytes for a program (avrdude.conf, ArduinoCore-avr boards.txt).
 * Not yet checked on a real board.
 */

export const STK = {
  OK: 0x10,
  INSYNC: 0x14,
  CRC_EOP: 0x20,
  GET_SYNC: 0x30,
  GET_PARAMETER: 0x41,
  ENTER_PROGMODE: 0x50,
  LEAVE_PROGMODE: 0x51,
  LOAD_ADDRESS: 0x55,
  PROG_PAGE: 0x64,
  READ_PAGE: 0x74,
  READ_SIGN: 0x75,
  SW_MAJOR: 0x81,
  SW_MINOR: 0x82,
} as const;

export const ATMEGA328P_SIGNATURE = [0x1e, 0x95, 0x0f] as const;
export const PAGE_SIZE = 128;
/** 32 KiB of flash, less the 512 bytes Optiboot keeps at the top. */
export const UNO_PROGRAM_SPACE = 32_256;
/** UNO and the current Nano bootloader; the old Nano's and the Duemilanove's. */
export const UNO_BAUD = 115_200;
export const OLD_BOOTLOADER_BAUD = 57_600;

/** What the uploader needs of a serial port. */
export interface BootloaderPort {
  write(bytes: Uint8Array): Promise<void>;
  /** Exactly `count` bytes, or null if they have not all come within `timeoutMs`. */
  read(count: number, timeoutMs: number): Promise<Uint8Array | null>;
  /** Throws away whatever has arrived and not been read. */
  drain(): Promise<void>;
  /** Pulses the board's reset line, as opening the port does in the Arduino IDE. */
  reset(): Promise<void>;
}

export type UploadStage = 'connecting' | 'writing' | 'checking' | 'done';
export type UploadProblem =
  'too-large' | 'no-reply' | 'out-of-sync' | 'wrong-chip' | 'write-failed' | 'verify-failed';

export class UploadError extends Error {
  constructor(
    readonly problem: UploadProblem,
    readonly detail?: string,
  ) {
    super(problem + (detail ? `: ${detail}` : ''));
  }
}

/** The bytes a program puts in flash, from address 0, padded with 0xFF to a whole page. */
export function programImage(hex: string): Uint8Array {
  // The parser checks every record's checksum and that it fits; it throws if not.
  parseIntelHex(hex, 32_768);
  const records: { address: number; data: number[] }[] = [];
  let end = 0;
  for (const line of hex.split(/\r?\n/)) {
    const record = line.trim();
    if (record.slice(7, 9) !== '00') continue;
    const length = Number.parseInt(record.slice(1, 3), 16);
    const address = Number.parseInt(record.slice(3, 7), 16);
    const data = Array.from({ length }, (_, i) =>
      Number.parseInt(record.slice(9 + i * 2, 11 + i * 2), 16),
    );
    records.push({ address, data });
    end = Math.max(end, address + length);
  }
  if (end > UNO_PROGRAM_SPACE) throw new UploadError('too-large', String(end));
  // Flash that is not written reads 0xFF, as an erased page does.
  const image = new Uint8Array(Math.ceil(end / PAGE_SIZE) * PAGE_SIZE).fill(0xff);
  for (const { address, data } of records) image.set(data, address);
  return image;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Sends a command and checks the reply is INSYNC, `dataLength` bytes, OK. Returns the data. */
async function command(
  port: BootloaderPort,
  bytes: number[] | Uint8Array,
  dataLength = 0,
  timeoutMs = 1000,
): Promise<Uint8Array> {
  await port.write(Uint8Array.from([...bytes, STK.CRC_EOP]));
  const reply = await port.read(dataLength + 2, timeoutMs);
  if (!reply) throw new UploadError('no-reply');
  if (reply[0] !== STK.INSYNC || reply[reply.length - 1] !== STK.OK) {
    throw new UploadError('out-of-sync', Array.from(reply, (b) => b.toString(16)).join(' '));
  }
  return reply.subarray(1, 1 + dataLength);
}

/** Resets the board and waits for its bootloader to answer, as avrdude does. */
async function synchronise(port: BootloaderPort): Promise<void> {
  await port.reset();
  for (let i = 0; i < 2; i++) {
    await port.write(Uint8Array.of(STK.GET_SYNC, STK.CRC_EOP));
    await sleep(50);
    await port.drain();
  }
  for (let attempt = 0; attempt < 10; attempt++) {
    if (attempt > 0) {
      await port.reset();
      await port.drain();
    }
    await port.write(Uint8Array.of(STK.GET_SYNC, STK.CRC_EOP));
    const reply = await port.read(2, 300);
    if (reply && reply[0] === STK.INSYNC && reply[1] === STK.OK) return;
  }
  throw new UploadError('no-reply');
}

const address = (byteAddress: number) => {
  const word = byteAddress >> 1;
  return [STK.LOAD_ADDRESS, word & 0xff, word >> 8];
};

/**
 * Writes the program to the board, reads it all back to check it, and starts it.
 * `progress` is told the stage, and how far through it is, from 0 to 1.
 */
export async function uploadToUno(
  port: BootloaderPort,
  hex: string,
  progress: (stage: UploadStage, fraction: number) => void = () => {},
): Promise<{ bytes: number; bootloader: string }> {
  const image = programImage(hex);
  progress('connecting', 0);
  await synchronise(port);
  const major = (await command(port, [STK.GET_PARAMETER, STK.SW_MAJOR], 1))[0]!;
  const minor = (await command(port, [STK.GET_PARAMETER, STK.SW_MINOR], 1))[0]!;
  await command(port, [STK.ENTER_PROGMODE]);
  const signature = await command(port, [STK.READ_SIGN], 3);
  if (!ATMEGA328P_SIGNATURE.every((byte, i) => signature[i] === byte)) {
    throw new UploadError('wrong-chip', Array.from(signature, (b) => b.toString(16)).join(' '));
  }

  const pages = image.length / PAGE_SIZE;
  const length = [PAGE_SIZE >> 8, PAGE_SIZE & 0xff, 0x46];
  for (let page = 0; page < pages; page++) {
    progress('writing', page / pages);
    const at = page * PAGE_SIZE;
    await command(port, address(at));
    try {
      await command(port, [STK.PROG_PAGE, ...length, ...image.subarray(at, at + PAGE_SIZE)]);
    } catch (error) {
      throw error instanceof UploadError ? new UploadError('write-failed', String(at)) : error;
    }
  }
  for (let page = 0; page < pages; page++) {
    progress('checking', page / pages);
    const at = page * PAGE_SIZE;
    await command(port, address(at));
    const back = await command(port, [STK.READ_PAGE, ...length], PAGE_SIZE);
    const expected = image.subarray(at, at + PAGE_SIZE);
    if (!expected.every((byte, i) => back[i] === byte)) {
      throw new UploadError('verify-failed', String(at));
    }
  }
  // Leaving program mode starts the new program.
  await command(port, [STK.LEAVE_PROGMODE]);
  progress('done', 1);
  return { bytes: image.length, bootloader: `${major}.${minor}` };
}
