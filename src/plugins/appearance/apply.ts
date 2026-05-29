/**
 * Live application of appearance settings to the document.
 *
 * Theme handling drives the `data-theme` attribute on <html>; the
 * stylesheet (src/styles/main.css) flips palettes based on its value.
 * For "auto" we resolve the OS preference and listen for changes so a
 * later system flip is picked up live.
 *
 * Font + font-size overrides are scoped to the Milkdown content area
 * (`.milkdown`) so the UI chrome (toolbar, dialogs, library lists,
 * status bar) keeps its design intact. Headings inside Milkdown
 * inherit the font-family from `.milkdown` for body text and use
 * em-based sizing, so changing font-size on `.milkdown` scales the
 * entire document proportionally.
 */

const STYLE_ID = 'reader-appearance-overrides';

export type Theme = 'auto' | 'light' | 'dark';

export interface AppearanceConfig {
  theme: Theme;
  /** font-family value applied to the document body text. */
  fontBody: string;
  /** Document base font size in pixels (headings scale via em). */
  fontSize: number;
}

export const DEFAULT_FONT_SANS =
  '"Inter Variable", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif';
export const DEFAULT_FONT_SERIF =
  '"Source Serif 4 Variable", "Source Serif 4", "New York", "Iowan Old Style", "Charter", Cambria, Georgia, serif';

export const DEFAULTS: AppearanceConfig = {
  theme: 'auto',
  fontBody: DEFAULT_FONT_SERIF,
  fontSize: 19,
};

export const FONT_MIN = 14;
export const FONT_MAX = 28;

export const FONT_PRESETS: ReadonlyArray<{ label: string; value: string }> = [
  { label: 'Source Serif 4 (по умолчанию)', value: DEFAULT_FONT_SERIF },
  { label: 'Georgia', value: 'Georgia, "Times New Roman", serif' },
  { label: 'Iowan Old Style', value: '"Iowan Old Style", Georgia, serif' },
  { label: 'Charter', value: 'Charter, Cambria, Georgia, serif' },
  { label: 'Системный serif', value: 'ui-serif, Georgia, "Times New Roman", serif' },
  { label: 'Inter (sans-serif)', value: DEFAULT_FONT_SANS },
  {
    label: 'Системный sans-serif',
    value:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
  },
  { label: 'Helvetica / Arial', value: 'Helvetica, Arial, sans-serif' },
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

  // Font + size overrides land only on the document content area so
  // the rest of the UI keeps its native sizing.
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = STYLE_ID;
    document.head.appendChild(style);
  }
  // Crepe's reset.css pins `.milkdown .ProseMirror p { font-size: 16px }`,
  // which breaks inheritance from `.milkdown` — so paragraphs ignore the
  // user's chosen size unless we force them back to inherit. Headings in
  // reader's main.css already use em (they scale from `.milkdown`'s
  // computed size), so we don't need to touch them.
  style.textContent = `.milkdown {
  font-family: ${config.fontBody};
  font-size: ${config.fontSize}px;
}
.milkdown .ProseMirror p {
  font-size: inherit;
}`;
}
