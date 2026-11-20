import { describe, expect, it } from 'vitest';
import { formatNumber, formatQuantity, formatRelativeTime, translate } from './index';
import { bn, en } from './messages';

describe('catalogues', () => {
  it('have the same keys and placeholders in both languages', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(bn).sort());
    const placeholders = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort();
    for (const key of Object.keys(bn) as (keyof typeof bn)[]) {
      expect(placeholders(en[key]), key).toEqual(placeholders(bn[key]));
      expect(bn[key].trim(), key).not.toBe('');
      expect(en[key].trim(), key).not.toBe('');
    }
  });

  it('fills placeholders and leaves unknown ones visible', () => {
    expect(translate('en', 'home.parts', { count: 3 })).toBe('3 parts');
    expect(translate('bn', 'diag.led-reversed', { id: 'LED1' })).toContain('LED1 উল্টো');
    expect(translate('en', 'home.parts')).toBe('{count} parts');
  });
});

describe('number formatting', () => {
  it('uses Bangla digits for Bangla and three significant digits', () => {
    expect(formatNumber('bn', 21.84)).toBe('২১.৮');
    expect(formatNumber('en', 21.84)).toBe('21.8');
    expect(formatNumber('en', 1234.5)).toBe('1230');
  });

  it('picks a readable SI prefix', () => {
    expect(formatQuantity('en', 0.02184, 'A')).toBe('21.8 mA');
    expect(formatQuantity('bn', 0.02184, 'A')).toBe('২১.৮ mA');
    expect(formatQuantity('en', 1.82, 'V')).toBe('1.82 V');
    expect(formatQuantity('en', 330, 'Ω')).toBe('330 Ω');
    expect(formatQuantity('en', 4700, 'Ω')).toBe('4.7 kΩ');
    expect(formatQuantity('en', 1e6, 'Ω')).toBe('1 MΩ');
    expect(formatQuantity('en', 0.000035, 'A')).toBe('35 µA');
    expect(formatQuantity('en', -0.0218, 'A')).toBe('-21.8 mA');
    expect(formatQuantity('en', 0.9996, 'V')).toBe('1 V');
  });

  it('shows leakage-level values as zero', () => {
    expect(formatQuantity('en', 3e-12, 'A')).toBe('0 A');
    expect(formatQuantity('bn', -2e-9, 'V')).toBe('০ V');
    expect(formatQuantity('en', Number.NaN, 'V')).toBe('– V');
  });

  it('describes past times relatively', () => {
    const now = Date.UTC(2026, 10, 20, 12);
    expect(formatRelativeTime('en', now - 5 * 60_000, now)).toBe('5 minutes ago');
    expect(formatRelativeTime('en', now - 3 * 3_600_000, now)).toBe('3 hours ago');
    expect(formatRelativeTime('en', now - 10_000, now)).toBe('this minute');
    expect(formatRelativeTime('bn', now - 5 * 86_400_000, now)).toBe('৫ দিন আগে');
  });
});
