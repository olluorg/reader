/**
 * Stateful hub for the voice plugin, shared by the ReaderPlugin shell
 * (`index.ts`) and the settings dialog (`dialog.ts`).
 *
 * Owns: device capability, the optional Whisper model (explicit opt-in
 * download, progress, ready/error state, silent re-load from cache on later
 * sessions), the push-to-talk gesture, the microphone, and the dictation state
 * machine — while the key is held it transcribes a sliding window every tick
 * and shows the interim text as a ghost preview; on release it runs a final
 * pass and commits the text into the document once. Audio never leaves the
 * device.
 */

import { showToast } from '../../ui/toast';
import { setDictating } from '../../editor/dictation';
import type { ReaderPluginContext } from '../api';
import { detectCapability, type Capability } from './capability';
import { Recognizer } from './recognizer';
import { AudioCapture } from './audio';
import { PushToTalk } from './ptt';
import { setPreview } from './preview';
import {
  isEnabled,
  loadBindings,
  loadDownloadedModel,
  loadSelectedModel,
  saveBindings,
  saveDownloadedModel,
  saveSelectedModel,
  type Binding,
  type VoiceLang,
} from './store';
import { modelById } from './models';
import { showOverlay, hideOverlay } from './overlay';
import { t } from './i18n';

const DTYPE = (import.meta.env['VITE_OLLU_VOICE_DTYPE'] as string | undefined) ?? 'q8';
// transformers.js stores fetched model files in this Cache Storage bucket.
const TRANSFORMERS_CACHE = 'transformers-cache';

// Re-transcribe the trailing window this often while the key is held, over a
// bounded window so cost stays linear rather than quadratic for long dictation.
const INTERIM_MS = 1000;
const WINDOW_SEC = 15;

export type ModelState = 'checking' | 'unsupported' | 'idle' | 'loading' | 'ready' | 'error';

export interface ModelStatus {
  state: ModelState;
  /** 0..1 while loading. */
  progress: number;
  downloaded: boolean;
  /** The currently selected model id. */
  modelId: string;
  sizeMB: number;
}

// ── state ────────────────────────────────────────────────────────────────
let ctx: ReaderPluginContext | null = null;
let capability: Capability | null = null;
let selectedModel = loadSelectedModel();
let downloadedModel = loadDownloadedModel();
let bindings = loadBindings();
let recognizer: Recognizer | null = null;
let modelState: ModelState = 'checking';
let modelProgress = 0;
let ptt: PushToTalk | null = null;

let capture: AudioCapture | null = null;
let interimTimer: number | null = null;
let inFlight = false;
let recording = false;
/** Language of the in-progress dictation, set from the binding that fired. */
let currentLang: VoiceLang = 'en';

const listeners = new Set<() => void>();

function notify(): void {
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      // a misbehaving listener shouldn't break the others
    }
  }
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// ── lifecycle ──────────────────────────────────────────────────────────────
export async function init(context: ReaderPluginContext): Promise<void> {
  ctx = context;

  capability = await detectCapability().catch(() => null);
  resolveModelState();

  ptt = new PushToTalk(bindings, {
    isEnabled: () => isEnabled() && modelState === 'ready',
    onStart: (lang) => void beginDictation(lang),
    onStop: () => void endDictation(),
  });
  ptt.install();
  notify();
}

export function getBindings(): Binding[] {
  return bindings.map((b) => ({ ...b }));
}

export function setBindings(next: Binding[]): void {
  bindings = next;
  saveBindings(next);
  ptt?.setBindings(next);
}

// ── model ────────────────────────────────────────────────────────────────
export function getModelStatus(): ModelStatus {
  return {
    state: modelState,
    progress: modelProgress,
    downloaded: downloadedModel === selectedModel,
    modelId: selectedModel,
    sizeMB: modelById(selectedModel).sizeMB,
  };
}

export function getSelectedModel(): string {
  return selectedModel;
}

export function modelCapable(): boolean {
  return !!capability?.capable;
}

/** Set state from capability + whether the selected model is already cached. */
function resolveModelState(): void {
  if (!capability?.capable) {
    modelState = 'unsupported';
  } else if (downloadedModel === selectedModel) {
    // Previously downloaded → bring it back from cache silently (no network).
    startRecognizer(true);
  } else {
    modelState = 'idle';
  }
}

/** Switch the active model. Disposes the old worker; auto-loads silently when
 *  the new pick was already downloaded, otherwise waits for an explicit
 *  download. No-op when the model is unchanged. */
export function setModel(id: string): void {
  if (id === selectedModel) return;
  selectedModel = id;
  saveSelectedModel(id);
  recognizer?.dispose();
  recognizer = null;
  modelProgress = 0;
  resolveModelState();
  notify();
}

