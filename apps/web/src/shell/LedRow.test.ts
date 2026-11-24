import { describe, expect, it } from 'vitest';
import { ledsFor } from './LedRow';

describe('progress as LEDs', () => {
  it('lights what is done, rings the one in hand, leaves the rest dark', () => {
    expect(ledsFor(2, 5)).toEqual(['on', 'on', 'now', 'off', 'off']);
    expect(ledsFor(0, 3)).toEqual(['now', 'off', 'off']);
  });

  it('lights them all when everything is done', () => {
    expect(ledsFor(4, 4)).toEqual(['on', 'on', 'on', 'on']);
  });
});
