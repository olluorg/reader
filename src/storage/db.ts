/**
 * Shared IndexedDB connection for the whole app.
 *
 * Historically the project had two separate databases — `reader-library`
 * (with history/saved/mine stores) and `reader-media` (with media bytes).
 * They've been merged into a single `reader` database to (a) keep all the
 * app's persistence in one place and (b) let the sync SDK intercept it
 * through a single proxy install.
 *
 * Object stores:
 *   history  keyPath 'hash'  + index 'updatedAt'   — recently-opened docs
 *   saved    keyPath 'hash'  + index 'updatedAt'   — bookmarked docs
 *   mine     keyPath 'hash'  + index 'updatedAt'   — docs you've shared
 *   media    keyPath 'id'                          — imported image bytes
 */

export const DB_NAME = 'reader';
export const DB_VERSION = 1;

export type LibraryStoreName = 'history' | 'saved' | 'mine';
export const LIBRARY_STORES: LibraryStoreName[] = ['history', 'saved', 'mine'];
export const MEDIA_STORE = 'media';

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const kind of LIBRARY_STORES) {
        if (!db.objectStoreNames.contains(kind)) {
          const store = db.createObjectStore(kind, { keyPath: 'hash' });
          store.createIndex('updatedAt', 'updatedAt');
        }
      }
      if (!db.objectStoreNames.contains(MEDIA_STORE)) {
        db.createObjectStore(MEDIA_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Failed to open IndexedDB'));
  });
  return dbPromise;
}

export function awaitReq<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
