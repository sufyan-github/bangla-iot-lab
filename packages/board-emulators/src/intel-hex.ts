/**
 * Parses Intel HEX, the text format avr-gcc and the Arduino IDE produce for
 * firmware. Returns the bytes laid out at their flash addresses.
 */
export function parseIntelHex(hex: string, flashSize: number): Uint8Array {
  const flash = new Uint8Array(flashSize);
  let sawEndOfFile = false;
  let lineNumber = 0;

  for (const rawLine of hex.split(/\r?\n/)) {
    lineNumber++;
    const line = rawLine.trim();
    if (line === '') continue;
    if (!/^:([0-9a-fA-F]{2}){5,}$/.test(line)) {
      throw new Error(`Intel HEX line ${lineNumber}: not a valid record`);
    }
    const bytes = new Uint8Array((line.length - 1) / 2);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Number.parseInt(line.slice(1 + i * 2, 3 + i * 2), 16);
    }
    const length = bytes[0]!;
    if (bytes.length !== length + 5) {
      throw new Error(`Intel HEX line ${lineNumber}: length does not match the record`);
    }
    if (bytes.reduce((sum, b) => (sum + b) & 0xff, 0) !== 0) {
      throw new Error(`Intel HEX line ${lineNumber}: checksum mismatch`);
    }

    const address = (bytes[1]! << 8) | bytes[2]!;
    const recordType = bytes[3]!;
    if (recordType === 0x00) {
      if (address + length > flashSize) {
        throw new Error(`Intel HEX line ${lineNumber}: program does not fit in ${flashSize} bytes`);
      }
      flash.set(bytes.subarray(4, 4 + length), address);
    } else if (recordType === 0x01) {
      sawEndOfFile = true;
      break;
    } else if (recordType !== 0x02 && recordType !== 0x03 && recordType !== 0x04 && recordType !== 0x05) {
      // 02-05 only set addresses beyond 64 KiB or the start address; irrelevant for a 32 KiB part.
      throw new Error(`Intel HEX line ${lineNumber}: unsupported record type ${recordType}`);
    }
  }
  if (!sawEndOfFile) throw new Error('Intel HEX: missing end-of-file record');
  return flash;
}
