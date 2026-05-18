import type { Mode } from '../types';

export type LibraryKind = 'history' | 'saved' | 'mine';

export interface LibraryEntry {
  hash: string;
  url: string;
  title: string;
  mode: Mode;
  encrypted: boolean;
  size: number;
  /** Last known window.scrollY for this document. */
  scrollY?: number;
  /**
   * Media IDs referenced by this doc. Used as the "keep set" for media GC:
   * a media row in IDB is safe to drop only when no library entry references
   * it. Undefined on old entries (recorded before the field existed) — the
   * sweeper treats those as opaque and keeps everything they might need.
   */
  mediaIds?: string[];
  addedAt: number;
  updatedAt: number;
}

const DB_NAME = 'reader-library';
const DB_VERSION = 1;
const STORES: LibraryKind[] = ['history', 'saved', 'mine'];

const HISTORY_LIMIT = 200;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const kind of STORES) {
        if (!db.objectStoreNames.contains(kind)) {
          const store = db.createObjectStore(kind, { keyPath: 'hash' });
          store.createIndex('updatedAt', 'updatedAt');
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Failed to open IndexedDB'));
  });
  return dbPromise;
}

function tx(db: IDBDatabase, kind: LibraryKind, mode: IDBTransactionMode): IDBObjectStore {
  return db.transaction(kind, mode).objectStore(kind);
}

function awaitTx<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function record(
  kind: LibraryKind,
  entry: Omit<LibraryEntry, 'addedAt' | 'updatedAt'>,
): Promise<void> {
  const db = await openDb();
  const store = tx(db, kind, 'readwrite');
  const existing = (await awaitTx(store.get(entry.hash))) as LibraryEntry | undefined;
  const now = Date.now();
  const full: LibraryEntry = {
    ...entry,
    // Carry over the previous scroll position if the caller didn't supply one.
    scrollY: entry.scrollY ?? existing?.scrollY,
    addedAt: existing?.addedAt ?? now,
    updatedAt: now,
  };
  await awaitTx(store.put(full));
  if (kind === 'history') await trimToLimit(kind, HISTORY_LIMIT);
}

/**
 * Write the latest scroll position into every store that contains this hash.
 * Does NOT touch `updatedAt`, so lists keep their existing order.
 */
export async function updatePosition(hash: string, scrollY: number): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(STORES, 'readwrite');
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    for (const kind of STORES) {
      const store = t.objectStore(kind);
      const getReq = store.get(hash);
      getReq.onsuccess = () => {
        const e = getReq.result as LibraryEntry | undefined;
        if (!e) return;
        e.scrollY = scrollY;
        store.put(e);
      };
    }
  });
}

/** Look up the last known scroll position for a hash, checking all stores. */
export async function getPosition(hash: string): Promise<number | undefined> {
  const db = await openDb();
  return new Promise((resolve) => {
    const t = db.transaction(STORES, 'readonly');
    let found: number | undefined;
    for (const kind of STORES) {
      const req = t.objectStore(kind).get(hash);
      req.onsuccess = () => {
        const e = req.result as LibraryEntry | undefined;
        if (e?.scrollY !== undefined && found === undefined) found = e.scrollY;
      };
    }
    t.oncomplete = () => resolve(found);
    t.onerror = () => resolve(undefined);
  });
}

export async function list(kind: LibraryKind): Promise<LibraryEntry[]> {
  const db = await openDb();
  const store = tx(db, kind, 'readonly');
  const all = (await awaitTx(store.getAll())) as LibraryEntry[];
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function remove(kind: LibraryKind, hash: string): Promise<void> {
  const db = await openDb();
  await awaitTx(tx(db, kind, 'readwrite').delete(hash));
}

export async function has(kind: LibraryKind, hash: string): Promise<boolean> {
  const db = await openDb();
  const key = await awaitTx(tx(db, kind, 'readonly').getKey(hash));
  return key !== undefined;
}

async function trimToLimit(kind: LibraryKind, limit: number): Promise<void> {
  const entries = await list(kind);
  if (entries.length <= limit) return;
  const db = await openDb();
  const store = tx(db, kind, 'readwrite');
  for (const e of entries.slice(limit)) store.delete(e.hash);
}

/**
 * Union of every `mediaIds` array across every entry in every library store.
 * Returns the set of media ids that something still references — anything not
 * in this set is safe to GC from the media IDB store.
 *
 * Entries whose `mediaIds` is `undefined` (old entries recorded before this
 * field existed) are *not* contributing here. The sweeper compensates by
 * skipping the entire GC when any such entry exists — we'd rather keep
 * orphaned media than nuke an image an old entry silently needed.
 */
export async function collectReferencedMediaIds(): Promise<{
  ids: Set<string>;
  hasOpaqueEntries: boolean;
}> {
  const ids = new Set<string>();
  let hasOpaqueEntries = false;
  for (const kind of STORES) {
    const entries = await list(kind);
    for (const e of entries) {
      if (!e.mediaIds) {
        // Encrypted-and-pre-mediaIds entries: we can't peek inside without
        // a password, so we assume they might reference anything.
        if (e.encrypted) hasOpaqueEntries = true;
        continue;
      }
      for (const id of e.mediaIds) ids.add(id);
    }
  }
  return { ids, hasOpaqueEntries };
}

export function deriveTitle(markdown: string, fallbackTitle?: string): string {
  if (fallbackTitle && fallbackTitle.trim()) return fallbackTitle.trim();
  const lines = markdown.split('\n');
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const heading = line.match(/^#{1,6}\s+(.+?)\s*#*\s*$/);
    if (heading) return heading[1].trim().slice(0, 120);
    return line.replace(/[#*_`>\[\]()!]/g, '').slice(0, 120) || 'Untitled';
  }
  return 'Untitled';
}
