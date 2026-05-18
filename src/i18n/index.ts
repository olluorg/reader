import { en } from './en';
import { ru } from './ru';

export type Lang = 'en' | 'ru';

type Dict = typeof en;
type DictKey = keyof Dict;

type PluralForms = { one: string; few?: string; many?: string; other: string };
type Value = string | PluralForms;

function detectLang(): Lang {
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

export const lang: Lang = detectLang();

const dict: Dict = lang === 'ru' ? (ru as unknown as Dict) : en;

const pluralRules = new Intl.PluralRules(lang === 'ru' ? 'ru-RU' : 'en-US');

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

export function t(key: DictKey, params?: Record<string, string | number>): string {
  const entry = (dict[key] ?? (en as Record<string, Value>)[key as string]) as Value | undefined;
  if (entry === undefined) return String(key);
  if (typeof entry === 'string') return interpolate(entry, params);
  const count = Number(params?.count ?? 0);
  return interpolate(pickPlural(entry, count), params);
}

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
