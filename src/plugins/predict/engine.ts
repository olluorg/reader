/**
 * Tier-0 prediction engine: a per-language unigram + bigram + trigram model
 * with prefix completion and greedy phrase chaining. Pure, synchronous, and
 * cheap enough to run inside a ProseMirror transaction on every keystroke —
 * no worker, no network, works on any phone offline.
 *
 *   • completion  — the caret sits inside a half-typed word ("прив|") →
 *                   return the most likely suffix ("ет"), context-boosted.
 *   • next word   — the caret follows a space ("привет |") → predict the next
 *                   word via trigram→bigram→unigram back-off.
 *   • phrase      — after the first predicted word, keep chaining as long as
 *                   the next word stays dominant, so capable contexts get a
 *                   few words at once ("at least part of the sentence").
 *
 * Counts are seeded from a tiny bundled corpus and then grow from the user's
 * own writing (see store.ts / index.ts). Exact counts don't matter — only the
 * relative ordering does — so the model is robust to approximate learning.
 */

import { SEED, type SeedCorpus } from './corpus';
import { detectLang, type PredictLang } from './lang';
import { tokenizeWords, splitSentences } from './tokenize';

type Dist = Map<string, number>;

interface LangModel {
  unigram: Dist;
  bigram: Map<string, Dist>;
  trigram: Map<string, Dist>;
  total: number;
  /** Lazily-built sorted vocab for prefix range scans; null ⇒ rebuild. */
  sorted: string[] | null;
}

// ── tuning knobs ─────────────────────────────────────────────────────────
const BIGRAM_BOOST = 50; // weight of a bigram hit relative to raw unigram freq
const MIN_NEXT_COUNT = 2; // min evidence before we volunteer a *next* word
const MIN_CHAIN_PROB = 0.28; // next word must be this dominant to keep chaining
const MAX_CHAIN_WORDS = 3; // additional words past the first prediction
const MAX_SUGGESTION_LEN = 40; // characters; keep the ghost from running away

// Separator for the two-token trigram key: a control char (U+0001) that never
// appears in a word token, so "ab"+"c" can't collide with "a"+"bc".
const TRI_SEP = "\u0001";

function emptyModel(): LangModel {
  return {
    unigram: new Map(),
    bigram: new Map(),
    trigram: new Map(),
    total: 0,
    sorted: null,
  };
}

function bump(dist: Dist, key: string, by = 1): void {
  dist.set(key, (dist.get(key) ?? 0) + by);
}

function bumpNested(map: Map<string, Dist>, outer: string, inner: string): void {
  let d = map.get(outer);
  if (!d) {
    d = new Map();
    map.set(outer, d);
  }
  bump(d, inner);
}

function distTotal(dist: Dist): number {
  let s = 0;
  for (const v of dist.values()) s += v;
  return s;
}

