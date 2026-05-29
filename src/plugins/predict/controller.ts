/**
 * Stateful hub for the predict plugin, shared by the ReaderPlugin shell
 * (`index.ts`) and the settings dialog (`dialog.ts`).
 *
 * Holds the Tier 0 engine + learning, and manages the optional Tier 1 model:
 * capability, explicit download, progress, and ready/active state. Tier 1
 * never starts on its own — only when the user clicks "download" in settings,
 * or, on later sessions, auto-loads from the browser cache if they previously
 * downloaded it (no new network). Tier 1 is English-only; Russian (and any
 * non-English text) always uses Tier 0.
 */

import { showToast } from '../../ui/toast';
import { isDictating } from '../../editor/dictation';
import { PredictEngine } from './engine';
import type { GhostSources } from './ghost';
import { detectLang } from './lang';
import { splitSentences, stripMarkdown } from './tokenize';
import { loadModel, saveModel, clearModels } from './store';
import { detectCapability, type Capability } from './capability';
import { Tier1Controller } from './tier1';
import { t } from './i18n';

// ── config ─────────────────────────────────────────────────────────────────
const ENABLED_KEY = 'reader.predict.enabled';
const DOWNLOADED_KEY = 'reader.predict.en.downloaded';
const LEARN_DEBOUNCE_MS = 4000;
const SAVE_DEBOUNCE_MS = 8000;
// transformers.js stores fetched model files in this Cache Storage bucket.
const TRANSFORMERS_CACHE = 'transformers-cache';

// English-only Tier 1 model. distilgpt2 in int8 is ~80 MB — the smallest
// option that still gives coherent English phrases. Overridable at build time.
const TIER1_MODEL =
  (import.meta.env['VITE_OLLU_PREDICT_MODEL'] as string | undefined) ?? 'Xenova/distilgpt2';
const TIER1_DTYPE = (import.meta.env['VITE_OLLU_PREDICT_DTYPE'] as string | undefined) ?? 'q8';
const TIER1_MAX_TOKENS = 12;
export const TIER1_SIZE_MB = 80;
export const TIER1_LANG = 'en';

// Tier 1 is parked: distilgpt2 quality at the ≤80 MB budget is too low to be
// useful, and nothing better fits the budget yet. The worker/controller code
// stays intact; this flag just hides it from settings and the editor. Flip to
// true (and pick a better model) to bring it back.
const TIER1_ENABLED = false;

export type Tier1State =
  | 'disabled'
  | 'checking'
  | 'unsupported'
  | 'idle'
  | 'loading'
  | 'ready'
  | 'error';

export interface Tier1Status {
  state: Tier1State;
  /** 0..1 while loading. */
  progress: number;
  /** True when the model was downloaded before (lives in the browser cache). */
  downloaded: boolean;
  model: string;
  sizeMB: number;
}

// ── state ────────────────────────────────────────────────────────────────
let engine: PredictEngine | null = null;
let tier0Enabled = loadFlag(ENABLED_KEY);

let capability: Capability | null = null;
let tier1: Tier1Controller | null = null;
let tier1State: Tier1State = 'checking';
let tier1Progress = 0;

const listeners = new Set<() => void>();

let learnedSentences = new Set<string>();
let learnTimer: number | null = null;
let saveTimer: number | null = null;
let dirty = false;

function loadFlag(k: string): boolean {
  try {
    return localStorage.getItem(k) === '1';
  } catch {
    return false;
  }
}
function saveFlag(k: string, v: boolean): void {
  try {
    if (v) localStorage.setItem(k, '1');
    else localStorage.removeItem(k);
  } catch {
    // ignore storage errors
  }
}
function notify(): void {
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      // a misbehaving listener shouldn't break the others
    }
  }
}

// ── lifecycle ──────────────────────────────────────────────────────────────
export async function init(): Promise<void> {
  engine = new PredictEngine();
  const [ru, en] = await Promise.all([loadModel('ru'), loadModel('en')]);
  if (ru) engine.hydrate('ru', ru);
  if (en) engine.hydrate('en', en);

  if (!TIER1_ENABLED) {
    tier1State = 'disabled';
    notify();
    return;
  }

  capability = await detectCapability().catch(() => null);
  if (!capability?.capable) {
    tier1State = 'unsupported';
  } else if (loadFlag(DOWNLOADED_KEY)) {
    // Previously downloaded → bring it back from cache silently (no network).
    tier1State = 'idle';
    startTier1(true);
  } else {
    tier1State = 'idle';
  }
  notify();
}

