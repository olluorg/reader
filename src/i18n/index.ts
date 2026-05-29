import { en } from './en';
import { ru } from './ru';

export type Lang = 'en' | 'ru';

/** Languages the UI ships translations for. */
export const AVAILABLE_LANGS: readonly Lang[] = ['en', 'ru'];

/**
 * localStorage key holding a manual language override ('en' | 'ru').
 * Absent → follow the system. Written only by the optional language
 * plugin; the core just honours it if present.
 */
export const LANG_STORAGE_KEY = 'reader.lang';

export type PluralForms = {
  one: string;
  few?: string;
  many?: string;
  other: string;
};
type Value = string | PluralForms;

/**
 * A message bundle: a flat map of keys to either a plain string or a set
 * of plural forms. Both the core and each plugin define their own bundle.
 */
export type Messages = Record<string, Value>;

function readOverride(): Lang | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const v = localStorage.getItem(LANG_STORAGE_KEY);
    if (v === 'en' || v === 'ru') return v;
  } catch {
    // ignore storage errors (private mode, disabled storage, …)
  }
  return null;
}

function detectSystemLang(): Lang {
  const candidates: string[] = [];
  if (typeof navigator !== 'undefined') {
    if (Array.isArray(navigator.languages)) candidates.push(...navigator.languages);
    if (navigator.language) candidates.push(navigator.language);
  }
  for (const tag of candidates) {
    const primary = tag.toLowerCase().split('-')[0];
    if (primary === 'ru') return 'ru';
    if (primary === 'en') return 'en';
  }
  return 'en';
}

function detectLang(): Lang {
  return readOverride() ?? detectSystemLang();
}

export const lang: Lang = detectLang();

const pluralRules = new Intl.PluralRules(lang === 'ru' ? 'ru-RU' : 'en-US');

/** Locale tag for `Intl` / `toLocaleString` consumers. */
export const locale: string = lang === 'ru' ? 'ru-RU' : 'en-US';

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, key) =>
    key in params ? String(params[key]) : `{${key}}`,
  );
}

function pickPlural(forms: PluralForms, count: number): string {
  const category = pluralRules.select(count);
  if (category === 'one' && forms.one) return forms.one;
  if (category === 'few' && forms.few) return forms.few;
  if (category === 'many' && forms.many) return forms.many;
  return forms.other;
}

export type Translator<D extends Messages> = (
  key: keyof D,
  params?: Record<string, string | number>,
) => string;

/**
 * Build a translator bound to the active {@link lang}, backed by a set of
 * per-language bundles. `en` is required and doubles as the fallback when a
 * key is missing from the active language — so a plugin only has to ship
 * English to work, and may add other languages incrementally.
 *
 * This is the seam that lets each plugin stay a self-contained unit: it
 * carries its own bundles and gets a typed `t` without importing the core's
 * message catalogue.
 */
export function createTranslator<D extends Messages>(
  bundles: { en: D } & Partial<Record<Lang, Messages>>,
): Translator<D> {
  const active = (bundles[lang] ?? bundles.en) as Messages;
  const fallback = bundles.en as Messages;
  return (key, params) => {
    const k = key as string;
    const entry = (active[k] ?? fallback[k]) as Value | undefined;
    if (entry === undefined) return k;
    if (typeof entry === 'string') return interpolate(entry, params);
    const count = Number(params?.count ?? 0);
    return interpolate(pickPlural(entry, count), params);
  };
}

/** Core translator over the app-wide message catalogue. */
export const t: Translator<typeof en> = createTranslator({ en, ru });

/** Format a relative-time string ("3 min ago"). */
export function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  const min = 60_000;
  const hr = 60 * min;
  const day = 24 * hr;
  if (diff < min) return t('time.justNow');
  if (diff < hr) {
    const n = Math.floor(diff / min);
    return t('time.minutesAgo', { count: n, n });
  }
  if (diff < day) {
    const n = Math.floor(diff / hr);
    return t('time.hoursAgo', { count: n, n });
  }
  if (diff < 7 * day) {
    const n = Math.floor(diff / day);
    return t('time.daysAgo', { count: n, n });
  }
  return new Date(ts).toLocaleDateString(lang === 'ru' ? 'ru-RU' : undefined);
}

export function setHtmlLang(): void {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lang;
  }
}
