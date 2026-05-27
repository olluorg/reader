/**
 * SDK wiring for the sync plugin.
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
import { DB_NAME, openDb } from '../../storage/db';
import { list } from '../../storage/library';

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
  let engineRef: SyncEngine | null = null;

  const proxy = installIdbProxy({
    dbName: DB_NAME,
    appId: APP_ID,
    syncedStores: SYNCED_STORES,
    clock,
    onLocalWrite: () => engineRef?.schedule(),
  });

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

  await bundle.startIfAuthed();
  return bundle;
}
