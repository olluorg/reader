import type { Mode, DocumentPayload, DocumentVersion } from '../types';
import {
  encode,
  encodeMedia,
  buildUrl,
  inlineMediaInMarkdown,
  type EncodedMedia,
  type MediaPayload,
} from '../share/codec';
import { planSplit, encodeSplit, type SplitEncodeResult } from '../share/split';
import { showToast } from './toast';
import { t } from '../i18n';

export interface ShareGenerated {
  url: string;
  hash: string;
  size: number;
  mode: Mode;
  encrypted: boolean;
  doc: DocumentPayload;
  media?: EncodedMedia[];
}

export interface ShareSplitGenerated {
  docId: string;
  mode: Mode;
  encrypted: boolean;
  parts: SplitEncodeResult['parts'];
  doc: DocumentPayload;
  media?: EncodedMedia[];
}

export interface ShareDialogOptions {
  /** Snapshot of the markdown when the doc was opened — baseline for diff. */
  baselineMarkdown: string;
  /**
   * Apply a new version: caller mutates the doc and we re-read it on encode.
   * Returns the version that was appended (so we can roll back if user closes
   * the dialog without copying — actually we keep it; the user explicitly
   * asked to save it).
   */
  appendVersion: (version: DocumentVersion) => void;
  getDoc: () => DocumentPayload;
  /**
   * Resolve the actual bytes of a referenced image from IDB. The dialog turns
   * each missing-from-here entry into its own share URL alongside the doc.
   * Returning null skips the entry with a soft warning.
   */
  getMediaPayload?: (id: string) => Promise<MediaPayload | null>;
  onGenerated?: (result: ShareGenerated) => void;
  onSplitGenerated?: (result: ShareSplitGenerated) => void;
}

