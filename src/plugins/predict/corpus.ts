/**
 * Seed corpus for Tier 0: a frequency-ranked vocabulary (most-frequent first)
 * plus a few hand-picked high-confidence bigrams.
 *
 * The word lists are bundled top-10k frequency lists (see words.{en,ru}.ts) so
 * prefix completion has broad coverage from a fresh install; the personalised
 * n-gram in IndexedDB then grows on top as the user writes. Bigrams seed a
 * handful of two-word continuations so phrase-chaining has something to start
 * from before any learning.
 */

import { EN_WORDS } from './words.en';
import { RU_WORDS } from './words.ru';

export interface SeedCorpus {
  readonly words: readonly string[];
  readonly bigrams: readonly (readonly [string, string])[];
}

const ru: SeedCorpus = {
  words: RU_WORDS,
  bigrams: [
    ['по', 'поводу'], ['потому', 'что'], ['для', 'того'], ['того', 'чтобы'],
    ['так', 'как'], ['как', 'будто'], ['в', 'том'], ['том', 'числе'],
    ['добрый', 'день'], ['большое', 'спасибо'], ['на', 'самом'],
    ['самом', 'деле'], ['то', 'есть'], ['как', 'правило'],
  ],
};

const en: SeedCorpus = {
  words: EN_WORDS,
  bigrams: [
    ['as', 'well'], ['well', 'as'], ['in', 'order'], ['order', 'to'],
    ['such', 'as'], ['for', 'example'], ['thank', 'you'], ['a', 'lot'],
    ['lot', 'of'], ['in', 'the'], ['of', 'the'], ['to', 'be'],
    ['make', 'sure'], ['by', 'the'], ['the', 'way'],
  ],
};

export const SEED: Record<'ru' | 'en', SeedCorpus> = { ru, en };
