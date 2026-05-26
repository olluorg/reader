import '@fontsource-variable/inter';
import '@fontsource-variable/source-serif-4';
// IMPORTANT: Crepe's common CSS must load BEFORE our main.css so that our
// typography rules win on equal-specificity tiebreaks. Crepe's reset.css
// contains `.milkdown * { margin: 0; padding: 0 }` which otherwise nukes our
// heading / paragraph / list margins.
import '@milkdown/crepe/theme/common/style.css';
import './styles/main.css';
import {
  decode,
  decodeMedia,
  encode,
  buildUrl,
  isMediaHash,
  peekPart,
  PasswordRequiredError,
  WrongPasswordError,
} from './share/codec';
import {
  assembleMarkdown,
  parseMissingHref,
  parseBoundaryHref,
  MISSING_PART_HREF_PREFIX,
  PART_BOUNDARY_HREF_PREFIX,
} from './share/split';
import {
  computeDHash,
  dhashToHex,
  findClosestMatch,
  ImageDecodeError,
} from './share/dhash';
import {
  preprocessImage,
  generateBlurPreview,
  comparePreviewDistance,
  PREVIEW_MATCH_THRESHOLD,
} from './share/image-resize';
import { toBase64Url, fromBase64Url } from './share/base64';
import { refreshSplitPreview, clearSplitPreview } from './ui/split-preview';
import { createEditor, EditorBootError, type EditorHandle } from './editor/milkdown';
import { openShareDialog } from './ui/share-dialog';
import { openNewDocumentDialog } from './ui/new-document-dialog';
import { openLibraryDialog } from './ui/library-dialog';
import { openPartsDialog } from './ui/parts-dialog';
import { openMediaDialog } from './ui/media-dialog';
import { openVersionsDialog } from './ui/versions-dialog';
import { promptPassword } from './ui/password-prompt';
import { showToast } from './ui/toast';
import {
  record as recordEntry,
  collectReferencedMediaIds,
  deriveTitle,
  type LibraryKind,
} from './storage/library';
import { getPosition, setPosition } from './storage/positions';
import { initSdk } from './sync/setup';
import {
  getMedia,
  hasMedia,
  mediaToDataUrl,
  putMedia,
  removeMedia,
  sweepOrphanedMedia,
} from './storage/media';
import { t, setHtmlLang } from './i18n';
import type { DocumentPayload, DocumentVersion, MediaRef, Mode } from './types';

setHtmlLang();

const WELCOME_DOC: DocumentPayload = {
  markdown: t('welcome.markdown'),
  comments: [],
};

// Realistic cross-browser URL ceiling. Beyond this, links start breaking in
// chat apps, email, browser address bars. Warn well before we get there.
const URL_MAX_BYTES = 50 * 1024;
const URL_WARN_BYTES = 16 * 1024;

// Hard ceiling above which we don't even attempt the WYSIWYG editor.
// Milkdown / ProseMirror handle a few tens of thousands of nodes fine; past
// ~300k characters (~50k words) the table / column-resize plugins choke and
// can throw mid-render, leaving the page in a broken layout state. Above
// this threshold we use a raw-textarea view by default.
const EDITOR_MAX_CHARS = 300_000;

// Max bytes for the *raw* file picked off disk. Pre-processing downscales
// + re-encodes to WebP afterwards, so the bytes that actually land in IDB
// (and on the wire) are usually a fraction of this. The ceiling protects
// against accidentally feeding a 50 MB raw camera shot through the decoder.
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

// Pre-processing knobs. 1600 px is comfortable on a 2x retina display at
// the editor's --content-width: 680 px. Quality 0.82 is the inflection
// point on the WebP rate-distortion curve — past it you get diminishing
// returns; below it banding starts to show on screenshots.
const IMAGE_MAX_DIMENSION = 1600;
const IMAGE_WEBP_QUALITY = 0.82;

// Custom URL scheme used in markdown to reference a stored image.
// `![alt](reader-media:<dHash hex>)` parses cleanly as a markdown image, so
// the editor treats it as a normal <img> element — we just rewrite the src.
const MEDIA_HREF_PREFIX = 'reader-media:';
const MEDIA_HREF_REGEX = /reader-media:([0-9a-f]{16})/g;

interface PartsState {
  docId: string;
  partTitles: string[];
  /** index → markdown of that part */
  loaded: Map<number, string>;
  /** index → the hash we decoded that part from */
  hashByIndex: Map<number, string>;
}

interface AppState {
  doc: DocumentPayload;
  mode: Mode;
  editor: EditorHandle | null;
  password?: string;
  baselineMarkdown: string;
  loadedFromHash: string | null;
  /** Non-null only when the current view is reconstructed from part-URLs. */
  parts: PartsState | null;
  /** Set when the editor crashed on init — keeps raw view sticky until reload. */
  editorFailed: boolean;
  /** User opted in to "try editor anyway" past the size guard. */
  bypassSizeLimit: boolean;
  /** Live raw-view <textarea> — non-null only while raw view is mounted. */
  rawTextarea: HTMLTextAreaElement | null;
}

const state: AppState = {
  doc: WELCOME_DOC,
  mode: 'edit',
  editor: null,
  baselineMarkdown: WELCOME_DOC.markdown,
  loadedFromHash: null,
  parts: null,
  editorFailed: false,
  bypassSizeLimit: false,
  rawTextarea: null,
};

let statusBarEl: HTMLElement | null = null;

const HASH_SYNC_DEBOUNCE_MS = 400;
let hashSyncTimer: number | null = null;
let lastWrittenHash: string | null = null;
let pendingSyncToken = 0;

function scheduleHashSync() {
  // Multi-part docs have no single canonical URL — skip live URL sync.
  if (state.parts) return;
  if (hashSyncTimer !== null) clearTimeout(hashSyncTimer);
  hashSyncTimer = window.setTimeout(() => {
    hashSyncTimer = null;
    void syncHashNow();
  }, HASH_SYNC_DEBOUNCE_MS);
}

async function syncHashNow() {
  const token = ++pendingSyncToken;
  try {
    const { hash } = await encode(state.doc, {
      mode: state.mode,
      password: state.password,
    });
    // A newer edit may have started while we were encoding — discard stale result.
    if (token !== pendingSyncToken) return;

    const url = `${location.origin}${location.pathname}${location.search}#${hash}`;
    if (statusBarEl) paintStatusActual(statusBarEl, url.length);

    if (hash !== location.hash.slice(1)) {
      lastWrittenHash = hash;
      history.replaceState(null, '', `${location.pathname}${location.search}#${hash}`);
    }
  } catch (err) {
    console.warn('hash sync failed:', err);
  }
}

/**
 * Decode a hash and prompt for a password on demand. Returns null on cancel
 * or unrecoverable error. Errors are surfaced to the caller, which decides
 * whether to render an error screen or a toast.
 */
async function decodeWithPassword(
  hash: string,
  preset?: string,
): Promise<
  | { ok: true; doc: DocumentPayload; mode: Mode; part: Awaited<ReturnType<typeof decode>>['part']; password?: string }
  | { ok: false; reason: 'cancelled' | 'too-many-attempts' | 'decode'; message?: string }
