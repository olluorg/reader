import { DEFAULTS, type AppearanceConfig, type Theme } from './apply';

const KEY = 'reader.appearance';

function isTheme(v: unknown): v is Theme {
  return v === 'auto' || v === 'light' || v === 'dark';
}

export function loadAppearance(): AppearanceConfig {
  if (typeof localStorage === 'undefined') return { ...DEFAULTS };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<AppearanceConfig>;
    return {
      theme: isTheme(parsed.theme) ? parsed.theme : DEFAULTS.theme,
      fontSans:
        typeof parsed.fontSans === 'string' && parsed.fontSans
          ? parsed.fontSans
          : DEFAULTS.fontSans,
      fontSerif:
        typeof parsed.fontSerif === 'string' && parsed.fontSerif
          ? parsed.fontSerif
          : DEFAULTS.fontSerif,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveAppearance(config: AppearanceConfig): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(KEY, JSON.stringify(config));
  } catch {
    // ignore quota errors
  }
}
