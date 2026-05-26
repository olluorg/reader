/**
 * IndexedDB store for imported images. Keyed by perceptual-hash id (hex
 * dHash) so duplicate imports of the same picture collapse into one row,
 * and so file-imports on the recipient side can be matched back to refs
 * even after recompression (see ../share/dhash.ts).
 *
 * Bytes are stored as base64 — same string we put on the wire when an image
 * travels as its own share URL — so reads avoid binary↔text conversion.
 */

import { MEDIA_STORE, awaitReq, openDb } from './db';

export interface MediaEntry {
  id: string;
  mime: string;
  /** Raw image bytes, base64-encoded (no data:URL prefix). */
  base64: string;
  /** Original filename, if known. */
  name?: string;
  /** Bytes (decoded). */
  size: number;
  /** Natural pixel dimensions, if known. */
  width?: number;
  height?: number;
  addedAt: number;
}

export async function putMedia(entry: Omit<MediaEntry, 'addedAt'>): Promise<void> {
  const db = await openDb();
  const store = db.transaction(MEDIA_STORE, 'readwrite').objectStore(MEDIA_STORE);
  const existing = (await awaitReq(store.get(entry.id))) as MediaEntry | undefined;
  const now = Date.now();
  const full: MediaEntry = {
    ...entry,
    addedAt: existing?.addedAt ?? now,
  };
  await awaitReq(store.put(full));
}

export async function getMedia(id: string): Promise<MediaEntry | undefined> {
  const db = await openDb();
  const store = db.transaction(MEDIA_STORE, 'readonly').objectStore(MEDIA_STORE);
  return (await awaitReq(store.get(id))) as MediaEntry | undefined;
}

export async function hasMedia(id: string): Promise<boolean> {
  const db = await openDb();
  const store = db.transaction(MEDIA_STORE, 'readonly').objectStore(MEDIA_STORE);
  const k = await awaitReq(store.getKey(id));
  return k !== undefined;
}

export async function listMedia(): Promise<MediaEntry[]> {
  const db = await openDb();
  const store = db.transaction(MEDIA_STORE, 'readonly').objectStore(MEDIA_STORE);
  const all = (await awaitReq(store.getAll())) as MediaEntry[];
  return all.sort((a, b) => b.addedAt - a.addedAt);
}

export async function listMediaIds(): Promise<string[]> {
  const db = await openDb();
  const store = db.transaction(MEDIA_STORE, 'readonly').objectStore(MEDIA_STORE);
  const keys = (await awaitReq(store.getAllKeys())) as IDBValidKey[];
  return keys.map(String);
}

/**
 * Drop every media row whose id isn't in `keepIds`. Returns the number of
 * rows removed. Caller is responsible for assembling `keepIds` — typically
 * the union of (a) every library entry's mediaIds and (b) any actively-open
 * doc's media ids that haven't been persisted to a library entry yet.
 */
export async function sweepOrphanedMedia(keepIds: Set<string>): Promise<number> {
  const db = await openDb();
  const store = db.transaction(MEDIA_STORE, 'readwrite').objectStore(MEDIA_STORE);
  const keys = (await awaitReq(store.getAllKeys())) as IDBValidKey[];
  let removed = 0;
  for (const k of keys) {
    if (!keepIds.has(String(k))) {
      store.delete(k);
      removed++;
    }
  }
  return removed;
}

export async function removeMedia(id: string): Promise<void> {
  const db = await openDb();
  const store = db.transaction(MEDIA_STORE, 'readwrite').objectStore(MEDIA_STORE);
  await awaitReq(store.delete(id));
}

/**
 * Build a `data:<mime>;base64,<…>` URL suitable for an `<img src>` from a
 * stored entry. The IDB rows hold base64url bytes (URL-safe alphabet, no
 * padding) — that's what fromBase64Url/toBase64Url speak — but the `data:`
 * URI scheme only accepts the standard alphabet, so we map back here.
 */
export function mediaToDataUrl(entry: MediaEntry): string {
  return `data:${entry.mime};base64,${base64UrlToStandard(entry.base64)}`;
}

/** Convert URL-safe base64 (no padding) to standard base64 with padding. */
export function base64UrlToStandard(b64url: string): string {
  const std = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const pad = (4 - (std.length % 4)) % 4;
  return std + '='.repeat(pad);
}
