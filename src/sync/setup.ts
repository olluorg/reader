/**
 * SDK wiring. Call initSdk() ONCE at the top of bootstrap(), BEFORE any
 * other module opens IndexedDB — the proxy must be in place before the
 * `reader` DB is opened so that `_outbox`, `_kv`, `_meta` are created
 * during onupgradeneeded.
 *
 * Configuration comes from Vite env vars:
 *   VITE_OLLU_SERVER          default server URL (overridable in settings)
 *   VITE_OLLU_GOOGLE_CLIENT_ID Google OAuth client ID for PKCE login
 */

import {
  AuthClient,
  GoogleAuthProvider,
  HLClock,
  ServerUrlConfig,
  SyncEngine,
  WebSocketTransport,
  type AuthProvider,
} from '@ollu/sdk-core';
import { installIdbProxy, type IdbProxy } from '@ollu/sdk-idb';
import { DB_NAME, openDb } from '../storage/db';
import { list } from '../storage/library';

const APP_ID = 'reader';
const HISTORY_LIMIT = 20;
const DEVICE_ID_KEY = 'reader.deviceId';
const SYNCED_STORES = ['history', 'saved', 'mine', 'media'] as const;

export interface SdkBundle {
  readonly proxy: IdbProxy;
  readonly clock: HLClock;
  readonly config: ServerUrlConfig;
  readonly auth: AuthClient;
  readonly transport: WebSocketTransport;
  readonly engine: SyncEngine;
  /** Start the sync engine if we already have a session. Idempotent. */
  startIfAuthed(): Promise<void>;
}

let bundle: SdkBundle | null = null;

export function getSdk(): SdkBundle | null {
  return bundle;
}

function getOrCreateDeviceId(): string {
  const existing = localStorage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;
  const id = crypto.randomUUID();
  localStorage.setItem(DEVICE_ID_KEY, id);
  return id;
}

/**
 * After applying incoming ops the local history table may exceed
 * HISTORY_LIMIT. Trim the oldest entries locally — wrapped in
 * withSuppressedCapture so we don't propagate the deletes as ops and
 * fight other devices that may keep their own top-20.
 */
async function trimHistoryAfterIncoming(proxy: IdbProxy): Promise<void> {
  const all = await list('history');
  if (all.length <= HISTORY_LIMIT) return;
  const excess = all.slice(HISTORY_LIMIT);
  await proxy.withSuppressedCapture(async () => {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('history', 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('history trim failed'));
      const store = tx.objectStore('history');
      for (const e of excess) store.delete(e.hash);
    });
  });
}

interface InitOptions {
  readonly defaultServerUrl: string;
  readonly googleClientId?: string;
  readonly extraProviders?: readonly AuthProvider[];
}

export async function initSdk(options: InitOptions): Promise<SdkBundle> {
  if (bundle) return bundle;

  const clock = new HLClock(getOrCreateDeviceId());

  // engine is created later but onLocalWrite needs a reference now — captured
  // by closure and read lazily on each call.
  let engineRef: SyncEngine | null = null;

  const proxy = installIdbProxy({
    dbName: DB_NAME,
    appId: APP_ID,
    syncedStores: SYNCED_STORES,
    clock,
    onLocalWrite: () => engineRef?.schedule(),
  });

  // Open the DB now so the proxy's upgrade hook runs and _outbox/_kv/_meta
  // are created. Without this, config.load() and auth.hydrate() below would
  // hang on the unresolved dbReady promise.
  await openDb();
  await proxy.ready();

  const config = new ServerUrlConfig({
    defaultServerUrl: options.defaultServerUrl,
    kv: proxy.kv,
  });
  await config.load();

  const providers: AuthProvider[] = [];
  if (options.googleClientId) {
    providers.push(
      new GoogleAuthProvider({
        clientId: options.googleClientId,
        redirectUri: location.origin + location.pathname,
      }),
    );
  }
  if (options.extraProviders) providers.push(...options.extraProviders);

  const auth = new AuthClient({
    serverUrl: () => config.get(),
    providers,
    kv: proxy.kv,
  });
  await auth.hydrate();

  const transport = new WebSocketTransport({
    serverUrl: () => config.get(),
    appId: APP_ID,
    sessionToken: () => auth.sessionToken(),
    onUnauthorized: async () => {
      // Best-effort refresh; if it fails, AuthClient clears the session and
      // the engine will see no token on its next request.
      await auth.ensureFresh();
    },
  });

  const engine = new SyncEngine({
    appId: APP_ID,
    clock,
    outbox: proxy.outbox,
    transport,
    kv: proxy.kv,
    onIncoming: async (ops) => {
      await proxy.applyIncoming(ops);
      await trimHistoryAfterIncoming(proxy);
      // Tell the rest of the app which stores got touched so it can repaint
      // (media references, library lists, etc.). Bubbles + composed so any
      // dialog/iframe listener picks it up.
      const stores = new Set(ops.map((o) => o.store));
      window.dispatchEvent(
        new CustomEvent('ollu-incoming', { detail: { stores: Array.from(stores) } }),
      );
    },
  });
  engineRef = engine;

  bundle = {
    proxy,
    clock,
    config,
    auth,
    transport,
    engine,
    startIfAuthed: async () => {
      if (auth.currentSession() && !engine.isRunning()) {
        await engine.start();
      }
    },
  };

  // If a session is already in KV (returning visitor), start the engine
  // immediately so the outbox flushes any writes made while offline.
  await bundle.startIfAuthed();

  return bundle;
}
