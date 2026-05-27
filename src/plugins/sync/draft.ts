/**
 * Draft auto-save and live-adopt logic.
 *
 * Maintains plugin-internal state about which `mine` row represents the
 * doc the user is currently editing and ensures incoming remote edits
 * for the same docId replace the open editor in place.
 */

import { buildUrl } from '../../share/codec';
import {
  deriveTitle,
  list as libraryList,
  remove as libraryRemove,
  record as libraryRecord,
  get as libraryGet,
} from '../../storage/library';
import type { ReaderPluginContext } from '../api';

export const DRAFT_SAVE_DEBOUNCE_MS = 500;

let draftSaveTimer: number | null = null;
let draftMineHash: string | null = null;
let currentDocId: string | null = null;
let adopting = false;

export function getDraftMineHash(): string | null {
  return draftMineHash;
}

export function setDraftMineHash(h: string | null): void {
  draftMineHash = h;
}

export function getCurrentDocId(): string | null {
  return currentDocId;
}

export function setCurrentDocId(id: string | null): void {
  currentDocId = id;
}

export function resetDraft(): void {
  if (draftSaveTimer !== null) {
    clearTimeout(draftSaveTimer);
    draftSaveTimer = null;
  }
  draftMineHash = null;
  currentDocId = null;
}

export function startFreshDraft(): void {
  resetDraft();
  currentDocId = crypto.randomUUID();
}

/** Resume tracking for a doc we just navigated to. */
export async function resumeDraftFromHash(hash: string): Promise<void> {
  if (draftSaveTimer !== null) {
    clearTimeout(draftSaveTimer);
    draftSaveTimer = null;
  }
  const entry = await libraryGet('mine', hash).catch(() => undefined);
  if (entry) {
    draftMineHash = hash;
    currentDocId = entry.docId ?? null;
  } else {
    draftMineHash = null;
    currentDocId = null;
  }
}

export function scheduleDraftSave(ctx: ReaderPluginContext): void {
  if (ctx.isPartsMode()) return;
  if (ctx.getMode() !== 'edit') return;
  if (draftSaveTimer !== null) clearTimeout(draftSaveTimer);
  draftSaveTimer = window.setTimeout(() => {
    draftSaveTimer = null;
    void autoSaveDraft(ctx);
  }, DRAFT_SAVE_DEBOUNCE_MS);
}

async function autoSaveDraft(ctx: ReaderPluginContext): Promise<void> {
  const currentHash = location.hash.slice(1);
  if (!currentHash) return;
  if (ctx.isPartsMode()) return;
  if (ctx.getMode() !== 'edit') return;
  if (currentHash === draftMineHash) return;
  if (!currentDocId) currentDocId = crypto.randomUUID();
  const prev = draftMineHash;
  draftMineHash = currentHash;
  if (prev) {
    await libraryRemove('mine', prev).catch((err) =>
      console.warn('draft prune failed:', err),
    );
  }
  const url = buildUrl(currentHash);
  const doc = ctx.getDoc();
  await libraryRecord('mine', {
    hash: currentHash,
    url,
    title: deriveTitle(doc.markdown, doc.title),
    mode: ctx.getMode(),
    encrypted: ctx.getPassword() !== undefined,
    size: url.length,
    docId: currentDocId,
    mediaIds: ctx.collectDocMediaIds(doc),
  }).catch((err) => console.warn('draft save failed:', err));
}

/**
 * Look for a `mine` row whose docId matches the doc the user is editing
 * but whose hash is different — that's another device's version of the
 * same logical doc. If found, decode it and ask reader to apply it.
 */
export async function maybeAdoptRemoteUpdate(
  ctx: ReaderPluginContext,
): Promise<void> {
  if (!currentDocId) return;
  if (adopting) return;
  if (ctx.isPartsMode()) return;
  if (!ctx.getEditor() && !ctx.getRawTextarea()) return;

  let candidates: Awaited<ReturnType<typeof libraryList>>;
  try {
    candidates = await libraryList('mine');
  } catch (err) {
    console.warn('mine list failed:', err);
    return;
  }
  const successor = candidates
    .filter((c) => c.docId === currentDocId && c.hash !== draftMineHash)
    .sort((a, b) => b.updatedAt - a.updatedAt)[0];
  if (!successor) return;

  const decoded = await ctx.decodeWithPassword(successor.hash, ctx.getPassword());
  if (!decoded.ok) {
    if (decoded.reason === 'decode') {
      console.warn('remote update decode failed:', decoded.message);
    }
    return;
  }

  adopting = true;
  try {
    draftMineHash = successor.hash;
    await ctx.applyRemoteUpdate(decoded.doc, successor.hash);
  } finally {
    setTimeout(() => {
      adopting = false;
    }, 300);
  }
}
