/**
 * Settings persistence for the voice plugin (localStorage, this browser only).
 *
 * Holds the on/off flag, the "model was downloaded" model id (so later sessions
 * can silently re-load it from the browser cache with no new network), and the
 * push-to-talk bindings (each key dictates in a fixed language). The model
 * weights themselves are not stored here — transformers.js caches them.
 */

import { DEFAULT_MODEL_ID } from './models';

export type VoiceLang = 'en' | 'ru';

/** A push-to-talk binding: hold `key` (an `event.code`) to dictate in `lang`. */
export interface Binding {
  key: string;
  lang: VoiceLang;
}

const ENABLED_KEY = 'reader.voice.enabled';
const MODEL_KEY = 'reader.voice.model';
const DOWNLOADED_MODEL_KEY = 'reader.voice.downloadedModel';
const BINDINGS_KEY = 'reader.voice.bindings';

// Default triggers: modifiers insert no character and a quick tap (e.g. Ctrl+C)
// never starts dictation, so press-and-hold stays out of the way of typing and
// shortcuts. Two languages out of the box — hold Ctrl for Russian, Alt for
// English — so a bilingual user never has to open settings to switch.
const DEFAULT_BINDINGS: readonly Binding[] = [
  { key: 'ControlLeft', lang: 'ru' },
  { key: 'AltLeft', lang: 'en' },
];

export function isEnabled(): boolean {
  // On by default once the plugin is built in; the model download is still a
  // separate, explicit opt-in, so nothing happens until that's done anyway.
  try {
    const v = localStorage.getItem(ENABLED_KEY);
    return v === null ? true : v === '1';
  } catch {
    return true;
  }
}
export function setEnabled(v: boolean): void {
  try {
    localStorage.setItem(ENABLED_KEY, v ? '1' : '0');
  } catch {
    // ignore
  }
}

/** The model the user picked (defaults to the build-time default). */
export function loadSelectedModel(): string {
  try {
    return localStorage.getItem(MODEL_KEY) || DEFAULT_MODEL_ID;
  } catch {
    return DEFAULT_MODEL_ID;
  }
}
export function saveSelectedModel(id: string): void {
  try {
    localStorage.setItem(MODEL_KEY, id);
  } catch {
    // ignore
  }
}

/** Which model id is downloaded & cached, or null when none is. */
export function loadDownloadedModel(): string | null {
  try {
    return localStorage.getItem(DOWNLOADED_MODEL_KEY) || null;
  } catch {
    return null;
  }
}
export function saveDownloadedModel(id: string | null): void {
  try {
    if (id) localStorage.setItem(DOWNLOADED_MODEL_KEY, id);
    else localStorage.removeItem(DOWNLOADED_MODEL_KEY);
  } catch {
    // ignore
  }
}

export function loadBindings(): Binding[] {
  try {
    const raw = localStorage.getItem(BINDINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const valid = parsed.filter(
          (b): b is Binding =>
            b && typeof b.key === 'string' && (b.lang === 'en' || b.lang === 'ru'),
        );
        return valid;
      }
    }
  } catch {
    // ignore malformed / disabled storage
  }
  return DEFAULT_BINDINGS.map((b) => ({ ...b }));
}
export function saveBindings(bindings: Binding[]): void {
  try {
    localStorage.setItem(BINDINGS_KEY, JSON.stringify(bindings));
  } catch {
    // ignore
  }
}
