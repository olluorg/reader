/**
 * Live application of appearance settings to the document.
 *
 * Theme handling drives the `data-theme` attribute on <html>; the
 * stylesheet (src/styles/main.css) flips palettes based on its value.
 * For "auto" we resolve the OS preference and listen for changes so a
 * later system flip is picked up live.
 *
 * Fonts override `--font-sans` and `--font-serif` via an injected
 * `<style>` element so we don't mutate elements that the editor or
 * other plugins might also touch.
 */

const STYLE_ID = 'reader-appearance-overrides';

export type Theme = 'auto' | 'light' | 'dark';

export interface AppearanceConfig {
  theme: Theme;
  fontSans: string;
  fontSerif: string;
}

export const DEFAULTS: AppearanceConfig = {
  theme: 'auto',
  fontSans:
    '"Inter Variable", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
  fontSerif:
    '"Source Serif 4 Variable", "Source Serif 4", "New York", "Iowan Old Style", "Charter", Cambria, Georgia, serif',
};

export const SANS_PRESETS: ReadonlyArray<{ label: string; value: string }> = [
  { label: 'Inter (по умолчанию)', value: DEFAULTS.fontSans },
  {
    label: 'Системный sans-serif',
    value:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
  },
  { label: 'Helvetica / Arial', value: 'Helvetica, Arial, sans-serif' },
  { label: 'Verdana', value: 'Verdana, Geneva, sans-serif' },
];

export const SERIF_PRESETS: ReadonlyArray<{ label: string; value: string }> = [
  { label: 'Source Serif 4 (по умолчанию)', value: DEFAULTS.fontSerif },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Iowan Old Style', value: '"Iowan Old Style", Georgia, serif' },
  { label: 'Charter', value: 'Charter, Cambria, Georgia, serif' },
  { label: 'Системный serif', value: 'ui-serif, Georgia, "Times New Roman", serif' },
];

let osMediaQuery: MediaQueryList | null = null;
let osListener: ((e: MediaQueryListEvent) => void) | null = null;
let currentConfig: AppearanceConfig = { ...DEFAULTS };

function effectiveTheme(theme: Theme): 'light' | 'dark' {
  if (theme === 'auto') {
    if (typeof matchMedia === 'undefined') return 'light';
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return theme;
}

function writeDataTheme(theme: 'light' | 'dark'): void {
  document.documentElement.setAttribute('data-theme', theme);
}

function attachOsListener(): void {
  if (typeof matchMedia === 'undefined') return;
  if (osMediaQuery && osListener) {
    osMediaQuery.removeEventListener('change', osListener);
  }
  osMediaQuery = matchMedia('(prefers-color-scheme: dark)');
  osListener = () => {
    if (currentConfig.theme === 'auto') {
      writeDataTheme(effectiveTheme('auto'));
    }
  };
  osMediaQuery.addEventListener('change', osListener);
}

export function applyAppearance(config: AppearanceConfig): void {
  if (typeof document === 'undefined') return;
  currentConfig = { ...config };
  writeDataTheme(effectiveTheme(config.theme));
  if (config.theme === 'auto') {
    attachOsListener();
  }

  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = STYLE_ID;
    document.head.appendChild(style);
  }
  style.textContent = `:root {
  --font-sans: ${config.fontSans};
  --font-serif: ${config.fontSerif};
}`;
}
