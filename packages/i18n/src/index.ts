import { bn, en, type MessageKey } from './messages';

export type { MessageKey };
export type Locale = 'bn' | 'en';
export const LOCALES: readonly Locale[] = ['bn', 'en'];
export const DEFAULT_LOCALE: Locale = 'bn';

const CATALOGS: Record<Locale, Record<MessageKey, string>> = { bn, en };
const INTL_LOCALE: Record<Locale, string> = { bn: 'bn-BD', en: 'en-GB' };

export type MessageParams = Record<string, string | number>;

export function translate(locale: Locale, key: MessageKey, params: MessageParams = {}): string {
  return CATALOGS[locale][key].replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    name in params ? String(params[name]) : placeholder,
  );
}

/** Formats a number with the locale's digits (Bangla digits for `bn`). */
export function formatNumber(locale: Locale, value: number, significantDigits = 3): string {
  return new Intl.NumberFormat(INTL_LOCALE[locale], {
    maximumSignificantDigits: significantDigits,
    useGrouping: false,
  }).format(value);
}

export type Unit = 'V' | 'A' | 'Ω' | 'W' | 'F';
const PREFIXES = [
  { factor: 1e6, symbol: 'M' },
  { factor: 1e3, symbol: 'k' },
  { factor: 1, symbol: '' },
  { factor: 1e-3, symbol: 'm' },
  { factor: 1e-6, symbol: 'µ' },
  { factor: 1e-9, symbol: 'n' },
] as const;

/**
 * Formats a physical quantity with an SI prefix, e.g. 0.0218 A → "21.8 mA"
 * ("২১.৮ mA" in Bangla). Unit symbols stay in their international form, as
 * printed on real meters and parts. Readings below 1 µ-unit are leakage and
 * read as zero; capacitances are part values, so they go down to nanofarads.
 */
export function formatQuantity(locale: Locale, value: number, unit: Unit): string {
  const magnitude = Math.abs(value);
  if (!Number.isFinite(value)) return `– ${unit}`;
  if (magnitude < (unit === 'F' ? 1e-10 : 1e-6)) return `${formatNumber(locale, 0)} ${unit}`;
  const prefix = PREFIXES.find((p) => magnitude >= p.factor * 0.9995) ?? PREFIXES.at(-1)!;
  return `${formatNumber(locale, value / prefix.factor)} ${prefix.symbol}${unit}`;
}

/** "5 minutes ago" style text for a past time. */
export function formatRelativeTime(locale: Locale, then: number, now: number = Date.now()): string {
  const format = new Intl.RelativeTimeFormat(INTL_LOCALE[locale], { numeric: 'auto' });
  const seconds = Math.round((then - now) / 1000);
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60],
  ];
  for (const [unit, size] of steps) {
    if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit);
  }
  return format.format(0, 'minute');
}
