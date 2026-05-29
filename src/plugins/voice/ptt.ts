/**
 * Push-to-talk: press and hold a bound key to dictate in that key's language.
 *
 * Each binding maps a key to a dictation language, so a bilingual user holds
 * one key for Russian and another for English without touching settings. A
 * short hold delay keeps a trigger usable for its normal job: a quick Ctrl+C
 * taps and releases under the delay, so dictation never starts; and any *other*
 * key going down during the wait is taken as a modifier shortcut and cancels.
 *
 * Modifier triggers (Ctrl/Alt/Shift/Meta) match either side and insert no
 * character. A printable trigger types its character on the initiating press
 * (unavoidable with a plain hold); once recording we swallow auto-repeat.
 */

import type { Binding, VoiceLang } from './store';

export interface PushToTalkCallbacks {
  onStart: (lang: VoiceLang) => void;
  onStop: () => void;
  isEnabled: () => boolean;
}

const HOLD_DELAY_MS = 280;

function matches(e: KeyboardEvent, key: string): boolean {
  if (key.startsWith('Control')) return e.key === 'Control';
  if (key.startsWith('Alt')) return e.key === 'Alt';
  if (key.startsWith('Shift')) return e.key === 'Shift';
  if (key.startsWith('Meta')) return e.key === 'Meta';
  return e.code === key;
}

function isPrintable(key: string): boolean {
  return !/^(Control|Alt|Shift|Meta)/.test(key);
}

export class PushToTalk {
  private bindings: Binding[];
  private holdTimer: number | null = null;
  /** The binding currently pending (hold timer) or active (recording). */
  private engaged: Binding | null = null;
  private active = false;
  private readonly onKeyDown: (e: KeyboardEvent) => void;
  private readonly onKeyUp: (e: KeyboardEvent) => void;

  constructor(bindings: Binding[], private readonly cbs: PushToTalkCallbacks) {
    this.bindings = bindings;
    this.onKeyDown = (e) => this.handleDown(e);
    this.onKeyUp = (e) => this.handleUp(e);
  }

  install(): void {
    window.addEventListener('keydown', this.onKeyDown, true);
    window.addEventListener('keyup', this.onKeyUp, true);
  }

  uninstall(): void {
    window.removeEventListener('keydown', this.onKeyDown, true);
    window.removeEventListener('keyup', this.onKeyUp, true);
    this.cancelHold();
    if (this.active) this.stop();
  }

  setBindings(bindings: Binding[]): void {
    this.bindings = bindings;
  }

  private find(e: KeyboardEvent): Binding | null {
    return this.bindings.find((b) => b.key && matches(e, b.key)) ?? null;
  }

  private cancelHold(): void {
    if (this.holdTimer !== null) {
      clearTimeout(this.holdTimer);
      this.holdTimer = null;
    }
    if (!this.active) this.engaged = null;
  }

  private stop(): void {
    this.active = false;
    this.engaged = null;
    this.cbs.onStop();
  }

  private handleDown(e: KeyboardEvent): void {
    const binding = this.find(e);
    if (!binding) {
      // A non-trigger key during the wait → shortcut combo, not a hold.
      if (this.holdTimer !== null) this.cancelHold();
      return;
    }
    if (!this.cbs.isEnabled()) return;

    // Swallow auto-repeat of a printable trigger while recording so it doesn't
    // spray characters into the editor.
    if (this.active) {
      if (this.engaged && isPrintable(this.engaged.key)) e.preventDefault();
      return;
    }
    if (this.holdTimer !== null || e.repeat) return;

    this.engaged = binding;
    this.holdTimer = window.setTimeout(() => {
      this.holdTimer = null;
      this.active = true;
      this.cbs.onStart(binding.lang);
    }, HOLD_DELAY_MS);
  }

  private handleUp(e: KeyboardEvent): void {
    if (!this.engaged || !matches(e, this.engaged.key)) return;

    if (this.active) {
      if (isPrintable(this.engaged.key)) e.preventDefault();
      this.stop();
      return;
    }
    // Released before the delay elapsed — a quick tap, not a hold.
    this.cancelHold();
  }
}
