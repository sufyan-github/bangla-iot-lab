import { create } from 'zustand';

/**
 * Light or dark colours. By default the lab follows the device's own setting;
 * a student may choose light or dark instead, and the choice is remembered on
 * this device. The colours themselves are in app.css: an explicit choice is
 * written to <html data-theme>, and without one the stylesheet follows the
 * device.
 */
export type ThemeChoice = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'banglalab.theme';
/** The order the header's button steps through. */
export const THEME_ORDER: readonly ThemeChoice[] = ['system', 'dark', 'light'];

function storedChoice(): ThemeChoice {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

function apply(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === 'system') delete root.dataset.theme;
  else root.dataset.theme = choice;
}

interface ThemeState {
  choice: ThemeChoice;
  setChoice(choice: ThemeChoice): void;
}

export const useTheme = create<ThemeState>((set) => ({
  choice: storedChoice(),
  setChoice(choice) {
    try {
      if (choice === 'system') localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, choice);
    } catch {
      // Private mode: the choice lasts for this visit.
    }
    apply(choice);
    set({ choice });
  },
}));

// Before the first drawing, so a remembered choice does not flash the other colours.
apply(useTheme.getState().choice);
