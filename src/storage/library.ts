import type { Mode } from '../types';
import { LIBRARY_STORES, awaitReq, openDb } from './db';

export type LibraryKind = 'history' | 'saved' | 'mine';

export interface LibraryEntry {
  hash: string;
  url: string;
  title: string;
  mode: Mode;
  encrypted: boolean;
  size: number;
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

const HISTORY_LIMIT = 200;

function tx(db: IDBDatabase, kind: LibraryKind, mode: IDBTransactionMode): IDBObjectStore {
  return db.transaction(kind, mode).objectStore(kind);
}

export async function record(
  kind: LibraryKind,
  entry: Omit<LibraryEntry, 'addedAt' | 'updatedAt'>,
): Promise<void> {
  const db = await openDb();
  const store = tx(db, kind, 'readwrite');
  const existing = (await awaitReq(store.get(entry.hash))) as LibraryEntry | undefined;
  const now = Date.now();
  const full: LibraryEntry = {
    ...entry,
    addedAt: existing?.addedAt ?? now,
    updatedAt: now,
  };
  await awaitReq(store.put(full));
  if (kind === 'history') await trimToLimit(kind, HISTORY_LIMIT);
}

export async function list(kind: LibraryKind): Promise<LibraryEntry[]> {
  const db = await openDb();
  const store = tx(db, kind, 'readonly');
  const all = (await awaitReq(store.getAll())) as LibraryEntry[];
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function remove(kind: LibraryKind, hash: string): Promise<void> {
  const db = await openDb();
  await awaitReq(tx(db, kind, 'readwrite').delete(hash));
}

export async function has(kind: LibraryKind, hash: string): Promise<boolean> {
  const db = await openDb();
  const key = await awaitReq(tx(db, kind, 'readonly').getKey(hash));
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
  for (const kind of LIBRARY_STORES) {
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