> {
  let password = preset;
  let attempts = 0;
  while (attempts < 6) {
    try {
      const decoded = await decode(hash, password);
      return { ok: true, ...decoded, password };
    } catch (err) {
      if (err instanceof PasswordRequiredError) {
        const pw = await promptPassword({ retry: false });
        if (!pw) return { ok: false, reason: 'cancelled' };
        password = pw;
      } else if (err instanceof WrongPasswordError) {
        attempts++;
        const pw = await promptPassword({ retry: true });
        if (!pw) return { ok: false, reason: 'cancelled' };
        password = pw;
      } else {
        return { ok: false, reason: 'decode', message: (err as Error).message };
      }
    }
  }
  return { ok: false, reason: 'too-many-attempts' };
}

async function loadFromHash(hash: string): Promise<boolean> {
  // If the URL is one part of a split document, route through the parts loader.
  const partInfo = peekPart(hash);

  const result = await decodeWithPassword(hash);
  if (!result.ok) {
    if (result.reason === 'cancelled') {
      showError(t('error.passwordRequired'));
    } else if (result.reason === 'too-many-attempts') {
      showError(t('error.tooManyAttempts'));
    } else {
      showError(t('error.decode', { message: result.message ?? t('error.unknown') }));
    }
    return false;
  }

  if (partInfo && result.part) {
    state.parts = {
      docId: result.part.docId,
      partTitles: result.part.partTitles.length
        ? result.part.partTitles
        : Array.from({ length: result.part.total }, (_, i) =>
            t('parts.missing.fallbackTitle', { n: i + 1 }),
          ),
      loaded: new Map([[result.part.index, result.doc.markdown]]),
      hashByIndex: new Map([[result.part.index, hash]]),
    };
    // Use this part as the canonical metadata carrier; markdown is assembled
    // from all loaded parts (and missing-slot placeholders).
    state.doc = { ...result.doc, markdown: '' };
    state.doc.markdown = assembleMarkdown(state.parts.partTitles, state.parts.loaded);
  } else {
    state.parts = null;
    state.doc = result.doc;
  }
  state.mode = result.mode;
  state.password = result.password;
  state.loadedFromHash = hash;

  const url = buildUrl(hash);
  recordEntry('history', {
    hash,
    url,
    title: deriveTitle(state.doc.markdown, state.doc.title),
    mode: result.mode,
    encrypted: result.password !== undefined,
    size: url.length,
    mediaIds: collectDocMediaIds(state.doc),
  }).catch((err) => console.warn('history save failed:', err));
  return true;
}

/**
 * Load a sibling part hash into the current parts assembly. Used by the
 * parts dialog and by the inline "..." placeholder widgets.
 */
async function loadSiblingPart(siblingHash: string): Promise<
  { ok: true; index: number } | { ok: false; error: string }
> {
  if (!state.parts) return { ok: false, error: t('parts.err.notPartsMode') };
  const peek = peekPart(siblingHash);
  if (!peek) return { ok: false, error: t('parts.err.notReaderLink') };
  if (peek.docId !== state.parts.docId) {
    return { ok: false, error: t('parts.err.otherDocument') };
  }
  if (state.parts.loaded.has(peek.index)) {
    return { ok: false, error: t('parts.err.alreadyLoaded') };
  }
  const decoded = await decodeWithPassword(siblingHash, state.password);
  if (!decoded.ok) {
    return {
      ok: false,
      error:
        decoded.reason === 'decode'
          ? (decoded.message ?? t('parts.err.decode'))
          : decoded.reason === 'too-many-attempts'
          ? t('parts.err.tooManyAttempts')
          : t('parts.err.cancelled'),
    };
  }
  if (!decoded.part || decoded.part.docId !== state.parts.docId) {
    return { ok: false, error: t('parts.err.otherDocument') };
  }
  state.parts.loaded.set(peek.index, decoded.doc.markdown);
  state.parts.hashByIndex.set(peek.index, siblingHash);
  state.doc.markdown = assembleMarkdown(state.parts.partTitles, state.parts.loaded);
  state.baselineMarkdown = state.doc.markdown;
  if (state.editor) {
    await state.editor.replaceMarkdown(state.doc.markdown);
    installMissingPlaceholders();
  }
  // If we just completed the doc, drop the read-only lock by re-rendering.
  if (state.parts.loaded.size === state.parts.partTitles.length) {
    renderToolbarInPlace();
  }
  showToast(
    t('parts.loaded.toast', {
      title:
        state.parts.partTitles[peek.index] ??
        t('parts.missing.fallbackTitle', { n: peek.index + 1 }),
    }),
    { kind: 'success' },
  );
  return { ok: true, index: peek.index };
}

function openPartsCollector(focusIndex?: number) {
  if (!state.parts) return;
  openPartsDialog({
    header: {
      docId: state.parts.docId,
      index: 0,
      total: state.parts.partTitles.length,
      partTitles: state.parts.partTitles,
    },
    loadedIndices: new Set(state.parts.loaded.keys()),
    loadPart: loadSiblingPart,
    focusIndex,
  });
}

// ───────────────────────────────────────────────────────────
// Image / media support
// ───────────────────────────────────────────────────────────

function extractMediaIds(markdown: string): string[] {
  const seen = new Set<string>();
  for (const m of markdown.matchAll(MEDIA_HREF_REGEX)) seen.add(m[1]);
  return Array.from(seen);
}

/**
 * Collect media ids referenced by a doc — union of what's in the manifest
 * and what the markdown body actually mentions (in case the manifest hasn't
 * been re-synced since the last edit). Stamped on every library entry so
 * the GC sweeper knows what to keep.
 */
function collectDocMediaIds(doc: DocumentPayload): string[] {
  const ids = new Set<string>();
  for (const r of doc.media ?? []) ids.add(r.id);
  for (const id of extractMediaIds(doc.markdown)) ids.add(id);
  return Array.from(ids);
}

/**
 * Drop every media IDB row that isn't referenced by any library entry. The
 * currently-open doc's refs are added to the keep set so a doc that hasn't
 * been shared yet doesn't lose its images mid-edit. If any library entry is
 * "opaque" (encrypted + no mediaIds, i.e. recorded before the field existed),
 * skip the sweep entirely — we can't peek inside and can't risk dropping a
 * still-needed image.
 */
async function sweepUnusedMedia(): Promise<void> {
  try {
    const { ids, hasOpaqueEntries } = await collectReferencedMediaIds();
    if (hasOpaqueEntries) return;
    for (const r of state.doc.media ?? []) ids.add(r.id);
    for (const id of extractMediaIds(state.doc.markdown)) ids.add(id);
    const removed = await sweepOrphanedMedia(ids);
    if (removed > 0) {
      console.debug(`[media-gc] removed ${removed} orphaned media row(s)`);
    }
  } catch (err) {
    console.warn('[media-gc] sweep failed:', err);
  }
}

/**
 * Re-derive the doc's `media` manifest from the current markdown — drops refs
 * the user has deleted, keeps the metadata for refs that still exist. Called
 * before sharing so the manifest matches what's actually in the body.
 */
function syncMediaManifest(doc: DocumentPayload, markdown: string) {
  const ids = new Set(extractMediaIds(markdown));
  const prev = new Map((doc.media ?? []).map((r) => [r.id, r]));
  const next: MediaRef[] = [];
  for (const id of ids) {
    const ref = prev.get(id);
    if (ref) next.push(ref);
    else next.push({ id, mime: 'image/*', size: 0 });
  }
  if (next.length) doc.media = next;
  else delete doc.media;
}

