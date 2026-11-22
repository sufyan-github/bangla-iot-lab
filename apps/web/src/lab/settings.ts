/**
 * Reads a board's saved settings (the text the board library keeps for the
 * ESP32's Preferences) into something to show: each namespace, key, type and
 * value. Kept apart from the screen so it can be tested without a browser.
 */
export interface SavedSetting {
  space: string;
  key: string;
  type: string;
  /** The value as a student would write it: a number, a quoted string, or the byte count of a block. */
  value: string;
  /** For a byte block: how many bytes. */
  bytes?: number;
}

const SEPARATOR = '\x1f';
const WHOLE: Record<string, { size: number; signed: boolean }> = {
  i8: { size: 1, signed: true },
  u8: { size: 1, signed: false },
  i16: { size: 2, signed: true },
  u16: { size: 2, signed: false },
  i32: { size: 4, signed: true },
  u32: { size: 4, signed: false },
  i64: { size: 8, signed: true },
  u64: { size: 8, signed: false },
};

function bytesOf(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

export function parseSettings(text: string): SavedSetting[] {
  const settings: SavedSetting[] = [];
  for (const line of text.split('\n')) {
    const [space, key, type, hex] = line.split(SEPARATOR);
    if (space === undefined || key === undefined || type === undefined || hex === undefined)
      continue;
    if (!/^([0-9a-f]{2})*$/.test(hex)) continue;
    const bytes = bytesOf(hex);
    const whole = WHOLE[type];
    if (whole) {
      if (bytes.length !== whole.size) continue;
      // Little-endian, as the chip stores them.
      let value = 0n;
      for (let i = bytes.length - 1; i >= 0; i--) value = (value << 8n) | BigInt(bytes[i]!);
      if (whole.signed && bytes[bytes.length - 1]! & 0x80) value -= 1n << BigInt(8 * bytes.length);
      settings.push({ space, key, type, value: value.toString() });
    } else if (type === 'str') {
      settings.push({ space, key, type, value: JSON.stringify(new TextDecoder().decode(bytes)) });
    } else if (type === 'blob') {
      settings.push({ space, key, type, value: '', bytes: bytes.length });
    }
  }
  return settings;
}
