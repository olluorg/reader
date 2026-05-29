#!/usr/bin/env node
/**
 * Regenerate the Tier 0 seed vocabularies in src/plugins/predict/words.*.ts.
 *
 * Pulls the top-frequency word lists (OpenSubtitles 2018) from
 * hermitdave/FrequencyWords, filters each to clean, script-appropriate word
 * tokens (most-frequent first, deduped), and writes them as compact string
 * modules. Run from the repo root:  node scripts/gen-words.mjs
 */

import { writeFileSync, statSync } from 'node:fs';

const N = 10000;
const SRC = 'https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018';
const LANGS = [
  { lang: 'en', name: 'EN_WORDS', re: /^[a-z][a-z'’-]*$/ },
  { lang: 'ru', name: 'RU_WORDS', re: /^[а-яё][а-яё-]*$/ },
];

function clean(text, re) {
  const out = [];
  const seen = new Set();
  for (const line of text.split('\n')) {
    const raw = (line.split(' ')[0] || '').toLowerCase().trim();
    if (!raw || raw.length > 24) continue;
    if (!re.test(raw)) continue;
    const w = raw.replace(/^['’-]+|['’-]+$/g, '');
    if (!w || seen.has(w)) continue;
    seen.add(w);
    out.push(w);
    if (out.length >= N) break;
  }
  return out;
}

const header = (name, arr) =>
  `// Auto-generated frequency word list (top ${arr.length}), most-frequent first.\n` +
  `// Source: hermitdave/FrequencyWords (OpenSubtitles 2018, MIT). Seed vocabulary\n` +
  `// for Tier 0 prefix completion. Regenerate via scripts/gen-words.mjs — do not hand-edit.\n` +
  `export const ${name}: string[] = ${JSON.stringify(arr.join(' '))}.split(' ');\n`;

for (const { lang, name, re } of LANGS) {
  const text = await fetch(`${SRC}/${lang}/${lang}_50k.txt`).then((r) => {
    if (!r.ok) throw new Error(`${lang}: HTTP ${r.status}`);
    return r.text();
  });
  const words = clean(text, re);
  const path = `src/plugins/predict/words.${lang}.ts`;
  writeFileSync(path, header(name, words));
  console.log(`${path}: ${words.length} words, ${(statSync(path).size / 1024).toFixed(0)}KB`);
}
