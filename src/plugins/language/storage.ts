import { LANG_STORAGE_KEY, type Lang } from '../../i18n';

/** Read the manual language override, or null when following the system. */
export function loadLangPref(): Lang | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const v = localStorage.getItem(LANG_STORAGE_KEY);
    if (v === 'en' || v === 'ru') return v;
  } catch {
    // ignore
  }
  return null;
}

/** Persist a manual override, or pass null to clear it (back to system). */
export function saveLangPref(lang: Lang | null): void {
  if (typeof localStorage === 'undefined') return;
  try {
    if (lang === null) localStorage.removeItem(LANG_STORAGE_KEY);
    else localStorage.setItem(LANG_STORAGE_KEY, lang);
  } catch {
    // ignore quota / disabled-storage errors
  }
}