// ── Tier 0 (n-gram) ──────────────────────────────────────────────────────
export function isTier0Enabled(): boolean {
  return tier0Enabled;
}
export function setTier0Enabled(v: boolean): void {
  tier0Enabled = v;
  saveFlag(ENABLED_KEY, v);
  notify();
}

function scheduleSave(): void {
  dirty = true;
  if (saveTimer !== null) clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    saveTimer = null;
    if (!engine || !dirty) return;
    dirty = false;
    void saveModel('ru', engine.serialize('ru'));
    void saveModel('en', engine.serialize('en'));
  }, SAVE_DEBOUNCE_MS);
}

export function onEdited(markdown: string): void {
  if (learnTimer !== null) clearTimeout(learnTimer);
  learnTimer = window.setTimeout(() => {
    learnTimer = null;
    if (!engine) return;
    let added = false;
    for (const s of splitSentences(stripMarkdown(markdown))) {
      if (learnedSentences.has(s)) continue;
      learnedSentences.add(s);
      engine.learn(s);
      added = true;
    }
    if (added) scheduleSave();
  }, LEARN_DEBOUNCE_MS);
}

export function resetLearned(): void {
  engine?.reset();
  learnedSentences = new Set();
  dirty = false;
  void clearModels();
}

// ── Tier 1 (LM) ────────────────────────────────────────────────────────────
export function getTier1Status(): Tier1Status {
  return {
    state: tier1State,
    progress: tier1Progress,
    downloaded: loadFlag(DOWNLOADED_KEY),
    model: TIER1_MODEL,
    sizeMB: TIER1_SIZE_MB,
  };
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function startTier1(silent: boolean): void {
  if (!capability?.capable || tier1) return;
  tier1State = 'loading';
  tier1Progress = 0;
  notify();
  tier1 = new Tier1Controller(TIER1_MODEL, TIER1_DTYPE, TIER1_MAX_TOKENS, {
    onProgress: (pct) => {
      tier1Progress = pct;
      notify();
    },
    onStatus: (status) => {
      if (status === 'ready') {
        tier1State = 'ready';
        tier1Progress = 1;
        saveFlag(DOWNLOADED_KEY, true);
        if (!silent) showToast(t('toast.tier1.ready'), { kind: 'success' });
      } else if (status === 'error') {
        tier1State = 'error';
        if (!silent) showToast(t('toast.tier1.error'), { kind: 'warn' });
      }
      notify();
    },
  });
  void tier1.start();
}

/** User clicked "download" in settings. */
export function downloadTier1(): void {
  if (tier1State === 'loading' || tier1State === 'ready') return;
  startTier1(false);
}

/** Remove the model: stop the worker, clear the cache + the downloaded flag. */
export function removeTier1(): void {
  tier1?.dispose();
  tier1 = null;
  tier1Progress = 0;
  tier1State = capability?.capable ? 'idle' : 'unsupported';
  saveFlag(DOWNLOADED_KEY, false);
  if (typeof caches !== 'undefined') {
    void caches.delete(TRANSFORMERS_CACHE).catch(() => {});
  }
  notify();
}

// ── editor wiring ──────────────────────────────────────────────────────────
export function ghostSources(): GhostSources | null {
  if (!engine) return null;
  return {
    engine,
    // Suppress all ghost-text while voice dictation is active so the predict
    // ghost and the dictation preview never stack at the caret.
    isEnabled: () => tier0Enabled && !isDictating(),
    // Omitted entirely while Tier 1 is parked — the editor never schedules it.
    tier1: TIER1_ENABLED
      ? {
          isReady: () => tier1State === 'ready',
          suggest: (context) => {
            // English-only; everything else stays on Tier 0.
            if (tier1State !== 'ready' || !tier1) return Promise.resolve(null);
            if (detectLang(context) !== TIER1_LANG) return Promise.resolve(null);
            return tier1.suggest(context);
          },
        }
      : undefined,
  };
}

export function tier1Capable(): boolean {
  return !!capability?.capable;
}
