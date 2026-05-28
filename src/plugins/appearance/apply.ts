/**
 * Live application of appearance settings to the document.
 *
 * Theme handling rides on the existing `prefers-color-scheme` CSS in
 * reader's main.css — we override `color-scheme` on `:root` so that
 * "light" or "dark" force the corresponding rule branches and "auto"
 * defers to the OS preference.
 *
 * Fonts override the `--font-sans` and `--font-serif` CSS variables
 * via an injected `<style>` element so we don't mutate elements that
 * the editor or other plugins might also touch.
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

export function applyAppearance(config: AppearanceConfig): void {
  if (typeof document === 'undefined') return;
  // Theme: drive the existing `@media (prefers-color-scheme: dark)` rules.
  document.documentElement.style.colorScheme =
    config.theme === 'auto' ? '' : config.theme;

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
