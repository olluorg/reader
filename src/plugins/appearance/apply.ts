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
 * status bar) keeps its design intact. Headings use em-based sizing
 * (so changing font-size on `.milkdown` scales the whole document
 * proportionally) and have their font-family overridden to follow the
 * chosen body font, since main.css otherwise pins them to a serif.
 */

const STYLE_ID = 'reader-appearance-overrides';

export type Theme = 'auto' | 'light' | 'dark';
export type PaletteId = 'warm' | 'cool' | 'forest' | 'plum' | 'mono';

export interface AppearanceConfig {
  theme: Theme;
  /** Colour scheme identifier — drives `data-palette` on <html>. */
  palette: PaletteId;
  /** font-family value applied to the document body text. */
  fontBody: string;
  /** Document base font size in pixels (headings scale via em). */
  fontSize: number;
}

/**
 * Swatch colours used in the palette picker (accent in light + dark).
 * Human labels live in the plugin's i18n bundle, keyed `palette.<id>`.
 */
export const PALETTES: ReadonlyArray<{
  id: PaletteId;
  swatch: { light: string; dark: string };
}> = [
  { id: 'warm', swatch: { light: '#b25634', dark: '#d68660' } },
  { id: 'cool', swatch: { light: '#2563a7', dark: '#5b9be8' } },
  { id: 'forest', swatch: { light: '#436a3a', dark: '#82b276' } },
  { id: 'plum', swatch: { light: '#8b4179', dark: '#c282b1' } },
  { id: 'mono', swatch: { light: '#1f1f1f', dark: '#e6e6e6' } },
];

export function isPaletteId(v: unknown): v is PaletteId {
  return PALETTES.some((p) => p.id === v);
}

export const DEFAULT_FONT_SANS =
  '"Inter Variable", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif';
export const DEFAULT_FONT_SERIF =
  '"Source Serif 4 Variable", "Source Serif 4", "New York", "Iowan Old Style", "Charter", Cambria, Georgia, serif';

export const DEFAULTS: AppearanceConfig = {
  theme: 'auto',
  palette: 'warm',
  fontBody: DEFAULT_FONT_SERIF,
  fontSize: 19,
};

export const FONT_MIN = 14;
export const FONT_MAX = 28;

export type FontPresetId =
  | 'serif-default'
  | 'georgia'
  | 'iowan'
  | 'charter'
  | 'system-serif'
  | 'inter'
  | 'system-sans'
  | 'helvetica';

/** Labels live in the plugin's i18n bundle, keyed `font.<id>`. */
export const FONT_PRESETS: ReadonlyArray<{ id: FontPresetId; value: string }> = [
  { id: 'serif-default', value: DEFAULT_FONT_SERIF },
  { id: 'georgia', value: 'Georgia, "Times New Roman", serif' },
  { id: 'iowan', value: '"Iowan Old Style", Georgia, serif' },
  { id: 'charter', value: 'Charter, Cambria, Georgia, serif' },
  { id: 'system-serif', value: 'ui-serif, Georgia, "Times New Roman", serif' },
  { id: 'inter', value: DEFAULT_FONT_SANS },
  {
    id: 'system-sans',
    value:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
  },
  { id: 'helvetica', value: 'Helvetica, Arial, sans-serif' },
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

function writeDataPalette(palette: PaletteId): void {
  document.documentElement.setAttribute('data-palette', palette);
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
  writeDataPalette(config.palette);
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
  // user's chosen size unless we force them back to inherit. Headings use
  // em sizing (they scale from `.milkdown`'s computed size), but reader's
  // main.css pins their font-family to var(--font-serif), so we override
  // it here to follow the chosen body font. h4 is deliberately left out:
  // it's a small uppercase sans label, not a running-text heading.
  style.textContent = `.milkdown {
  font-family: ${config.fontBody};
  font-size: ${config.fontSize}px;
}
.milkdown .ProseMirror p {
  font-size: inherit;
}
.milkdown .ProseMirror h1,
.milkdown .ProseMirror h2,
.milkdown .ProseMirror h3,
.milkdown .ProseMirror h5,
.milkdown .ProseMirror h6 {
  font-family: ${config.fontBody};
}`;
}
