/**
 * Tokenisation for the n-gram model.
 *
 * Words are runs of letters / digits, with apostrophes and hyphens allowed
 * *inside* a word ("don't", "из-за"). Everything else (punctuation, markdown
 * syntax, emoji) is a boundary and is dropped — the model only ever sees
 * word tokens, lower-cased so "The" and "the" share statistics.
 *
 * Learning is sentence-bounded so n-grams don't leak across sentence breaks
 * (predicting the first word of the next sentence from the last word of the
 * previous one is noise). `splitSentences` is deliberately crude: it breaks
 * on terminal punctuation and hard line breaks, which is plenty for a
 * frequency model.
 */

// `u` flag + explicit ranges keeps this readable and dependency-free.
const WORD = /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu;
const SENTENCE_SPLIT = /[.!?…。！？]+|\n{1,}/;

/** Lower-cased word tokens of a single text run (one sentence's worth). */
export function tokenizeWords(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(WORD)) {
    // Strip leading/trailing apostrophes-hyphens the inner-char rule may keep.
    const w = m[0].toLowerCase().replace(/^['’-]+|['’-]+$/g, '');
    if (w) out.push(w);
  }
  return out;
}

/** Split a block of text into rough sentences for bounded learning. */
export function splitSentences(text: string): string[] {
  return text
    .split(SENTENCE_SPLIT)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Strip the markdown scaffolding that would otherwise pollute the model with
 * URL fragments, code identifiers, and `reader-media:` ids. Kept lightweight —
 * we only need to remove the high-noise constructs, not parse markdown.
 */
export function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ' ') // fenced code
    .replace(/`[^`]*`/g, ' ') // inline code
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ') // images (incl. reader-media refs)
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // links → keep visible text only
    .replace(/<[^>]+>/g, ' ') // raw HTML tags
    .replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, '') // heading markers
    .replace(/^[ \t]*>[ \t]?/gm, ''); // blockquote markers
}
