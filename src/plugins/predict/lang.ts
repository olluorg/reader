/**
 * Cheap per-text language detection for the predict plugin.
 *
 * The model keeps a separate n-gram table per language; we pick which one to
 * read (predict) or write (learn) from by looking at the script of the text
 * around the caret. Only the two languages the app ships translations for —
 * Russian and English — are distinguished. Anything non-Cyrillic falls back
 * to English, which is the right default for code, Latin-script text, and the
 * empty document.
 */

export type PredictLang = 'ru' | 'en';

const CYRILLIC = /[Ѐ-ӿ]/g;
const LATIN = /[A-Za-z]/g;

/** Pick the model language from a chunk of text by script majority. */
export function detectLang(text: string): PredictLang {
  const cyr = text.match(CYRILLIC)?.length ?? 0;
  const lat = text.match(LATIN)?.length ?? 0;
  if (cyr === 0 && lat === 0) return 'en';
  return cyr >= lat ? 'ru' : 'en';
}