async function importImageFile(
  file: File,
): Promise<{ ok: true; ref: MediaRef } | { ok: false; error: string }> {
  if (!/^image\//.test(file.type)) {
    return { ok: false, error: 'Это не похоже на изображение.' };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return {
      ok: false,
      error: `Файл слишком большой (${(file.size / 1024 / 1024).toFixed(1)} MB). Максимум — ${MAX_IMAGE_BYTES / 1024 / 1024} MB.`,
    };
  }
  let rawBytes: Uint8Array;
  try {
    rawBytes = new Uint8Array(await file.arrayBuffer());
  } catch (err) {
    return { ok: false, error: `Не удалось прочитать файл: ${(err as Error).message}` };
  }

  // Downscale + WebP re-encode. SVG passes through unchanged; failure to
  // decode also passes through so the dHash step below produces the real
  // error message instead of a generic "preprocess failed".
  const processed = await preprocessImage(rawBytes, file.type, {
    maxDimension: IMAGE_MAX_DIMENSION,
    quality: IMAGE_WEBP_QUALITY,
  });
  const bytes = processed.bytes;
  const mime = processed.mime;
  // If we transcoded to WebP, the original .png/.jpg extension would mislead
  // the recipient when they hover the placeholder. Replace it.
  const name =
    processed.changed && processed.mime === 'image/webp'
      ? file.name.replace(/\.[^./\\]+$/, '') + '.webp'
      : file.name;

  let id: string;
  let width: number;
  let height: number;
  try {
    const dh = await computeDHash(bytes, mime);
    id = dhashToHex(dh.hash);
    width = dh.width || processed.width;
    height = dh.height || processed.height;
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof ImageDecodeError
          ? err.message
          : `Не удалось декодировать изображение: ${(err as Error).message}`,
    };
  }

  if (processed.changed) {
    const saved = Math.round((1 - bytes.length / processed.originalSize) * 100);
    showToast(
      `Изображение оптимизировано: ${kb(processed.originalSize)} → ${kb(bytes.length)} KB (-${saved}%)`,
      { kind: 'info' },
    );
  }

  // Tiny LQIP — rides inside the doc share-URL itself so recipients see a
  // blurred placeholder at the correct aspect ratio even when the full image
  // travels separately (or hasn't been loaded yet).
  const preview = await generateBlurPreview(bytes, mime).catch(() => null);

  const base64 = toBase64Url(bytes);
  await putMedia({ id, mime, base64, name, size: bytes.length, width, height });
  const ref: MediaRef = {
    id,
    mime,
    name,
    size: bytes.length,
    width: preview?.width || width,
    height: preview?.height || height,
    preview: preview?.dataUrl,
  };
  return { ok: true, ref };
}

function kb(n: number): string {
  return (n / 1024).toFixed(n < 10 * 1024 ? 1 : 0);
}

function trackMediaRef(ref: MediaRef) {
  if (!state.doc.media) state.doc.media = [];
  const existing = state.doc.media.findIndex((r) => r.id === ref.id);
  if (existing >= 0) state.doc.media[existing] = ref;
  else state.doc.media.push(ref);
}

/**
 * Walk every `<img src="reader-media:...">` and every previously-installed
 * `.missing-media` placeholder in the rendered editor and:
 *   - swap `<img src="reader-media:…">` to a data: URL if IDB has the bytes,
 *     or replace it with a missing-media placeholder if not;
 *   - rebuild stale placeholders back into `<img>` once the media has been
 *     loaded (via paste-URL or file-import in the media dialog) — without
 *     this second pass the recipient sees the placeholder stay even after
 *     successful loading, because PM never re-renders the atom node on its
 *     own and our prior replacement removed the original <img> from the DOM.
 */
async function paintMediaImages() {
  const root = document.querySelector('.editor-shell__inner');
  if (!root) return;

  // Pass 1: <img src="reader-media:..."> → data URL or placeholder.
  const imgs = Array.from(
    root.querySelectorAll<HTMLImageElement>(`img[src^="${MEDIA_HREF_PREFIX}"]`),
  );
  for (const img of imgs) {
    const id = img.getAttribute('src')!.slice(MEDIA_HREF_PREFIX.length);
    const entry = await getMedia(id);
    if (entry) {
      img.setAttribute('src', mediaToDataUrl(entry));
      img.classList.add('media-image--loaded');
      img.dataset.mediaId = id;
      continue;
    }
    const ref =
      state.doc.media?.find((r) => r.id === id) ??
      ({ id, mime: 'image/*', size: 0 } as MediaRef);
    const widget = renderMissingMediaWidget(ref);
    img.replaceWith(widget);
  }

  // Pass 2: placeholders whose media has since arrived → rebuild <img>.
  const placeholders = Array.from(
    root.querySelectorAll<HTMLElement>('.missing-media[data-media-id]'),
  );
  for (const ph of placeholders) {
    const id = ph.dataset.mediaId!;
    const entry = await getMedia(id);
    if (!entry) continue;
    const img = document.createElement('img');
    img.setAttribute('src', mediaToDataUrl(entry));
    img.alt = entry.name ?? '';
    img.classList.add('media-image--loaded');
    img.dataset.mediaId = id;
    ph.replaceWith(img);
  }
}

function renderMissingMediaWidget(ref: MediaRef): HTMLElement {
  const el = document.createElement('div');
  el.setAttribute('contenteditable', 'false');
  // Stamp the id so paintMediaImages' pass-2 can find this placeholder
  // and rebuild it into an <img> once IDB has the bytes.
  el.dataset.mediaId = ref.id;
  const label = ref.name ?? `image · ${ref.id.slice(0, 8)}…`;
  const sizeHint = ref.size
    ? `${(ref.size / 1024).toFixed(1)} KB`
    : 'размер неизвестен';

  // Two layouts: the rich LQIP variant when the ref carries a blur preview
  // (recipient sees a recognisable blurred shape at the correct aspect ratio),
  // and the icon fallback for SVG / older refs without a preview.
  if (ref.preview && ref.width && ref.height) {
    el.className = 'missing-media missing-media--lqip';
    el.style.aspectRatio = `${ref.width} / ${ref.height}`;
    el.innerHTML = `
      <img class="missing-media__preview" alt="" aria-hidden="true">
      <div class="missing-media__overlay">
        <div class="missing-media__info">
          <div class="missing-media__title"></div>
          <div class="missing-media__sub">Не загружено · ${sizeHint} · ${ref.width}×${ref.height}</div>
        </div>
        <button class="btn btn--ghost btn--small missing-media__btn" type="button">Добавить</button>
      </div>
    `;
    (el.querySelector('.missing-media__preview') as HTMLImageElement).src = ref.preview;
  } else {
    el.className = 'missing-media';
    el.innerHTML = `
      <div class="missing-media__frame" aria-hidden="true">🖼</div>
      <div class="missing-media__info">
        <div class="missing-media__title"></div>
        <div class="missing-media__sub">Изображение не загружено · ${sizeHint}</div>
      </div>
      <button class="btn btn--ghost btn--small missing-media__btn" type="button">Добавить</button>
    `;
  }

  (el.querySelector('.missing-media__title') as HTMLElement).textContent = label;
  el.querySelector('.missing-media__btn')!.addEventListener('click', () => {
    openMediaCollector(ref.id);
  });
  return el;
}

