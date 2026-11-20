import {
  DEFAULT_LOCALE,
  formatNumber,
  formatQuantity,
  formatRelativeTime,
  translate,
  type Locale,
  type MessageKey,
  type MessageParams,
  type Unit,
} from '@banglalab/i18n';
import { useMemo } from 'react';
import { create } from 'zustand';

const STORAGE_KEY = 'banglalab.locale';

function storedLocale(): Locale {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'en' || value === 'bn' ? value : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

interface LocaleState {
  locale: Locale;
  setLocale(locale: Locale): void;
}

export const useLocale = create<LocaleState>((set) => ({
  locale: storedLocale(),
  setLocale(locale) {
    try {
      localStorage.setItem(STORAGE_KEY, locale);
    } catch {
      // Private mode: the choice simply lasts for this visit.
    }
    document.documentElement.lang = locale;
    set({ locale });
  },
}));

export type Translate = (key: MessageKey, params?: MessageParams) => string;

/** Text and number formatting in the student's chosen language. */
export function useT() {
  const locale = useLocale((state) => state.locale);
  return useMemo(
    () => ({
      locale,
      t: ((key, params) => translate(locale, key, params)) as Translate,
      number: (value: number, significantDigits?: number) =>
        formatNumber(locale, value, significantDigits),
      quantity: (value: number, unit: Unit) => formatQuantity(locale, value, unit),
      relativeTime: (then: number) => formatRelativeTime(locale, then),
    }),
    [locale],
  );
}