function modeOptions(): { value: Mode; label: string; desc: string }[] {
  return [
    {
      value: 'view',
      label: t('share.mode.view.label'),
      desc: t('share.mode.view.desc'),
    },
    {
      value: 'comment',
      label: t('share.mode.comment.label'),
      desc: t('share.mode.comment.desc'),
    },
    {
      value: 'edit',
      label: t('share.mode.edit.label'),
      desc: t('share.mode.edit.desc'),
    },
  ];
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Same limits as main.ts — keep in sync.
const URL_MAX_BYTES = 50 * 1024;

export function openShareDialog(opts: ShareDialogOptions): void {
  const backdrop = document.createElement('div');
  backdrop.className = 'dialog-backdrop';

  const dialog = document.createElement('div');
  dialog.className = 'dialog';
  const modes = modeOptions();
  dialog.innerHTML = `
    <h2 class="dialog__title">${escapeHtml(t('share.title'))}</h2>
    <p class="dialog__desc">${t('share.desc')}</p>

    <div class="dialog__field">
      <span class="dialog__label">${escapeHtml(t('share.label.access'))}</span>
      <div class="dialog__radio-group">
        ${modes
          .map(
            (opt, i) => `
          <label class="dialog__radio${i === 0 ? ' dialog__radio--selected' : ''}">
            <input type="radio" name="mode" value="${opt.value}"${i === 0 ? ' checked' : ''}>
            <div class="dialog__radio-content">
              <div class="dialog__radio-label">${escapeHtml(opt.label)}</div>
              <div class="dialog__radio-desc">${escapeHtml(opt.desc)}</div>
            </div>
          </label>`,
          )
          .join('')}
      </div>
    </div>

    <div class="dialog__field">
      <label class="dialog__label" for="share-password">${escapeHtml(t('share.label.password'))}
        <span class="dialog__hint">${escapeHtml(t('share.hint.password'))}</span>
      </label>
      <input class="dialog__input" type="password" id="share-password"
             placeholder="${escapeHtml(t('share.placeholder.password'))}" autocomplete="new-password">
    </div>

    <div class="dialog__field">
      <label class="dialog__toggle">
        <input type="checkbox" id="share-versioning">
        <span class="dialog__toggle-content">
          <span class="dialog__toggle-label">${escapeHtml(t('share.versioning.label'))}</span>
          <span class="dialog__toggle-desc">${escapeHtml(t('share.versioning.desc'))}</span>
        </span>
      </label>
    </div>

    <div class="dialog__field" data-role="split-field" hidden>
      <label class="dialog__label" for="share-split-count">${escapeHtml(t('share.split.label'))}
        <span class="dialog__hint">${escapeHtml(t('share.split.hint'))}</span>
      </label>
      <input class="dialog__input" type="number" id="share-split-count"
             min="2" max="12" step="1" placeholder="${escapeHtml(t('share.split.placeholder'))}">
      <p class="dialog__hint">${escapeHtml(t('share.split.note'))}</p>
    </div>

    <div class="dialog__result" data-role="result" hidden>
      <div class="dialog__result-header">
        <span class="dialog__label">${escapeHtml(t('share.result.label'))}</span>
        <span class="dialog__hint" data-role="meta"></span>
      </div>
      <textarea class="dialog__url" rows="3" readonly></textarea>
      <button class="btn btn--primary btn--full" data-action="copy">${escapeHtml(t('share.result.copy'))}</button>
    </div>

    <div class="dialog__result dialog__result--parts" data-role="parts" hidden>
      <div class="dialog__result-header">
        <span class="dialog__label">${escapeHtml(t('share.parts.label'))}</span>
        <span class="dialog__hint" data-role="parts-meta"></span>
      </div>
      <div class="parts-list" data-role="parts-list"></div>
      <button class="btn btn--primary btn--full" data-action="copy-all">${escapeHtml(t('share.parts.copyAll'))}</button>
    </div>

    <div class="dialog__result dialog__result--media" data-role="media" hidden>
      <div class="dialog__result-header">
        <span class="dialog__label">${escapeHtml(t('share.media.label'))}</span>
        <span class="dialog__hint" data-role="media-meta"></span>
      </div>
      <p class="dialog__hint" style="margin: 0 0 8px;">${escapeHtml(t('share.media.note'))}</p>
      <div class="parts-list" data-role="media-list"></div>
      <button class="btn btn--ghost btn--full" data-action="copy-all-media">${escapeHtml(t('share.media.copyAll'))}</button>
    </div>

    <div class="dialog__actions">
      <button class="btn btn--ghost" data-action="close">${escapeHtml(t('share.btn.close'))}</button>
      <button class="btn btn--primary" data-action="generate">${escapeHtml(t('share.btn.generate'))}</button>
    </div>
  `;

  backdrop.appendChild(dialog);
  document.body.appendChild(backdrop);

  dialog.querySelectorAll<HTMLInputElement>('input[name="mode"]').forEach((r) => {
    r.addEventListener('change', () => {
      dialog
        .querySelectorAll('.dialog__radio')
        .forEach((el) => el.classList.remove('dialog__radio--selected'));
      r.closest('.dialog__radio')!.classList.add('dialog__radio--selected');
    });
  });

  const close = () => {
    backdrop.remove();
    document.removeEventListener('keydown', escHandler);
  };
  function escHandler(e: KeyboardEvent) {
    if (e.key === 'Escape') close();
  }
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });
  document.addEventListener('keydown', escHandler);
  dialog.querySelector('[data-action="close"]')!.addEventListener('click', close);

  const result = dialog.querySelector('[data-role="result"]') as HTMLElement;
  const partsResult = dialog.querySelector('[data-role="parts"]') as HTMLElement;
  const partsList = dialog.querySelector('[data-role="parts-list"]') as HTMLElement;
  const partsMeta = dialog.querySelector('[data-role="parts-meta"]') as HTMLElement;
  const textarea = result.querySelector('textarea') as HTMLTextAreaElement;
  const meta = result.querySelector('[data-role="meta"]') as HTMLElement;
  const copyBtn = result.querySelector('[data-action="copy"]') as HTMLButtonElement;
  const splitField = dialog.querySelector('[data-role="split-field"]') as HTMLElement;
  const splitInput = dialog.querySelector('#share-split-count') as HTMLInputElement;
  const versioningInput = dialog.querySelector('#share-versioning') as HTMLInputElement;
  const generateBtn = dialog.querySelector(
    '[data-action="generate"]',
  ) as HTMLButtonElement;
  const copyAllBtn = partsResult.querySelector('[data-action="copy-all"]') as HTMLButtonElement;
  const mediaResult = dialog.querySelector('[data-role="media"]') as HTMLElement;
  const mediaList = dialog.querySelector('[data-role="media-list"]') as HTMLElement;
  const mediaMeta = dialog.querySelector('[data-role="media-meta"]') as HTMLElement;
  const copyAllMediaBtn = mediaResult.querySelector(
    '[data-action="copy-all-media"]',
  ) as HTMLButtonElement;

  let oversized = false; // set true after the first generate attempt exceeds the limit

  copyBtn.addEventListener('click', async () => {
    await copyText(textarea.value, copyBtn);
  });

  copyAllBtn.addEventListener('click', async () => {
    const urls = Array.from(partsList.querySelectorAll<HTMLTextAreaElement>('textarea'))
      .map((t) => t.value)
      .join('\n\n');
    await copyText(urls, copyAllBtn);
  });
  copyAllMediaBtn.addEventListener('click', async () => {
    const urls = Array.from(mediaList.querySelectorAll<HTMLTextAreaElement>('textarea'))
      .map((t) => t.value)
      .join('\n\n');
    await copyText(urls, copyAllMediaBtn);
  });

  generateBtn.addEventListener('click', async () => {
    const mode = (dialog.querySelector('input[name="mode"]:checked') as HTMLInputElement)
      .value as Mode;
    const password =
      (dialog.querySelector('#share-password') as HTMLInputElement).value || undefined;
    const saveVersion = versioningInput.checked;
    const requestedSplit = Number(splitInput.value) || 0;

    // If user opted into versioning, persist the snapshot now — before encode —
    // so the link contains the new version entry.
    if (saveVersion) {
      const doc = opts.getDoc();
      if (doc.markdown !== opts.baselineMarkdown) {
        opts.appendVersion({
          markdown: doc.markdown,
          createdAt: Date.now(),
        });
      }
    }

    const doc = opts.getDoc();

    // Forced split path: user picked a part count explicitly.
    if (requestedSplit >= 2) {
      const media = await encodeMediaList(doc, password);
      await emitSplit(doc, mode, password, requestedSplit, media);
      return;
    }

    try {
      // First try: inline every referenced image as a `data:` URL inside the
      // markdown. If the resulting single URL fits the chat-app ceiling, ship
      // it — the recipient gets one self-contained link with no extra
      // resources to chase. SVG and small bitmaps usually fit here.
      const inlineAttempt = await tryInlineEncode(doc, mode, password);
      if (inlineAttempt) {
        oversized = false;
        partsResult.hidden = true;
        textarea.value = inlineAttempt.url;
        result.hidden = false;
        const kbStr = (inlineAttempt.size / 1024).toFixed(1);
        const chars = inlineAttempt.url.length.toLocaleString();
        const lock = password ? t('share.meta.encrypted') : '';
        const imgCount = doc.media?.length ?? 0;
        const inlineHint = imgCount
          ? t('share.meta.imagesInLink', { count: imgCount })
          : '';
        meta.textContent =
          t('share.meta.payload', { kb: kbStr, chars, lock }) + inlineHint;
        // Hide the resources section — they're inlined, no extra URLs.
        renderMediaSection([], password);
        opts.onGenerated?.({
          url: inlineAttempt.url,
          hash: inlineAttempt.hash,
          size: inlineAttempt.url.length,
          mode,
          encrypted: !!password,
          doc,
          media: [],
        });
        await copyText(inlineAttempt.url, copyBtn, { silent: true });
        meta.textContent = `${kbStr} KB payload · ${chars} chars${lock}${inlineHint} · copied`;
        return;
      }

      const { hash, size } = await encode(doc, { mode, password });
      const url = buildUrl(hash);

      // Limit check based on the *URL* length (what actually breaks in chat
      // apps and address bars), not just payload bytes.
      if (url.length > URL_MAX_BYTES) {
        if (oversized) {
          // Second strike: auto-split.
          const auto = autoPartCount(url.length);
          showToast(
            t('share.toast.tooLong', { maxKb: kb(URL_MAX_BYTES), parts: auto }),
            { kind: 'warn' },
          );
          const media = await encodeMediaList(doc, password);
          await emitSplit(doc, mode, password, auto, media);
          return;
        }
        oversized = true;
        const suggestion = autoPartCount(url.length);
        splitField.hidden = false;
        splitInput.value = String(suggestion);
        showToast(
          t('share.toast.suggestSplit', {
            kb: kb(url.length),
            maxKb: kb(URL_MAX_BYTES),
            parts: suggestion,
          }),
          {
            kind: 'warn',
            actions: [
              {
                label: t('share.toast.suggestBtn', { parts: suggestion }),
                onClick: () => {
                  splitInput.value = String(suggestion);
                  generateBtn.click();
                },
              },
            ],
          },
        );
        return;
      }

      // Happy path: single URL fits.
      oversized = false;
      partsResult.hidden = true;
      textarea.value = url;
      result.hidden = false;
      const kbStr = (size / 1024).toFixed(1);
      const chars = url.length.toLocaleString();
      const lock = password ? t('share.meta.encrypted') : '';
      meta.textContent = t('share.meta.payload', { kb: kbStr, chars, lock });
      const media = await encodeMediaList(doc, password);
      renderMediaSection(media, password);
      opts.onGenerated?.({
        url,
        hash,
        size: url.length,
        mode,
        encrypted: !!password,
        doc,
        media,
      });
      await copyText(url, copyBtn, { silent: true });
      meta.textContent = t('share.meta.payloadCopied', { kb: kbStr, chars, lock });
    } catch (err) {
      showToast(t('share.toast.encodeFailed', { message: (err as Error).message }), {
        kind: 'error',
      });
    }
  });

  async function emitSplit(
    doc: DocumentPayload,
    mode: Mode,
    password: string | undefined,
    count: number,
    media: EncodedMedia[] = [],
  ) {
    try {
      const plan = planSplit(doc.markdown, count);
      const split = await encodeSplit(plan, doc, { mode, password }, buildUrl);
      result.hidden = true;
      partsResult.hidden = false;
      partsList.innerHTML = '';
      for (const p of split.parts) {
        const row = document.createElement('div');
        row.className = 'parts-list__row';
        row.innerHTML = `
          <div class="parts-list__head">
            <span class="parts-list__badge">${p.index + 1} / ${p.total}</span>
            <span class="parts-list__title"></span>
            <span class="parts-list__size">${(p.url.length / 1024).toFixed(1)} KB</span>
          </div>
          <textarea class="dialog__url parts-list__url" rows="2" readonly></textarea>
          <button class="btn btn--ghost btn--small" data-action="copy-part">${escapeHtml(t('share.parts.copy'))}</button>
        `;
        (row.querySelector('.parts-list__title') as HTMLElement).textContent = p.title;
        const ta = row.querySelector('textarea') as HTMLTextAreaElement;
        ta.value = p.url;
        const cp = row.querySelector('[data-action="copy-part"]') as HTMLButtonElement;
        cp.addEventListener('click', () => copyText(p.url, cp));
        partsList.appendChild(row);
      }
      const total = split.parts.reduce((sum, p) => sum + p.url.length, 0);
      const lock = password ? ' · 🔒' : '';
      partsMeta.textContent = t('share.parts.summary', {
        count: split.parts.length,
        kb: (total / 1024).toFixed(1),
        lock,
      });
      renderMediaSection(media, password);
      showToast(t('share.toast.splitDone', { count: split.parts.length }), {
        kind: 'success',
      });
      opts.onSplitGenerated?.({
        docId: split.docId,
        mode,
        encrypted: !!password,
        parts: split.parts,
        doc,
        media,
      });
    } catch (err) {
      showToast(t('share.toast.splitFailed', { message: (err as Error).message }), {
        kind: 'error',
      });
    }
  }

  /**
   * Try to encode the document with every referenced image inlined as a
   * `data:` URL inside the markdown. Returns null if the resulting URL
   * doesn't fit URL_MAX_BYTES (caller falls back to the ref-based scheme)
   * or if the doc has no media at all (caller's normal encode path is fine).
   */
  async function tryInlineEncode(
    doc: DocumentPayload,
    mode: Mode,
    password: string | undefined,
  ): Promise<{ hash: string; url: string; size: number } | null> {
    if (!opts.getMediaPayload || !doc.media?.length) return null;
    const payloads = new Map<string, MediaPayload>();
    for (const ref of doc.media) {
      try {
        const p = await opts.getMediaPayload(ref.id);
        if (p) payloads.set(ref.id, p);
      } catch {
        // Skip — we'll just fall through to the ref-based path.
      }
    }
    if (!payloads.size) return null;
    const inlinedMarkdown = inlineMediaInMarkdown(doc.markdown, payloads);
    // Drop the manifest too — without ref hrefs in the body, it's just dead
    // weight on the wire.
    const inlinedDoc: DocumentPayload = {
      ...doc,
      markdown: inlinedMarkdown,
      media: undefined,
    };
    const { hash, size } = await encode(inlinedDoc, { mode, password });
    const url = buildUrl(hash);
    if (url.length > URL_MAX_BYTES) return null;
    return { hash, url, size };
  }

  async function encodeMediaList(
    doc: DocumentPayload,
    password: string | undefined,
  ): Promise<EncodedMedia[]> {
    if (!opts.getMediaPayload || !doc.media?.length) return [];
    const out: EncodedMedia[] = [];
    for (const ref of doc.media) {
      try {
        const payload = await opts.getMediaPayload(ref.id);
        if (!payload) {
          showToast(
            t('share.media.missingBytes', {
              name: ref.name ?? ref.id.slice(0, 8) + '…',
            }),
            { kind: 'warn' },
          );
          continue;
        }
        const enc = await encodeMedia(payload, { password });
        out.push(enc);
      } catch (err) {
        showToast(
          t('share.media.packFailed', {
            name: ref.name ?? ref.id.slice(0, 8) + '…',
            message: (err as Error).message,
          }),
          { kind: 'error' },
        );
      }
    }
    return out;
  }

  function renderMediaSection(media: EncodedMedia[], password: string | undefined) {
    if (!media.length) {
      mediaResult.hidden = true;
      return;
    }
    mediaResult.hidden = false;
    mediaList.innerHTML = '';
    let total = 0;
    for (let i = 0; i < media.length; i++) {
      const m = media[i];
      total += m.url.length;
      const row = document.createElement('div');
      row.className = 'parts-list__row';
      row.innerHTML = `
        <div class="parts-list__head">
          <span class="parts-list__badge">${i + 1} / ${media.length}</span>
          <span class="parts-list__title"></span>
          <span class="parts-list__size">${(m.url.length / 1024).toFixed(1)} KB</span>
        </div>
        <textarea class="dialog__url parts-list__url" rows="2" readonly></textarea>
        <button class="btn btn--ghost btn--small" data-action="copy-media">${escapeHtml(t('share.media.copyOne'))}</button>
      `;
      (row.querySelector('.parts-list__title') as HTMLElement).textContent =
        m.ref.name ?? t('share.media.fallbackTitle', { id: m.ref.id.slice(0, 8) });
      const ta = row.querySelector('textarea') as HTMLTextAreaElement;
      ta.value = m.url;
      const cp = row.querySelector('[data-action="copy-media"]') as HTMLButtonElement;
      cp.addEventListener('click', () => copyText(m.url, cp));
      mediaList.appendChild(row);
    }
    const lock = password ? ' · 🔒' : '';
    mediaMeta.textContent = t('share.media.summary', {
      count: media.length,
      kb: (total / 1024).toFixed(1),
      lock,
    });
  }
}

async function copyText(
  text: string,
  btn: HTMLButtonElement,
  opts: { silent?: boolean } = {},
) {
  try {
    await navigator.clipboard.writeText(text);
    if (opts.silent) return;
    const original = btn.textContent;
    btn.textContent = t('share.copied');
    setTimeout(() => {
      btn.textContent = original;
    }, 1500);
  } catch {
    // Fallback: select the nearest textarea for manual copy.
    const ta = btn.parentElement?.querySelector('textarea') as HTMLTextAreaElement | null;
    ta?.select();
  }
}

function kb(n: number): string {
  return (n / 1024).toFixed(1);
}

function autoPartCount(urlBytes: number): number {
  // Aim each part well below the limit, with overhead headroom.
  const target = URL_MAX_BYTES * 0.75;
  return Math.max(2, Math.min(12, Math.ceil(urlBytes / target)));
}
