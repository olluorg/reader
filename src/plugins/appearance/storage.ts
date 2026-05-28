import {
  DEFAULTS,
  FONT_MAX,
  FONT_MIN,
  type AppearanceConfig,
  type Theme,
} from './apply';

const KEY = 'reader.appearance';

function isTheme(v: unknown): v is Theme {
  return v === 'auto' || v === 'light' || v === 'dark';
}

function isFontSize(v: unknown): v is number {
  return typeof v === 'number' && v >= FONT_MIN && v <= FONT_MAX;
}

export function loadAppearance(): AppearanceConfig {
  if (typeof localStorage === 'undefined') return { ...DEFAULTS };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<AppearanceConfig> & {
      // back-compat with the previous fontSans/fontSerif schema
      fontSerif?: string;
    };
    const fontBody =
      typeof parsed.fontBody === 'string' && parsed.fontBody
        ? parsed.fontBody
        : typeof parsed.fontSerif === 'string' && parsed.fontSerif
          ? parsed.fontSerif
          : DEFAULTS.fontBody;
    return {
      theme: isTheme(parsed.theme) ? parsed.theme : DEFAULTS.theme,
      fontBody,
      fontSize: isFontSize(parsed.fontSize) ? parsed.fontSize : DEFAULTS.fontSize,
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
