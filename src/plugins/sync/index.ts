import { buildUrl } from '../../share/codec';
import {
  deriveTitle,
  record as libraryRecord,
  remove as libraryRemove,
} from '../../storage/library';
import { setPosition } from '../../storage/positions';
import type { ReaderPlugin, ReaderPluginContext } from '../api';
import {
  getCurrentDocId,
  getDraftMineHash,
  maybeAdoptRemoteUpdate,
  resetDraft,
  resumeDraftFromHash,
  scheduleDraftSave,
  setCurrentDocId,
  setDraftMineHash,
  startFreshDraft,
} from './draft';
import { t } from './i18n';
import { initSdk } from './setup';
import { openSettingsDialog } from './settings-dialog';
// Backup is its own plugin now (src/plugins/backup/); the dialog is no
// longer part of sync.

let pluginCtx: ReaderPluginContext | null = null;

function onOlluIncoming(event: Event): void {
  if (!pluginCtx) return;
  const detail = (event as CustomEvent<{ stores: string[] }>).detail;
  const stores = new Set(detail?.stores ?? []);
  if (stores.has('media')) {
    void pluginCtx.paintMediaImages();
  }
  if (stores.has('mine')) {
    void maybeAdoptRemoteUpdate(pluginCtx);
  }
  pluginCtx.refreshToolbar();
}

export const syncPlugin: ReaderPlugin = {
  id: 'sync',
  label: t('label'),

  async onAppStart(ctx) {
    pluginCtx = ctx;
    window.addEventListener('ollu-incoming', onOlluIncoming);
    await initSdk({
      defaultServerUrl:
        (import.meta.env['VITE_OLLU_SERVER'] as string | undefined) ??
        'http://localhost:8080',
      googleClientId: import.meta.env['VITE_OLLU_GOOGLE_CLIENT_ID'] as
        | string
        | undefined,
    }).catch((err) => {
      console.warn('[sync] init failed, app continues without sync:', err);
    });
  },

  async onDocLoaded(_ctx, hash) {
    await resumeDraftFromHash(hash);
  },

  onNewDocument() {
    startFreshDraft();
  },

  onHashCleared() {
    resetDraft();
  },

  onDocEdited(ctx) {
    scheduleDraftSave(ctx);
  },

  onShareGenerated(ctx, gen) {
    const prevDraft = getDraftMineHash();
    setDraftMineHash(gen.hash);
    if (!getCurrentDocId()) setCurrentDocId(crypto.randomUUID());
    const docId = getCurrentDocId() ?? crypto.randomUUID();
    libraryRecord('mine', {
      hash: gen.hash,
      url: gen.url,
      title: deriveTitle(gen.doc.markdown, gen.doc.title),
      mode: gen.mode,
      encrypted: gen.encrypted,
      size: gen.size,
      docId,
      mediaIds: ctx.collectDocMediaIds(gen.doc),
    }).catch((err) => console.warn('mine save failed:', err));
    if (prevDraft && prevDraft !== gen.hash) {
      libraryRemove('mine', prevDraft).catch(() => {});
    }
    setPosition(gen.hash, Math.round(window.scrollY)).catch(() => {});
  },

  onSplitShareGenerated(ctx, gen) {
    const prevDraft = getDraftMineHash();
    const docId = getCurrentDocId() ?? crypto.randomUUID();
    setCurrentDocId(docId);
    const mediaIds = ctx.collectDocMediaIds(gen.doc);
    for (const p of gen.parts) {
      libraryRecord('mine', {
        hash: p.hash,
        url: buildUrl(p.hash),
        title: `${deriveTitle(gen.doc.markdown, gen.doc.title)} · ${p.index + 1}/${p.total}`,
        mode: gen.mode,
        encrypted: gen.encrypted,
        size: p.url.length,
        docId,
        mediaIds,
      }).catch((err) => console.warn('mine save failed:', err));
    }
    if (prevDraft) {
      libraryRemove('mine', prevDraft).catch(() => {});
    }
    setDraftMineHash(null);
  },

  menuItems() {
    return [{ label: t('menu.open'), action: openSettingsDialog }];
  },
};

export default syncPlugin;