function openMediaCollector(focusId?: string) {
  const refs = state.doc.media ?? [];
  if (!refs.length) {
    showToast('В этом документе нет изображений', { kind: 'info' });
    return;
  }
  const loadedIds = new Set<string>();
  Promise.all(refs.map(async (r) => ({ id: r.id, has: await hasMedia(r.id) })))
    .then((results) => {
      for (const r of results) if (r.has) loadedIds.add(r.id);
      openMediaDialog({ refs, loadedIds, loadByUrl: loadMediaByUrl, importFile: importMediaFromFile, focusId });
    })
    .catch((err) => {
      console.warn('media check failed:', err);
      openMediaDialog({ refs, loadedIds, loadByUrl: loadMediaByUrl, importFile: importMediaFromFile, focusId });
    });
}

async function loadMediaByUrl(
  hash: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!isMediaHash(hash)) {
    return { ok: false, error: 'это не ссылка на изображение' };
  }
  try {
    const payload = await decodeMedia(hash, state.password);
    const bytes = payload.bytes;
    await putMedia({
      id: payload.id,
      mime: payload.mime,
      base64: toBase64Url(bytes),
      name: payload.name,
      size: bytes.length,
      width: payload.width,
      height: payload.height,
    });
    trackMediaRef({
      id: payload.id,
      mime: payload.mime,
      name: payload.name,
      size: bytes.length,
      width: payload.width,
      height: payload.height,
    });
    void paintMediaImages();
    return { ok: true, id: payload.id };
  } catch (err) {
    if (err instanceof PasswordRequiredError) {
      return { ok: false, error: 'ресурс зашифрован — откройте основной документ с паролем' };
    }
    if (err instanceof WrongPasswordError) {
      return { ok: false, error: 'пароль не подходит этому ресурсу' };
    }
    return { ok: false, error: `не удалось декодировать: ${(err as Error).message}` };
  }
}

async function importMediaFromFile(
  file: File,
): Promise<{ ok: true; id: string; distance: number } | { ok: false; error: string }> {
  const res = await importImageFile(file);
  if (!res.ok) return res;
  // The file's actual dHash may differ from the doc's reference (Telegram
  // recompression, etc.). Find the closest match within tolerance, and if
  // we do find one, re-key the IDB row under the canonical id so img-src
  // lookups succeed without further bookkeeping.
  const knownIds = (state.doc.media ?? []).map((r) => r.id);
  const fileHash = new Uint8Array(
    res.ref.id.match(/.{2}/g)!.map((h) => parseInt(h, 16)),
  );
  const match = findClosestMatch(fileHash, knownIds);

  // Independent LQIP-based fallback match. If dHash doesn't find anything
  // (encoder/recompression noise on full-resolution input can flip more than
  // 10 bits in rare cases), the 32×32 preview comparison can still recover
  // the right slot: it operates on a wholly different signal (decoded pixel
  // averages) and is robust to compression. We pick the candidate with the
  // smallest LQIP delta below threshold.
  let bestMatch = match;
  if (!bestMatch && res.ref.preview) {
    let best: { id: string; distance: number; previewDelta: number } | null = null;
    for (const ref of state.doc.media ?? []) {
      if (!ref.preview) continue;
      const d = await comparePreviewDistance(ref.preview, res.ref.preview);
      if (d <= PREVIEW_MATCH_THRESHOLD && (best === null || d < best.previewDelta)) {
        // Distance reflects the LQIP delta (in 0–255 units, not bits) but the
        // shape ({id, distance}) keeps downstream code uniform.
        best = { id: ref.id, distance: Math.round(d), previewDelta: d };
      }
    }
    if (best) bestMatch = { id: best.id, distance: best.distance };
  }

  console.debug('[image-import]', {
    fileId: res.ref.id,
    knownIds,
    hammingMatch: match,
    lqipFallbackMatch: !match && bestMatch ? bestMatch : null,
    hasFilePreview: !!res.ref.preview,
  });

  // No match by either signal → the file is unrelated to anything the doc
  // expects. Reject explicitly instead of silently appending it as a new
  // ref (which would leave the missing slot empty and look like success).
  if (!bestMatch) {
    await removeMedia(res.ref.id).catch(() => {});
    const hint = res.ref.preview
      ? 'ни хэш, ни превью не совпали ни с одним ожидаемым изображением'
      : 'хэш не совпал ни с одним ожидаемым изображением';
    return {
      ok: false,
      error: `Это другое изображение — ${hint}. Попробуйте другой файл.`,
    };
  }

  // Cross-validate the match against the doc's LQIP if both sides have one
  // AND we found a match via dHash (LQIP-fallback path already validated by
  // construction — no point re-comparing the same pixels).
  const docRef = state.doc.media?.find((r) => r.id === bestMatch.id);
  const docPreview = docRef?.preview;
  const filePreview = res.ref.preview;
  if (match && docPreview && filePreview) {
    const previewDelta = await comparePreviewDistance(docPreview, filePreview);
    console.debug('[image-import] LQIP cross-check', { previewDelta, threshold: PREVIEW_MATCH_THRESHOLD });
    if (previewDelta > PREVIEW_MATCH_THRESHOLD) {
      // Drop the just-imported IDB row so a stray dHash collision doesn't
      // litter storage with images the user explicitly rejected.
      await removeMedia(res.ref.id).catch(() => {});
      return {
        ok: false,
        error: `Это другое изображение — превью отличается от того, что в документе (расхождение ${Math.round(previewDelta)}/255). Попробуйте другой файл.`,
      };
    }
  }

  // Re-key the IDB row under the canonical id so img-src lookups succeed.
  let canonicalId = res.ref.id;
  let distance = 0;
  if (bestMatch.id !== res.ref.id) {
    const stored = await getMedia(res.ref.id);
    if (stored) {
      await putMedia({ ...stored, id: bestMatch.id });
      // Drop the file-hash-keyed row so we don't keep two copies.
      await removeMedia(res.ref.id).catch(() => {});
    }
    canonicalId = bestMatch.id;
    distance = bestMatch.distance;
  }
  trackMediaRef({
    id: canonicalId,
    mime: res.ref.mime,
    name: res.ref.name,
    size: res.ref.size,
    width: res.ref.width,
    height: res.ref.height,
    // Keep the doc's existing preview if it has one — the recipient's view of
    // the doc shouldn't shift just because they imported a re-compressed copy.
    preview: docRef?.preview ?? res.ref.preview,
  });
  void paintMediaImages();
  return { ok: true, id: canonicalId, distance };
}

/**
 * Toolbar entry-point: pick an image, store it, and drop a markdown reference
 * at the current caret position. The on-render hook will subsequently swap the
 * placeholder <img src> to a data: URL.
 */
async function pickAndInsertImage() {
  if (!state.editor) {
    showToast('Вставка изображений доступна только в редакторе', { kind: 'warn' });
    return;
  }
  const file = await pickImageFile();
  if (!file) return;
  const res = await importImageFile(file);
  if (!res.ok) {
    showToast(res.error, { kind: 'error' });
    return;
  }
  trackMediaRef(res.ref);
  const alt = (res.ref.name ?? 'image').replace(/[\[\]]/g, '');
  // Don't try to verify the insert by comparing getMarkdown() before/after —
  // Milkdown's `markdownUpdated` listener (which is what backs getMarkdown)
  // fires asynchronously after dispatch, so a synchronous diff is always a
  // false negative and would re-trigger a fallback path → double insertion.
  await state.editor.insertMarkdown(`![${alt}](${MEDIA_HREF_PREFIX}${res.ref.id})`);
  // paintMediaImages runs again from onRendered, but call it once now so the
  // <img src="reader-media:..."> placeholder gets swapped to the data URL
  // before the browser even tries (and fails) to fetch the unknown scheme.
  void paintMediaImages();
  showToast(`Изображение «${res.ref.name ?? 'без имени'}» добавлено`, { kind: 'success' });
}

function pickImageFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.style.display = 'none';
    let settled = false;
    const done = (f: File | null) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(f);
    };
    input.addEventListener('change', () => {
      done(input.files?.[0] ?? null);
    });
    // Modern browsers fire `cancel` when the user dismisses the picker.
    // Fall back to a focus-based heuristic for the long tail.
    input.addEventListener('cancel', () => done(null));
    window.addEventListener(
      'focus',
      () => {
        // Give the picker a generous window to commit the file before we
        // assume cancellation — large files / slow disks delay the change
        // event past the previous 200 ms budget.
        setTimeout(() => {
          if (!input.files?.length) done(null);
        }, 1500);
      },
      { once: true },
    );
    document.body.appendChild(input);
    input.click();
  });
}

/**
 * Handle landing on a media share URL. The image is just bytes — we stash it
 * in IDB so any open document that references the same id picks it up, then
 * route the user to a blank workspace with a confirmation toast.
 */
async function handleMediaLanding(hash: string): Promise<boolean> {
  try {
    const payload = await decodeMedia(hash);
    const bytes = payload.bytes;
    await putMedia({
      id: payload.id,
      mime: payload.mime,
      base64: toBase64Url(bytes),
      name: payload.name,
      size: bytes.length,
      width: payload.width,
      height: payload.height,
    });
    history.replaceState(null, '', location.pathname + location.search);
    showToast(
      `Изображение «${payload.name ?? payload.id.slice(0, 8) + '…'}» сохранено. Откройте документ, который его использует — оно подгрузится автоматически.`,
      { kind: 'success' },
    );
    return true;
  } catch (err) {
    if (err instanceof PasswordRequiredError) {
      showError(
        'Этот ресурс зашифрован. Откройте сначала ссылку на основной документ с тем же паролем — изображения декодируются с теми же ключами.',
      );
    } else {
      showError(`Не удалось загрузить ресурс: ${(err as Error).message}`);
    }
    return false;
  }
}

async function bootstrap() {
  // MUST happen before any other module touches IndexedDB so the SDK proxy
  // can hook the `reader` DB's onupgradeneeded and inject _outbox/_kv/_meta.
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

  const hash = location.hash.slice(1);
  if (hash) {
    // Media share URLs are routed before doc-decoding — they don't represent
    // a document so we just absorb the bytes into IDB and present the welcome
    // workspace.
    if (isMediaHash(hash)) {
      await handleMediaLanding(hash);
    } else {
      const ok = await loadFromHash(hash);
      if (!ok) return;
    }
  }
  await render();
  // Landed on a split-doc link with missing pieces? Prompt for siblings.
  if (state.parts && state.parts.loaded.size < state.parts.partTitles.length) {
    openPartsCollector();
  }
  // Refs that the markdown contains but IDB doesn't — derived from the doc
  // body since we may have landed on this URL freshly (no prior media state).
  if (!state.parts) {
    syncMediaManifest(state.doc, state.doc.markdown);
  }
  void paintMediaImages();
  // Best-effort GC of media that no library entry references any more — runs
  // off the critical path so it never delays first paint.
  setTimeout(() => void sweepUnusedMedia(), 2000);
}

// Library-dialog fires this after add/remove operations so we can re-run
// the media GC sweep — addEventListener once at module init, not per render.
window.addEventListener('reader-library-changed', () => {
  void sweepUnusedMedia();
});

async function render() {
  if (state.editor) {
    await state.editor.destroy();
    state.editor = null;
  }
  state.rawTextarea = null;

  const app = document.getElementById('app')!;
  app.innerHTML = '';

  app.appendChild(renderToolbar());
  const shell = renderShell();
  app.appendChild(shell);
  const status = renderStatusBar();
  app.appendChild(status);
  statusBarEl = status;

  const inner = shell.querySelector('.editor-shell__inner') as HTMLElement;

  // Force read-only when a split doc has missing pieces — otherwise editing
  // would silently corrupt the placeholder anchors and the assembly logic.
  const hasMissingParts =
    !!state.parts && state.parts.loaded.size < state.parts.partTitles.length;
  const effectiveMode: Mode = hasMissingParts ? 'view' : state.mode;

  const tooLarge = state.doc.markdown.length > EDITOR_MAX_CHARS;
  const useRaw = state.editorFailed || (tooLarge && !state.bypassSizeLimit);

  if (useRaw) {
    mountRawView(inner, status, tooLarge && !state.bypassSizeLimit);
  } else {
    try {
      state.editor = await createEditor({
        root: inner,
        initialMarkdown: state.doc.markdown,
        mode: effectiveMode,
        // For oversized docs the user opted into, disable GFM tables — that's
        // the plugin most likely to throw on malformed or huge input.
        disableGfm: state.bypassSizeLimit,
        onChange: (md) => {
          if (state.parts) return;
          state.doc.markdown = md;
          updateStatus(status, md);
          scheduleHashSync();
          debouncedLiveLimitCheck(md);
          schedulePreviewRefresh(inner, md);
        },
        onRendered: () => {
          installMissingPlaceholders();
          // After every editor render the heading offsets may have shifted —
          // recompute split-preview anchors against the new layout.
          schedulePreviewRefresh(inner, state.doc.markdown);
          void paintMediaImages();
        },
        onImageRequest: () => void pickAndInsertImage(),
      });
    } catch (err) {
      console.error('Editor failed to initialize, falling back to raw view:', err);
      const detail = err instanceof EditorBootError ? err.cause : err;
      showToast(
        t('raw.editorCrashedToast', {
          detail: (detail as Error)?.message ?? t('error.unknown'),
        }),
        { kind: 'warn' },
      );
      state.editorFailed = true;
      mountRawView(inner, status, false);
    }
  }

  updateStatus(status, state.doc.markdown);
  if (location.hash.length > 1) {
    paintStatusActual(status, location.href.length);
  }
  attachScrollShadow(app.querySelector('.toolbar') as HTMLElement);
  attachScrollSaver();
  state.baselineMarkdown = state.doc.markdown;
  if (state.loadedFromHash) {
    void restoreScrollFor(state.loadedFromHash);
  }
  installMissingPlaceholders();
}

