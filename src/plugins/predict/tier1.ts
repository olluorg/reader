/**
 * Tier 1 controller — main-thread side of the on-device LM.
 *
 * Owns the worker lifecycle, loads the model lazily (the download is large and
 * only worth paying for once the user actually starts writing), and turns the
 * worker's raw generation into a short, ready-to-insert phrase. Requests are
 * fire-and-forget with a timeout; stale ones are dropped by id, so callers can
 * spam `suggest` on every pause without queuing work up.
 */

import type { FromWorker } from './tier1-protocol';

export type Tier1Status = 'loading' | 'ready' | 'error';

export interface Tier1Callbacks {
  onStatus?: (s: Tier1Status) => void;
  /** Download progress 0..1 while loading the model. */
  onProgress?: (pct: number) => void;
}

const REQUEST_TIMEOUT_MS = 6000;

/** Tidy the model's continuation into a single short phrase to show inline. */
function clean(raw: string): string {
  let s = raw.replace(/\r/g, '').split('\n')[0]; // first line only
  s = s.replace(/\s+/g, ' ').replace(/^\s+/, ''); // collapse + drop leading space
  if (s.length > 60) {
    // Cut back to the last word boundary so we never show a half-word.
    s = s.slice(0, 60);
    const lastSpace = s.lastIndexOf(' ');
    if (lastSpace > 20) s = s.slice(0, lastSpace);
  }
  return s.trimEnd();
}

export class Tier1Controller {
  private worker: Worker | null = null;
  private starting: Promise<boolean> | null = null;
  private ready = false;
  private failed = false;
  private seq = 0;
  private waiters = new Map<number, (text: string) => void>();

  constructor(
    private readonly model: string,
    private readonly dtype: string,
    private readonly maxNewTokens: number,
    private readonly cbs: Tier1Callbacks = {},
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
        this.worker = new Worker(new URL('./tier1.worker.ts', import.meta.url), {
          type: 'module',
        });
      } catch (err) {
        console.warn('[predict] Tier 1 worker spawn failed:', err);
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
          console.warn('[predict] Tier 1 model load failed:', msg.message);
          this.failed = true;
          this.cbs.onStatus?.('error');
          resolve(false);
          this.dispose();
        } else if (msg.type === 'result') {
          const w = this.waiters.get(msg.id);
          if (w) {
            this.waiters.delete(msg.id);
            w(msg.text);
          }
        }
      };
      this.worker.onerror = (e) => {
        console.warn('[predict] Tier 1 worker error:', e.message);
        this.failed = true;
        this.cbs.onStatus?.('error');
        resolve(false);
      };

      this.cbs.onStatus?.('loading');
      this.worker.postMessage({
        type: 'init',
        model: this.model,
        dtype: this.dtype,
        maxNewTokens: this.maxNewTokens,
      });
    });
    return this.starting;
  }

  /** Ask for a continuation of `context`. null when not ready or empty. */
  async suggest(context: string): Promise<string | null> {
    if (!this.ready || !this.worker) return null;
    const id = ++this.seq;
    const text = await new Promise<string>((resolve) => {
      const timer = setTimeout(() => {
        if (this.waiters.delete(id)) resolve('');
      }, REQUEST_TIMEOUT_MS);
      this.waiters.set(id, (t) => {
        clearTimeout(timer);
        resolve(t);
      });
      this.worker!.postMessage({ type: 'suggest', id, context });
    });
    return clean(text) || null;
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    this.ready = false;
    this.waiters.clear();
  }
}
