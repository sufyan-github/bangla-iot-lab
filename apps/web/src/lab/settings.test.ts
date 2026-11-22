import { describe, expect, it } from 'vitest';
import { parseSettings } from './settings';

const line = (space: string, key: string, type: string, hex: string) =>
  [space, key, type, hex].join('\x1f');

describe('saved settings as shown in the inspector', () => {
  it('reads whole numbers, strings and byte blocks, little-endian and signed where they are', () => {
    const text = [
      line('lab', 'starts', 'i32', '03000000'),
      line('lab', 'below', 'i16', 'feff'),
      line('lab', 'big', 'u64', 'ffffffffffffffff'),
      line('lab', 'name', 'str', '526168c3ac6d'),
      line('lab', 'volts', 'blob', '33335340'),
      '',
    ].join('\n');
    expect(parseSettings(text)).toEqual([
      { space: 'lab', key: 'starts', type: 'i32', value: '3' },
      { space: 'lab', key: 'below', type: 'i16', value: '-2' },
      { space: 'lab', key: 'big', type: 'u64', value: '18446744073709551615' },
      { space: 'lab', key: 'name', type: 'str', value: JSON.stringify('Rahìm') },
      { space: 'lab', key: 'volts', type: 'blob', value: '', bytes: 4 },
    ]);
  });

  it('leaves out lines it cannot read, and reads nothing from nothing', () => {
    expect(parseSettings('')).toEqual([]);
    expect(
      parseSettings(
        [line('lab', 'x', 'i32', '0300'), line('lab', 'y', 'what', '00'), 'junk'].join('\n'),
      ),
    ).toEqual([]);
  });
});