function mountRawView(inner: HTMLElement, status: HTMLElement, dueToSize: boolean) {
  inner.innerHTML = '';
  const banner = document.createElement('div');
  banner.className = 'raw-view__banner';
  const reason = dueToSize
    ? t('raw.tooLarge', {
        chars: state.doc.markdown.length.toLocaleString(),
        max: EDITOR_MAX_CHARS.toLocaleString(),
      })
    : t('raw.editorFailed');
  banner.innerHTML = `
    <div class="raw-view__banner-text"></div>
    <div class="raw-view__banner-actions">
      <button class="btn btn--ghost btn--small" data-action="try-editor"></button>
    </div>
  `;
  (banner.querySelector('[data-action="try-editor"]') as HTMLElement).textContent =
    t('raw.btn.tryEditor');
  (banner.querySelector('.raw-view__banner-text') as HTMLElement).textContent =
    `${reason} ${t('raw.banner.suffix')}`;
  banner.querySelector('[data-action="try-editor"]')!.addEventListener('click', () => {
    // Reset both flags so render() actually tries Milkdown again. If it
    // crashes, the catch block re-sets editorFailed and we land back here.
    state.editorFailed = false;
    state.bypassSizeLimit = true;
    render();
  });
  inner.appendChild(banner);

  const ta = document.createElement('textarea');
  ta.className = 'raw-view__textarea';
  ta.value = state.doc.markdown;
  ta.spellcheck = false;
  ta.readOnly = state.mode === 'view';
  ta.addEventListener('input', () => {
    if (state.parts) return;
    state.doc.markdown = ta.value;
    updateStatus(status, ta.value);
    scheduleHashSync();
    debouncedLiveLimitCheck(ta.value);
  });
  inner.appendChild(ta);
  state.rawTextarea = ta;
}

function installMissingPlaceholders() {
  if (!state.parts) return;
  const root = document.querySelector('.editor-shell__inner');
  if (!root) return;
  const total = state.parts.partTitles.length;

  // Missing-part widgets ("...") — interactive, openable.
  root.querySelectorAll<HTMLAnchorElement>(
    `a[href^="${MISSING_PART_HREF_PREFIX}"]`,
  ).forEach((a) => {
    const parsed = parseMissingHref(a.getAttribute('href') ?? '');
    if (!parsed) return;
    const widget = renderMissingPartWidget(parsed.index, parsed.title);
    const p = a.closest('p');
    if (p && p.textContent?.trim() === a.textContent?.trim()) {
      p.replaceWith(widget);
    } else {
      a.replaceWith(widget);
    }
  });

  // Loaded-part boundary widgets — static, just a labelled seam.
  root.querySelectorAll<HTMLAnchorElement>(
    `a[href^="${PART_BOUNDARY_HREF_PREFIX}"]`,
  ).forEach((a) => {
    const parsed = parseBoundaryHref(a.getAttribute('href') ?? '');
    if (!parsed) return;
    const widget = renderPartBoundaryWidget(parsed.index, parsed.total || total, parsed.title);
    const p = a.closest('p');
    if (p && p.textContent?.trim() === a.textContent?.trim()) {
      p.replaceWith(widget);
    } else {
      a.replaceWith(widget);
    }
  });
}

function renderPartBoundaryWidget(index: number, total: number, title: string): HTMLElement {
  const el = document.createElement('div');
  el.className = 'part-boundary';
  el.setAttribute('contenteditable', 'false');
  el.setAttribute(
    'aria-label',
    t('parts.boundary.aria', { n: index + 1, total, title }),
  );
  el.innerHTML = `
    <span class="part-boundary__rule" aria-hidden="true"></span>
    <span class="part-boundary__label">
      <span class="part-boundary__index"></span>
      <span class="part-boundary__title"></span>
    </span>
    <span class="part-boundary__rule" aria-hidden="true"></span>
  `;
  (el.querySelector('.part-boundary__index') as HTMLElement).textContent =
    t('parts.boundary.index', { n: index + 1, total });
  (el.querySelector('.part-boundary__title') as HTMLElement).textContent =
    title ? `· ${title}` : '';
  return el;
}

function renderMissingPartWidget(index: number, title: string): HTMLElement {
  const total = state.parts?.partTitles.length ?? 0;
  const el = document.createElement('div');
  el.className = 'missing-part';
  el.setAttribute('contenteditable', 'false');
  el.innerHTML = `
    <div class="missing-part__dots" aria-hidden="true">···</div>
    <div class="missing-part__info">
      <div class="missing-part__title"></div>
      <div class="missing-part__sub"></div>
    </div>
    <button class="btn btn--ghost btn--small missing-part__btn" type="button"></button>
  `;
  (el.querySelector('.missing-part__title') as HTMLElement).textContent =
    title || t('parts.missing.fallbackTitle', { n: index + 1 });
  (el.querySelector('.missing-part__sub') as HTMLElement).textContent = t(
    'parts.missing.sub',
    { n: index + 1, total },
  );
  (el.querySelector('.missing-part__btn') as HTMLElement).textContent = t(
    'parts.missing.addBtn',
  );
  el.querySelector('.missing-part__btn')!.addEventListener('click', () => {
    openPartsCollector(index);
  });
  return el;
}

let previewRefreshTimer: number | null = null;
function schedulePreviewRefresh(inner: HTMLElement, md: string) {
  // Split preview only makes sense for single-doc authoring — when we're
  // viewing assembled parts, the boundary widgets are already in the markdown.
  if (state.parts) {
    clearSplitPreview(inner);
    return;
  }
  if (previewRefreshTimer !== null) clearTimeout(previewRefreshTimer);
  previewRefreshTimer = window.setTimeout(() => {
    previewRefreshTimer = null;
    try {
      refreshSplitPreview({
        shellInner: inner,
        markdown: md,
        urlBytes: estimateUrlBytes(md),
        urlLimitBytes: URL_MAX_BYTES,
      });
    } catch (err) {
      console.warn('split preview failed:', err);
    }
  }, 600);
}

// Re-anchor preview lines when the viewport changes — heading offsets shift.
window.addEventListener('resize', () => {
  const inner = document.querySelector('.editor-shell__inner') as HTMLElement | null;
  if (!inner) return;
  schedulePreviewRefresh(inner, state.doc.markdown);
});

let liveLimitToastShown = false;
let liveLimitTimer: number | null = null;
function debouncedLiveLimitCheck(md: string) {
  if (state.parts) return;
  if (liveLimitTimer !== null) clearTimeout(liveLimitTimer);
  liveLimitTimer = window.setTimeout(() => {
    liveLimitTimer = null;
    const estimate = estimateUrlBytes(md);
    if (estimate > URL_MAX_BYTES) {
      if (!liveLimitToastShown) {
        liveLimitToastShown = true;
        showToast(
          t('limit.tooLargeToast', {
            kb: (estimate / 1024).toFixed(1),
            maxKb: Math.round(URL_MAX_BYTES / 1024),
          }),
          { kind: 'warn' },
        );
      }
    } else if (estimate < URL_MAX_BYTES * 0.9) {
      // Reset once the doc shrinks comfortably below the limit, so the warning
      // can fire again if the user goes back over.
      liveLimitToastShown = false;
    }
  }, HASH_SYNC_DEBOUNCE_MS * 2);
}

let scrollSaveTimer: number | null = null;
function attachScrollSaver() {
  const handler = () => {
    if (scrollSaveTimer !== null) clearTimeout(scrollSaveTimer);
    scrollSaveTimer = window.setTimeout(() => {
      scrollSaveTimer = null;
      const hash = location.hash.slice(1);
      if (!hash) return;
      setPosition(hash, Math.round(window.scrollY)).catch(() => {});
    }, 500);
  };
  window.removeEventListener('scroll', (window as any).__readerScrollSave);
  (window as any).__readerScrollSave = handler;
  window.addEventListener('scroll', handler, { passive: true });
}

async function restoreScrollFor(hash: string) {
  const y = await getPosition(hash);
  if (y === undefined || y <= 0) return;
  // Milkdown lays out async — wait two frames so content height is settled.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.scrollTo({ top: y, behavior: 'auto' });
    });
  });
}

