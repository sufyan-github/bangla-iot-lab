import { describe, expect, it } from 'vitest';
import { toCsv } from './csv';

describe('CSV', () => {
  it('writes a header and rows, quoting only what needs it', () => {
    expect(
      toCsv(
        ['time_s', 'topic', 'payload'],
        [
          [0.5, 'lab/knob', '2048'],
          [1, 'lab/note', 'hot, "very"'],
          [1.5, 'lab/বাংলা', 'line\nbreak'],
        ],
      ),
    ).toBe(
      'time_s,topic,payload\r\n0.5,lab/knob,2048\r\n1,lab/note,"hot, ""very"""\r\n1.5,lab/বাংলা,"line\nbreak"\r\n',
    );
  });

  it('leaves missing values and non-numbers empty', () => {
    expect(toCsv(['a', 'b'], [[Number.NaN, undefined]])).toBe('a,b\r\n,\r\n');
  });
});
