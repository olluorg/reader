/**
 * Persistence for the learned prediction model.
 *
 * Kept in its own IndexedDB database (`reader-predict`) rather than the core
 * `reader` DB on purpose: the model is a local, device-specific learning
 * artifact — it must not ride along with the sync layer's IDB proxy, and it
 * shouldn't force a core DB_VERSION bump. One store, keyed by language.
 */

import type { PredictLang } from './lang';
import type { SerializedModel } from './engine';

const DB_NAME = 'reader-predict';
const DB_VERSION = 1;
const STORE = 'model';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'lang' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('predict DB open failed'));
  });
  return dbPromise;
}

function awaitReq<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

interface ModelRow {
  lang: PredictLang;
  model: SerializedModel;
}

export async function loadModel(lang: PredictLang): Promise<SerializedModel | null> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, 'readonly');
    const row = await awaitReq<ModelRow | undefined>(tx.objectStore(STORE).get(lang));
    return row?.model ?? null;
  } catch (err) {
    console.warn('[predict] loadModel failed:', err);
    return null;
  }
}

export async function saveModel(lang: PredictLang, model: SerializedModel): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, 'readwrite');
    await awaitReq(tx.objectStore(STORE).put({ lang, model } satisfies ModelRow));
  } catch (err) {
    console.warn('[predict] saveModel failed:', err);
  }
}

/** Wipe the learned model (both languages). Used by the "reset" menu action. */
export async function clearModels(): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, 'readwrite');
    await awaitReq(tx.objectStore(STORE).clear());
  } catch (err) {
    console.warn('[predict] clearModels failed:', err);
  }
}
