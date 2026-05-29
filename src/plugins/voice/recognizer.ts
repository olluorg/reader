/**
 * Recognizer — main-thread side of the on-device Whisper worker.
 *
 * Owns the worker lifecycle and loads the model lazily (the download is large
 * and only worth paying for when the user opts in). Transcription requests are
 * fire-and-forget with a timeout; stale ones are dropped by id, so the live
 * interim loop can fire a new window on every tick without queuing work up —
 * only the latest window's result matters.
 */

import type { FromWorker } from './protocol';

export type RecognizerStatus = 'loading' | 'ready' | 'error';

export interface RecognizerCallbacks {
  onStatus?: (s: RecognizerStatus) => void;
  /** Download progress 0..1 while loading the model. */
  onProgress?: (pct: number) => void;
}

// Drops a request only after this long with *no* activity. Streamed partials
// rearm it, so a long final decode never times out while tokens are flowing.
const REQUEST_TIMEOUT_MS = 20000;

interface Waiter {
  resolve: (text: string) => void;
  onPartial?: (text: string) => void;
  keepAlive: () => void;
}

export class Recognizer {
  private worker: Worker | null = null;
  private starting: Promise<boolean> | null = null;
  private ready = false;
  private failed = false;
  private seq = 0;
  private waiters = new Map<number, Waiter>();

  constructor(
    private readonly model: string,
    private readonly dtype: string,
    private readonly cbs: RecognizerCallbacks = {},
  ) {}

  isReady(): boolean {
    return this.ready;
  }
  hasFailed(): boolean {
    return this.failed;
  }

  /** Spawn the worker and load the model (idempotent). Resolves to success. */
  start(): Promise<boolean> {
    if (this.ready) return Promise.resolve(true);
    if (this.failed) return Promise.resolve(false);
    if (this.starting) return this.starting;

    this.starting = new Promise<boolean>((resolve) => {
      try {
        this.worker = new Worker(new URL('./whisper.worker.ts', import.meta.url), {
          type: 'module',
        });
      } catch (err) {
        console.warn('[voice] worker spawn failed:', err);
        this.failed = true;
        resolve(false);
        return;
      }

      this.worker.onmessage = (e: MessageEvent<FromWorker>) => {
        const msg = e.data;
        if (msg.type === 'progress') {
          this.cbs.onProgress?.(msg.pct);
        } else if (msg.type === 'ready') {
          this.ready = true;
          this.cbs.onStatus?.('ready');
          resolve(true);
        } else if (msg.type === 'error') {
          console.warn('[voice] model load failed:', msg.message);
          this.failed = true;
          this.cbs.onStatus?.('error');
          resolve(false);
          this.dispose();
        } else if (msg.type === 'partial') {
          const w = this.waiters.get(msg.id);
          if (w) {
            w.keepAlive();
            w.onPartial?.(msg.text);
          }
        } else if (msg.type === 'result') {
          const w = this.waiters.get(msg.id);
          if (w) {
            this.waiters.delete(msg.id);
            w.resolve(msg.text);
          }
        }
      };
      this.worker.onerror = (e) => {
        console.warn('[voice] worker error:', e.message);
        this.failed = true;
        this.cbs.onStatus?.('error');
        resolve(false);
      };

      this.cbs.onStatus?.('loading');
      this.worker.postMessage({ type: 'init', model: this.model, dtype: this.dtype });
    });
    return this.starting;
  }

  /**
   * Transcribe a 16 kHz mono window. Empty string when not ready / on timeout.
   * Pass `onPartial` to stream the running transcript as tokens decode (used
   * for the final pass so a long clip shows progress instead of hanging).
   */
  async transcribe(
    audio: Float32Array,
    language: string | null,
    onPartial?: (text: string) => void,
  ): Promise<string> {
    if (!this.ready || !this.worker) return '';
    const id = ++this.seq;
    // Copy into a fresh buffer we can transfer without detaching the caller's.
    const buf = audio.slice();
    const text = await new Promise<string>((resolve) => {
      let timer = 0;
      const keepAlive = () => {
        clearTimeout(timer);
        timer = window.setTimeout(() => {
          if (this.waiters.delete(id)) resolve('');
        }, REQUEST_TIMEOUT_MS);
      };
      keepAlive();
      this.waiters.set(id, {
        resolve: (t) => {
          clearTimeout(timer);
          resolve(t);
        },
        onPartial,
        keepAlive,
      });
      this.worker!.postMessage(
        { type: 'transcribe', id, audio: buf, language, stream: !!onPartial },
        [buf.buffer],
      );
    });
    return text;
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    this.ready = false;
    this.waiters.clear();
  }
}