/** Lower bound index of the first vocab word ≥ prefix (binary search). */
function lowerBound(sorted: string[], prefix: string): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < prefix) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export class PredictEngine {
  private models: Record<PredictLang, LangModel> = {
    ru: emptyModel(),
    en: emptyModel(),
  };

  constructor() {
    this.seed('ru', SEED.ru);
    this.seed('en', SEED.en);
  }

  /** Drop everything learned and fall back to the bundled seed corpus. */
  reset(): void {
    this.models = { ru: emptyModel(), en: emptyModel() };
    this.seed('ru', SEED.ru);
    this.seed('en', SEED.en);
  }

  /** Seed unigram/bigram counts from the bundled corpus (rank → weight). */
  private seed(lang: PredictLang, corpus: SeedCorpus): void {
    const m = this.models[lang];
    corpus.words.forEach((w, i) => {
      // Log-scaled, capped weight (≈16 down to 1). The list is 10k words, so a
      // linear rank weight would dwarf learned counts (+1 per use) and freeze
      // out personalisation; a small range lets a few repetitions compete
      // while still ordering common words above rare ones.
      const weight = Math.max(1, Math.round(16 - Math.log2(i + 1)));
      bump(m.unigram, w, weight);
      m.total += weight;
    });
    for (const [a, b] of corpus.bigrams) {
      bumpNested(m.bigram, a, b);
      // Make sure both halves exist as unigrams so prefix search can find them.
      if (!m.unigram.has(b)) bump(m.unigram, b, 1), (m.total += 1);
    }
    m.sorted = null;
  }

  // ── learning ─────────────────────────────────────────────────────────
  /** Fold a block of text (already markdown-stripped) into the model. */
  learn(text: string): void {
    for (const sentence of splitSentences(text)) {
      const lang = detectLang(sentence);
      const m = this.models[lang];
      const toks = tokenizeWords(sentence);
      if (!toks.length) continue;
      for (let i = 0; i < toks.length; i++) {
        bump(m.unigram, toks[i]);
        m.total++;
        if (i >= 1) bumpNested(m.bigram, toks[i - 1], toks[i]);
        if (i >= 2) {
          bumpNested(m.trigram, toks[i - 2] + TRI_SEP + toks[i - 1], toks[i]);
        }
      }
      m.sorted = null;
    }
  }

  // ── prediction ─────────────────────────────────────────────────────────
  /**
   * Given the text immediately before the caret, return the string to insert
   * as ghost-text, or null when there's nothing confident to suggest.
   */
  predict(textBefore: string): string | null {
    const lang = detectLang(textBefore);
    const m = this.models[lang];
    const endsWordChar = /[\p{L}\p{N}]$/u.test(textBefore);
    const tokens = tokenizeWords(textBefore);

    if (endsWordChar) {
      // Completing a half-typed word.
      if (!tokens.length) return null;
      const partial = tokens[tokens.length - 1];
      const context = tokens.slice(0, -1);
      const best = this.bestCompletion(m, context, partial);
      if (!best) return null;
      const suffix = best.slice(partial.length);
      if (!suffix) return null;
      const chain = this.chain(m, [...context, best]);
      return clamp(suffix + chain);
    }

    // Predicting the next word (caret after a space / punctuation).
    if (!tokens.length) return null; // don't volunteer on an empty doc
    const next = this.bestNext(m, tokens);
    if (!next || next.count < MIN_NEXT_COUNT) return null;
    const lead = /\s$/.test(textBefore) ? '' : ' ';
    const chain = this.chain(m, [...tokens, next.word]);
    return clamp(lead + next.word + chain);
  }

  /** Most likely vocab word extending `partial`, context-boosted. null if none. */
  private bestCompletion(m: LangModel, context: string[], partial: string): string | null {
    if (!m.sorted) m.sorted = [...m.unigram.keys()].sort();
    const sorted = m.sorted;
    const start = lowerBound(sorted, partial);
    const prev = context[context.length - 1];
    const prevDist = prev ? m.bigram.get(prev) : undefined;

    let best: string | null = null;
    let bestScore = -1;
    for (let i = start; i < sorted.length; i++) {
      const w = sorted[i];
      if (!w.startsWith(partial)) break; // out of the prefix range
      if (w === partial) continue; // already fully typed
      const score = (m.unigram.get(w) ?? 0) + BIGRAM_BOOST * (prevDist?.get(w) ?? 0);
      if (score > bestScore) {
        bestScore = score;
        best = w;
      }
    }
    return best;
  }

  /** Back-off next-word prediction. Returns the word + its raw evidence count. */
  private bestNext(
    m: LangModel,
    context: string[],
  ): { word: string; count: number; prob: number } | null {
    const w2 = context[context.length - 1];
    const w1 = context[context.length - 2];

    const tri = w1 && w2 ? m.trigram.get(w1 + TRI_SEP + w2) : undefined;
    const dist = (tri && tri.size ? tri : undefined) ?? (w2 ? m.bigram.get(w2) : undefined);
    if (!dist || !dist.size) return null;

    let bestWord: string | null = null;
    let bestCount = 0;
    for (const [w, c] of dist) {
      if (w === w2) continue; // avoid "the the"
      if (c > bestCount) {
        bestCount = c;
        bestWord = w;
      }
    }
    if (!bestWord) return null;
    return { word: bestWord, count: bestCount, prob: bestCount / distTotal(dist) };
  }

  /** Greedily extend with further words while each stays dominant enough. */
  private chain(m: LangModel, context: string[]): string {
    const ctx = [...context];
    let out = '';
    for (let i = 0; i < MAX_CHAIN_WORDS; i++) {
      const next = this.bestNext(m, ctx);
      if (!next || next.prob < MIN_CHAIN_PROB) break;
      if ((out + ' ' + next.word).length > MAX_SUGGESTION_LEN) break;
      out += ' ' + next.word;
      ctx.push(next.word);
    }
    return out;
  }

  // ── persistence ──────────────────────────────────────────────────────
  serialize(lang: PredictLang): SerializedModel {
    const m = this.models[lang];
    return {
      u: [...m.unigram],
      b: [...m.bigram].map(([k, d]) => [k, [...d]] as [string, [string, number][]]),
      t: [...m.trigram].map(([k, d]) => [k, [...d]] as [string, [string, number][]]),
      total: m.total,
    };
  }

  /** Merge a persisted snapshot on top of the seeded model. */
  hydrate(lang: PredictLang, s: SerializedModel): void {
    const m = this.models[lang];
    for (const [w, c] of s.u) bump(m.unigram, w, c);
    for (const [k, d] of s.b) for (const [w, c] of d) bumpNested2(m.bigram, k, w, c);
    for (const [k, d] of s.t) for (const [w, c] of d) bumpNested2(m.trigram, k, w, c);
    m.total += s.total;
    m.sorted = null;
  }
}

function bumpNested2(map: Map<string, Dist>, outer: string, inner: string, by: number): void {
  let d = map.get(outer);
  if (!d) {
    d = new Map();
    map.set(outer, d);
  }
  bump(d, inner, by);
}

function clamp(s: string): string {
  return s.length > MAX_SUGGESTION_LEN ? s.slice(0, MAX_SUGGESTION_LEN) : s;
}

export interface SerializedModel {
  u: [string, number][];
  b: [string, [string, number][]][];
  t: [string, [string, number][]][];
  total: number;
}
