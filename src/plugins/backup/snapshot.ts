/**
 * Local-only snapshot format for reader's IndexedDB.
 *
 * Independent of the sync SDK — the format is plain JSON so a backup
 * file can be opened in any text editor for inspection. Captures all
 * three library stores, the media cache, and the local scroll-position
 * map. Sync-private stores (`_outbox`, `_kv`, `_meta`) are NOT included:
 * they're either ephemeral (outbox) or stamped by the SDK on the next
 * sync (meta/kv).
 */

import { openDb, LIBRARY_STORES, MEDIA_STORE, awaitReq } from '../../storage/db';
import type { LibraryEntry } from '../../storage/library';
import type { MediaEntry } from '../../storage/media';

export const SNAPSHOT_FORMAT_VERSION = 1;

export interface ReaderSnapshot {
  readonly format: typeof SNAPSHOT_FORMAT_VERSION;
  readonly app: 'reader';
  readonly createdAt: number;
  readonly history: readonly LibraryEntry[];
  readonly saved: readonly LibraryEntry[];
  readonly mine: readonly LibraryEntry[];
  readonly media: readonly MediaEntry[];
  readonly positions: Record<string, number>;
}

const POSITIONS_KEY = 'reader-positions';

async function readStore<T>(storeName: string): Promise<T[]> {
  const db = await openDb();
  const tx = db.transaction(storeName, 'readonly');
  return (await awaitReq(tx.objectStore(storeName).getAll())) as T[];
}

async function clearStore(storeName: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(storeName).clear();
  });
}

async function writeAll<T extends object>(
  storeName: string,
  rows: readonly T[],
): Promise<void> {
  if (rows.length === 0) return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    const store = tx.objectStore(storeName);
    for (const row of rows) store.put(row);
  });
}

export async function buildSnapshot(): Promise<ReaderSnapshot> {
  const [history, saved, mine, media] = await Promise.all([
    readStore<LibraryEntry>('history'),
    readStore<LibraryEntry>('saved'),
    readStore<LibraryEntry>('mine'),
    readStore<MediaEntry>(MEDIA_STORE),
  ]);
  let positions: Record<string, number> = {};
  try {
    const raw = localStorage.getItem(POSITIONS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        positions = parsed as Record<string, number>;
      }
    }
  } catch {
    // ignore — positions are non-critical
  }
  return {
    format: SNAPSHOT_FORMAT_VERSION,
    app: 'reader',
    createdAt: Date.now(),
    history,
    saved,
    mine,
    media,
    positions,
  };
}

export interface RestoreOptions {
  /** "replace" wipes existing stores first; "merge" keeps existing entries
   * and overwrites matching keys (default). */
  readonly mode?: 'merge' | 'replace';
}

export async function applySnapshot(
  snapshot: ReaderSnapshot,
  options: RestoreOptions = {},
): Promise<void> {
  const mode = options.mode ?? 'merge';
  if (snapshot.format !== SNAPSHOT_FORMAT_VERSION) {
    throw new Error(`unsupported snapshot format: ${snapshot.format}`);
  }
  if (snapshot.app !== 'reader') {
    throw new Error(`snapshot is for "${snapshot.app}", not reader`);
  }
  if (mode === 'replace') {
    await Promise.all([
      ...LIBRARY_STORES.map((s) => clearStore(s)),
      clearStore(MEDIA_STORE),
    ]);
  }
  await Promise.all([
    writeAll('history', snapshot.history),
    writeAll('saved', snapshot.saved),
    writeAll('mine', snapshot.mine),
    writeAll(MEDIA_STORE, snapshot.media),
  ]);
  if (snapshot.positions && typeof snapshot.positions === 'object') {
    try {
      const existing = mode === 'replace'
        ? {}
        : (() => {
            try {
              const raw = localStorage.getItem(POSITIONS_KEY);
              return raw ? (JSON.parse(raw) as Record<string, number>) : {};
            } catch {
              return {};
            }
          })();
      const merged = { ...existing, ...snapshot.positions };
      localStorage.setItem(POSITIONS_KEY, JSON.stringify(merged));
    } catch {
      // ignore quota / parse errors — positions are non-critical
    }
  }
}

export function defaultBackupName(at: number = Date.now()): string {
  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
  return `reader-backup-${stamp}.json`;
}

export function downloadBlob(name: string, data: string | Blob): void {
  const blob =
    data instanceof Blob ? data : new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function pickFileText(accept: string = '.json,application/json'): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    input.addEventListener(
      'change',
      async () => {
        const file = input.files?.[0];
        document.body.removeChild(input);
        if (!file) {
          reject(new Error('no file selected'));
          return;
        }
        try {
          resolve(await file.text());
        } catch (err) {
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      },
      { once: true },
    );
    input.addEventListener(
      'cancel',
      () => {
        if (document.body.contains(input)) document.body.removeChild(input);
        reject(new Error('cancelled'));
      },
      { once: true },
    );
    document.body.appendChild(input);
    input.click();
  });
}