function startRecognizer(silent: boolean): void {
  if (!capability?.capable || recognizer) return;
  const loading = selectedModel;
  modelState = 'loading';
  modelProgress = 0;
  notify();
  recognizer = new Recognizer(loading, DTYPE, {
    onProgress: (pct) => {
      modelProgress = pct;
      notify();
    },
    onStatus: (status) => {
      // Ignore a stale callback if the user switched models mid-load.
      if (selectedModel !== loading) return;
      if (status === 'ready') {
        modelState = 'ready';
        modelProgress = 1;
        downloadedModel = loading;
        saveDownloadedModel(loading);
        if (!silent) showToast(t('toast.ready'), { kind: 'success' });
      } else if (status === 'error') {
        modelState = 'error';
        if (!silent) showToast(t('toast.error'), { kind: 'warn' });
      }
      notify();
    },
  });
  void recognizer.start();
}

/** User clicked "download" in settings. */
export function downloadModel(): void {
  if (modelState === 'loading' || modelState === 'ready') return;
  startRecognizer(false);
}

/** Remove the selected model: stop the worker, evict just its cached files. */
export function removeModel(): void {
  recognizer?.dispose();
  recognizer = null;
  modelProgress = 0;
  if (downloadedModel === selectedModel) {
    saveDownloadedModel(null);
    downloadedModel = null;
  }
  void evictModelCache(selectedModel);
  modelState = capability?.capable ? 'idle' : 'unsupported';
  notify();
}

/** Delete only this model's files from the transformers cache, so removing one
 *  model never evicts another (predict's Tier 1 LM shares the same bucket). */
async function evictModelCache(modelId: string): Promise<void> {
  if (typeof caches === 'undefined') return;
  try {
    const cache = await caches.open(TRANSFORMERS_CACHE);
    const needle = modelId.split('/').pop() ?? modelId;
    const keys = await cache.keys();
    await Promise.all(
      keys.filter((req) => req.url.includes(needle)).map((req) => cache.delete(req)),
    );
  } catch {
    // ignore cache errors
  }
}

// ── dictation ──────────────────────────────────────────────────────────────
async function beginDictation(lang: VoiceLang): Promise<void> {
  if (recording || !recognizer?.isReady()) return;
  if (ctx?.getMode() === 'view') return;
  recording = true;
  currentLang = lang;
  const cap = new AudioCapture();
  try {
    await cap.start();
  } catch {
    recording = false;
    showToast(t('toast.micDenied'), { kind: 'warn' });
    return;
  }
  // The permission prompt can outlast the key press: if the key was released
  // while we waited, endDictation already ran (recording is false) — drop it.
  if (!recording) {
    cap.stop();
    return;
  }
  capture = cap;
  setDictating(true);
  // Show the mic marker at once and, via the same transaction, make predict
  // clear its ghost so the two never overlap.
  const view = ctx?.getEditor()?.getView();
  if (view) setPreview(view, true, '');
  showOverlay(t('overlay.listening'));
  interimTimer = window.setInterval(() => void interimTick(), INTERIM_MS);
}

async function interimTick(): Promise<void> {
  if (!recording || inFlight || !recognizer || !capture) return;
  const audio = capture.snapshot(WINDOW_SEC);
  if (audio.length < 16000 * 0.4) return; // need ~0.4s before a useful guess
  inFlight = true;
  const text = await recognizer.transcribe(audio, currentLang);
  inFlight = false;
  if (!recording) return; // released while transcribing
  const view = ctx?.getEditor()?.getView();
  if (view) setPreview(view, true, text.trim());
}

async function endDictation(): Promise<void> {
  if (!recording) return;
  recording = false;
  setDictating(false);
  if (interimTimer !== null) {
    clearInterval(interimTimer);
    interimTimer = null;
  }
  const cap = capture;
  capture = null;
  if (!cap) {
    hideOverlay();
    return;
  }

  showOverlay(t('overlay.transcribing'), true);
  const audio = cap.snapshot();
  cap.stop();

  const liveView = ctx?.getEditor()?.getView();
  let text = '';
  if (recognizer && audio.length >= 16000 * 0.3) {
    text = (
      await recognizer.transcribe(audio, currentLang, (partial) => {
        // Stream the decode into the preview so a long clip shows progress.
        if (liveView) setPreview(liveView, true, partial.trim());
      })
    ).trim();
  }

  const view = ctx?.getEditor()?.getView();
  if (view) setPreview(view, false, ''); // clear the mic + ghost before committing
  hideOverlay();

  if (text) commit(text);
}

function commit(text: string): void {
  const editor = ctx?.getEditor();
  const view = editor?.getView();
  if (view) {
    const sel = view.state.selection;
    const before = sel.$from.parent.textBetween(
      0,
      Math.max(0, sel.$from.parentOffset),
      '\n',
      ' ',
    );
    const lead = before === '' || /\s$/.test(before) ? '' : ' ';
    view.dispatch(view.state.tr.insertText(`${lead}${text} `, sel.from).scrollIntoView());
    view.focus();
    return;
  }

  // Raw-textarea fallback (oversized docs): splice at the caret.
  const ta = ctx?.getRawTextarea();
  if (ta) {
    const start = ta.selectionStart ?? ta.value.length;
    const end = ta.selectionEnd ?? start;
    const prev = ta.value[start - 1];
    const lead = !prev || /\s/.test(prev) ? '' : ' ';
    const insert = `${lead}${text} `;
    ta.setRangeText(insert, start, end, 'end');
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.focus();
  }
}