function attachScrollShadow(toolbar: HTMLElement | null) {
  if (!toolbar) return;
  const onScroll = () => {
    toolbar.classList.toggle('toolbar--scrolled', window.scrollY > 4);
  };
  window.removeEventListener('scroll', (window as any).__readerScroll);
  (window as any).__readerScroll = onScroll;
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

function renderToolbar(): HTMLElement {
  const toolbar = document.createElement('header');
  toolbar.className = 'toolbar';
  const versionCount = state.doc.versions?.length ?? 0;
  const partTotal = state.parts?.partTitles.length ?? 0;
  const partLoaded = state.parts?.loaded.size ?? 0;
  toolbar.innerHTML = `
    <div class="toolbar__brand">
      <span class="toolbar__brand-mark" aria-hidden="true"></span>
      <span>${escapeHtml(t('toolbar.brand'))}</span>
      <span class="toolbar__brand-mode toolbar__brand-mode--${state.mode}">${escapeHtml(modeLabel(state.mode))}</span>
      ${state.parts
        ? `<span class="toolbar__brand-mode toolbar__brand-mode--parts" title="${escapeHtml(t('toolbar.parts.title', { total: partTotal }))}">${escapeHtml(t('toolbar.parts.badge', { loaded: partLoaded, total: partTotal }))}</span>`
        : ''}
    </div>
    <div class="toolbar__actions">
      <button class="btn btn--ghost toolbar__menu-btn" data-action="menu" aria-label="More actions" aria-haspopup="menu">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
          <line x1="4" y1="7" x2="20" y2="7"></line>
          <line x1="4" y1="12" x2="20" y2="12"></line>
          <line x1="4" y1="17" x2="20" y2="17"></line>
        </svg>
      </button>
      <button class="btn btn--ghost toolbar__action--collapsible" data-action="library-history" title="${escapeHtml(t('toolbar.btn.history.title'))}">${escapeHtml(t('toolbar.btn.history'))}</button>
      <button class="btn btn--ghost toolbar__action--collapsible" data-action="library-saved" title="${escapeHtml(t('toolbar.btn.saved.title'))}">${escapeHtml(t('toolbar.btn.saved'))}</button>
      <button class="btn btn--ghost toolbar__action--collapsible" data-action="library-mine" title="${escapeHtml(t('toolbar.btn.mine.title'))}">${escapeHtml(t('toolbar.btn.mine'))}</button>
      <span class="toolbar__divider toolbar__action--collapsible" aria-hidden="true"></span>
      ${versionCount > 0
        ? `<button class="btn btn--ghost toolbar__action--collapsible" data-action="versions" title="${escapeHtml(t('toolbar.btn.versions.title'))}">${escapeHtml(t('toolbar.btn.versions', { count: versionCount }))}</button>`
        : ''}
      ${state.parts && partLoaded < partTotal
        ? `<button class="btn btn--ghost toolbar__action--collapsible" data-action="parts" title="${escapeHtml(t('toolbar.btn.parts.title'))}">${escapeHtml(t('toolbar.btn.parts', { loaded: partLoaded, total: partTotal }))}</button>`
        : ''}
      <button class="btn btn--ghost toolbar__action--collapsible" data-action="new">${escapeHtml(t('toolbar.btn.new'))}</button>
      <button class="btn btn--primary" data-action="share">${escapeHtml(t('toolbar.btn.share'))}</button>
    </div>
  `;
  const openLib = (kind: LibraryKind) => () => openLibraryDialog(kind);
  toolbar.querySelector('[data-action="library-history"]')!.addEventListener('click', openLib('history'));
  toolbar.querySelector('[data-action="library-saved"]')!.addEventListener('click', openLib('saved'));
  toolbar.querySelector('[data-action="library-mine"]')!.addEventListener('click', openLib('mine'));
  toolbar.querySelector('[data-action="menu"]')!.addEventListener('click', (e) => {
    openOverflowMenu(e.currentTarget as HTMLElement);
  });
  toolbar.querySelector('[data-action="versions"]')?.addEventListener('click', () => {
    openVersionsDialog({
      versions: state.doc.versions ?? [],
      currentMarkdown: state.editor?.getMarkdown() ?? state.doc.markdown,
    });
  });
  toolbar.querySelector('[data-action="parts"]')?.addEventListener('click', () => openPartsCollector());
  toolbar.querySelector('[data-action="share"]')!.addEventListener('click', () => {
    openShareDialog({
      baselineMarkdown: state.baselineMarkdown,
      appendVersion: (v: DocumentVersion) => {
        if (!state.doc.versions) state.doc.versions = [];
        state.doc.versions.push(v);
      },
      getDoc: () => {
        const markdown = state.editor?.getMarkdown() ?? state.doc.markdown;
        // Refresh the manifest from the live body — drops refs the user deleted,
        // keeps the metadata for refs that still exist. The mutation lands on
        // state.doc directly so future shares stay in sync too.
        syncMediaManifest(state.doc, markdown);
        return { ...state.doc, markdown };
      },
      getMediaPayload: async (id) => {
        const entry = await getMedia(id);
        if (!entry) return null;
        return {
          id: entry.id,
          mime: entry.mime,
          name: entry.name,
          width: entry.width,
          height: entry.height,
          bytes: fromBase64Url(entry.base64),
        };
      },
      onGenerated: (gen) => {
        recordEntry('mine', {
          hash: gen.hash,
          url: gen.url,
          title: deriveTitle(gen.doc.markdown, gen.doc.title),
          mode: gen.mode,
          encrypted: gen.encrypted,
          size: gen.size,
          mediaIds: collectDocMediaIds(gen.doc),
        }).catch((err) => console.warn('mine save failed:', err));
        setPosition(gen.hash, Math.round(window.scrollY)).catch(() => {});
        // Shared markdown becomes the new baseline so the *next* version's
        // diff captures only the edits between this share and the next.
        state.baselineMarkdown = gen.doc.markdown;
        // Update toolbar if we just appended a version.
        if (state.doc.versions?.length) renderToolbarInPlace();
      },
      onSplitGenerated: (gen) => {
        const mediaIds = collectDocMediaIds(gen.doc);
        for (const p of gen.parts) {
          recordEntry('mine', {
            hash: p.hash,
            url: p.url,
            title: `${deriveTitle(gen.doc.markdown, gen.doc.title)} · ${p.index + 1}/${p.total}`,
            mode: gen.mode,
            encrypted: gen.encrypted,
            size: p.url.length,
            mediaIds,
          }).catch((err) => console.warn('mine save failed:', err));
        }
        state.baselineMarkdown = gen.doc.markdown;
        if (state.doc.versions?.length) renderToolbarInPlace();
      },
    });
  });
  toolbar.querySelector('[data-action="new"]')!.addEventListener('click', () => {
    void openNewDocument();
  });
  return toolbar;
}

function renderToolbarInPlace() {
  const old = document.querySelector('.toolbar');
  if (!old) return;
  old.replaceWith(renderToolbar());
  attachScrollShadow(document.querySelector('.toolbar') as HTMLElement);
}

/**
 * Mobile overflow menu: anchored popover with every toolbar action except
 * Share (which stays inline as the primary CTA). Items are built from the
 * current state so conditional buttons (Versions, Parts) appear only when
 * relevant.
 */
function openOverflowMenu(anchor: HTMLElement) {
  // Avoid double-open if user re-taps the trigger while menu is animating in.
  if (document.querySelector('.overflow-menu')) return;

  const items: Array<{ label: string; action: () => void; primary?: boolean }> = [
    { label: t('toolbar.btn.history'), action: () => openLibraryDialog('history') },
    { label: t('toolbar.btn.saved'), action: () => openLibraryDialog('saved') },
    { label: t('toolbar.btn.mine'), action: () => openLibraryDialog('mine') },
  ];

  const versionCount = state.doc.versions?.length ?? 0;
  if (versionCount > 0) {
    items.push({
      label: t('toolbar.btn.versions', { count: versionCount }),
      action: () =>
        openVersionsDialog({
          versions: state.doc.versions ?? [],
          currentMarkdown: state.editor?.getMarkdown() ?? state.doc.markdown,
        }),
    });
  }

  if (state.parts && state.parts.loaded.size < state.parts.partTitles.length) {
    const loaded = state.parts.loaded.size;
    const total = state.parts.partTitles.length;
    items.push({
      label: t('toolbar.btn.parts', { loaded, total }),
      action: () => openPartsCollector(),
    });
  }

  items.push({ label: t('toolbar.btn.new'), action: openNewDocument, primary: true });

  const menu = document.createElement('div');
  menu.className = 'overflow-menu';
  menu.setAttribute('role', 'menu');
  menu.innerHTML = items
    .map(
      (_, i) =>
        `<button class="overflow-menu__item" role="menuitem" data-idx="${i}"></button>`,
    )
    .join('');

  items.forEach((item, i) => {
    const btn = menu.querySelector(`[data-idx="${i}"]`) as HTMLButtonElement;
    btn.textContent = item.label;
    if (item.primary) btn.classList.add('overflow-menu__item--primary');
    btn.addEventListener('click', () => {
      close();
      item.action();
    });
  });

  // Position below the anchor, right-aligned to its right edge so it never
  // overflows the viewport on narrow screens.
  const rect = anchor.getBoundingClientRect();
  menu.style.top = `${rect.bottom + 6}px`;
  menu.style.right = `${Math.max(8, window.innerWidth - rect.right)}px`;

  document.body.appendChild(menu);
  requestAnimationFrame(() => menu.classList.add('overflow-menu--open'));

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    menu.classList.remove('overflow-menu--open');
    setTimeout(() => menu.remove(), 160);
    document.removeEventListener('click', onDocClick, true);
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', close);
    window.removeEventListener('scroll', close, true);
  };

  const onDocClick = (e: MouseEvent) => {
    const target = e.target as Node;
    if (!menu.contains(target) && !anchor.contains(target)) close();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
  };

  // Defer one tick so the click that opened the menu doesn't immediately close it.
  setTimeout(() => {
    document.addEventListener('click', onDocClick, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
  }, 0);
}

/**
 * Same flow as the "New" toolbar button — extracted so the overflow menu
 * can trigger it without duplicating logic.
 */
async function openNewDocument() {
  const result = await openNewDocumentDialog();
  if (!result) return;
  if (location.hash) {
    lastWrittenHash = null;
    history.pushState(null, '', location.pathname + location.search);
  }
  state.doc = result.doc;
  state.mode = 'edit';
  state.password = undefined;
  state.baselineMarkdown = result.doc.markdown;
  state.loadedFromHash = null;
  state.parts = null;
  state.editorFailed = false;
  state.bypassSizeLimit = false;
  render();
}

function modeLabel(mode: Mode): string {
  switch (mode) {
    case 'view':
      return t('toolbar.mode.view');
    case 'comment':
      return t('toolbar.mode.comment');
    case 'edit':
      return t('toolbar.mode.edit');
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderShell(): HTMLElement {
  const shell = document.createElement('main');
  shell.className = `editor-shell editor-shell--${state.mode}`;
  const inner = document.createElement('div');
  inner.className = 'editor-shell__inner';
  shell.appendChild(inner);
  return shell;
}

function renderStatusBar(): HTMLElement {
  const status = document.createElement('div');
  status.className = 'status-bar';
  status.innerHTML = `
    <div class="status-bar__text"></div>
    <div class="status-bar__track" role="progressbar" aria-valuemin="0" aria-valuemax="100">
      <div class="status-bar__fill"></div>
    </div>
  `;
  return status;
}

function countWords(md: string): number {
  return md
    .replace(/[#*_`>\-\[\]\(\)!]/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length;
}

// Optimistic estimate based on markdown size. Brotli compresses prose ~3x;
// base64url expands by 4/3. Plus origin/pathname/hash overhead.
function estimateUrlBytes(md: string): number {
  const overhead = location.origin.length + location.pathname.length + 1;
  const compressed = Math.max(20, Math.round(md.length * 0.35));
  return overhead + Math.round((compressed * 4) / 3);
}

function paintStatus(el: HTMLElement, urlBytes: number, words: number) {
  const fill = el.querySelector('.status-bar__fill') as HTMLElement;
  const text = el.querySelector('.status-bar__text') as HTMLElement;
  const track = el.querySelector('.status-bar__track') as HTMLElement;

  const pct = Math.min(100, (urlBytes / URL_MAX_BYTES) * 100);
  fill.style.width = `${pct.toFixed(1)}%`;
  track.setAttribute('aria-valuenow', String(Math.round(pct)));

  const kb = (urlBytes / 1024).toFixed(1);
  const maxKb = Math.round(URL_MAX_BYTES / 1024);
  text.textContent = t('status.text', {
    words: words.toLocaleString(),
    kb,
    maxKb,
  });

  const over = urlBytes > URL_MAX_BYTES;
  const warn = urlBytes > URL_WARN_BYTES && !over;
  el.classList.toggle('status-bar--warn', warn);
  el.classList.toggle('status-bar--full', over);
}

function updateStatus(el: HTMLElement, md: string) {
  paintStatus(el, estimateUrlBytes(md), countWords(md));
}

function paintStatusActual(el: HTMLElement, urlBytes: number) {
  paintStatus(el, urlBytes, countWords(state.doc.markdown));
}

function showError(msg: string) {
  const app = document.getElementById('app')!;
  app.innerHTML = `
    <div class="error-screen">
      <h1>${escapeHtml(t('error.title'))}</h1>
      <p>${escapeHtml(msg)}</p>
      <p><a href="${location.pathname}">${escapeHtml(t('error.startNew'))}</a></p>
    </div>
  `;
}

window.addEventListener('hashchange', () => {
  const hash = location.hash.slice(1);
  // Ignore our own replaceState writes (debounced edit sync).
  if (hash && hash === lastWrittenHash) return;
  lastWrittenHash = null;
  if (!hash) {
    state.doc = WELCOME_DOC;
    state.mode = 'edit';
    state.password = undefined;
    state.loadedFromHash = null;
    state.parts = null;
    state.editorFailed = false;
    state.bypassSizeLimit = false;
    render();
    return;
  }
  state.password = undefined;
  state.loadedFromHash = null;
  state.parts = null;
  state.editorFailed = false;
  state.bypassSizeLimit = false;
  loadFromHash(hash).then((ok) => {
    if (!ok) return;
    render().then(() => {
      if (state.parts && state.parts.loaded.size < state.parts.partTitles.length) {
        openPartsCollector();
      }
    });
  });
});

bootstrap().catch((err) => {
  console.error(err);
  showError(t('error.unexpected', { message: (err as Error).message }));
});
