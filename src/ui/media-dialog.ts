/**
 * Modal that helps the recipient fill in the images a shared document refers
 * to. Each `MediaRef` becomes one slot. The user can EITHER:
 *
 *   - paste a `reader-media:` share URL (exact match by id), or
 *   - drop / pick the original file from disk (matched by perceptual hash,
 *     so a Telegram-recompressed copy still lines up).
 *
 * Mirrors the look-and-feel of parts-dialog.ts so users see one consistent
 * "complete the document" experience.
 */

import type { MediaRef } from '../types';
import { t } from '../i18n';

export type LoadByUrlFn = (hash: string) => Promise<
  | { ok: true; id: string }
  | { ok: false; error: string }
>;

export type ImportFileFn = (file: File) => Promise<
  | { ok: true; id: string; distance: number }
  | { ok: false; error: string }
>;

export interface MediaDialogOptions {
  refs: MediaRef[];
  loadedIds: Set<string>;
  loadByUrl: LoadByUrlFn;
  importFile: ImportFileFn;
  /** Optional: focus a specific slot when opening. */
  focusId?: string;
}

export function openMediaDialog(opts: MediaDialogOptions): void {
  const backdrop = document.createElement('div');
  backdrop.className = 'dialog-backdrop';

  const dialog = document.createElement('div');
  dialog.className = 'dialog dialog--parts';

  const missingCount = opts.refs.filter((r) => !opts.loadedIds.has(r.id)).length;
  const imagesWord = t('media.imagesWord', { count: opts.refs.length });
  const descHtml =
    missingCount > 0
      ? t('media.desc.missing', {
          total: opts.refs.length,
          imagesWord,
          missing: missingCount,
        })
      : t('media.desc.allLoaded', { total: opts.refs.length, imagesWord });
  dialog.innerHTML = `
    <h2 class="dialog__title"></h2>
    <p class="dialog__desc">${descHtml}</p>
    <div class="parts-grid" data-role="grid"></div>
    <div class="dialog__actions">
      <button class="btn btn--ghost" data-action="skip"></button>
      <button class="btn btn--primary" data-action="done"></button>
    </div>
  `;
  (dialog.querySelector('.dialog__title') as HTMLElement).textContent = t('media.title');
  (dialog.querySelector('[data-action="skip"]') as HTMLElement).textContent =
    t('media.btn.skip');
  (dialog.querySelector('[data-action="done"]') as HTMLElement).textContent =
    t('media.btn.done');

  backdrop.appendChild(dialog);
  document.body.appendChild(backdrop);

  const grid = dialog.querySelector('[data-role="grid"]') as HTMLElement;

  // Only show rows for missing images — already-loaded ones don't need user
  // attention. After a successful load below, we collapse-and-remove the row
  // to drive the same end state.
  for (let i = 0; i < opts.refs.length; i++) {
    const ref = opts.refs[i];
    if (opts.loadedIds.has(ref.id)) continue;
    const row = document.createElement('div');
    row.className = 'parts-grid__row';
    row.dataset.id = ref.id;
    row.innerHTML = `
      <div class="parts-grid__head">
        <span class="parts-grid__badge">${i + 1} / ${opts.refs.length}</span>
        <span class="parts-grid__title"></span>
        <span class="parts-grid__status" data-role="status"></span>
      </div>
      <input class="dialog__input parts-grid__input"
             type="text"
             autocomplete="off"
             spellcheck="false">
      <label class="dialog__file dialog__file--compact" data-role="drop">
        <input type="file" accept="image/*" hidden>
        <span data-role="file-label"></span>
      </label>
    `;
    (row.querySelector('.parts-grid__title') as HTMLElement).textContent =
      ref.name ?? t('media.fallbackTitle', { n: i + 1 });
    (row.querySelector('[data-role="status"]') as HTMLElement).textContent =
      t('media.status.empty');
    const textInput = row.querySelector('input[type="text"]') as HTMLInputElement | null;
    if (textInput) textInput.placeholder = t('media.input.placeholder');
    const fileLabel = row.querySelector('[data-role="file-label"]') as HTMLElement | null;
    if (fileLabel) fileLabel.textContent = t('media.file.placeholder');
    grid.appendChild(row);
  }

  // If user opened the dialog with everything already loaded, the body is
  // empty — show a "done" state instead of an awkward blank grid.
  maybeRenderEmptyState();

  const finish = () => {
    backdrop.remove();
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') finish();
  };
  document.addEventListener('keydown', onKey);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) finish();
  });
  dialog.querySelector('[data-action="skip"]')!.addEventListener('click', finish);
  dialog.querySelector('[data-action="done"]')!.addEventListener('click', finish);

  // URL input — try on paste / blur / change.
  grid.querySelectorAll<HTMLInputElement>('.parts-grid__input').forEach((input) => {
    const tryLoad = async () => {
      const raw = input.value.trim();
      if (!raw) return;
      const hash = extractHash(raw);
      if (!hash) {
        setStatus(input, t('media.status.notReader'), 'error');
        return;
      }
      setStatus(input, t('media.status.loading'), 'pending');
      const res = await opts.loadByUrl(hash);
      if (res.ok) {
        const row = input.closest('.parts-grid__row') as HTMLElement | null;
        if (row) removeRowWithFlash(row, t('media.status.loaded'));
      } else {
        setStatus(input, res.error, 'error');
      }
    };
    input.addEventListener('paste', () => setTimeout(tryLoad, 0));
    input.addEventListener('change', tryLoad);
    input.addEventListener('blur', tryLoad);
  });

  // File picker / drag-drop.
  grid.querySelectorAll<HTMLElement>('[data-role="drop"]').forEach((drop) => {
    const row = drop.closest('.parts-grid__row') as HTMLElement;
    const fileInput = drop.querySelector('input[type="file"]') as HTMLInputElement;
    const handle = async (file: File | undefined) => {
      if (!file) return;
      setRowStatus(row, t('media.status.importing'), 'pending');
      const res = await opts.importFile(file);
      if (res.ok) {
        // importFile may have matched a *different* slot (dHash redirected
        // the file to its canonical id). Remove the matched row, not the
        // dropped-on one.
        const matchedRow = grid.querySelector(
          `.parts-grid__row[data-id="${res.id}"]`,
        ) as HTMLElement | null;
        const target = matchedRow ?? row;
        const flash =
          res.distance === 0
            ? t('media.status.imported')
            : t('media.status.importedFuzzy', { match: 64 - res.distance });
        removeRowWithFlash(target, flash);
      } else {
        setRowStatus(row, res.error, 'error');
      }
    };
    fileInput.addEventListener('change', () => handle(fileInput.files?.[0]));
    drop.addEventListener('dragover', (e) => {
      e.preventDefault();
      drop.classList.add('dialog__file--dragover');
    });
    drop.addEventListener('dragleave', () => {
      drop.classList.remove('dialog__file--dragover');
    });
    drop.addEventListener('drop', (e) => {
      e.preventDefault();
      drop.classList.remove('dialog__file--dragover');
      handle(e.dataTransfer?.files?.[0]);
    });
  });

  if (opts.focusId) {
    const row = grid.querySelector(
      `.parts-grid__row[data-id="${opts.focusId}"]`,
    ) as HTMLElement | null;
    const input = row?.querySelector('input[type="text"]') as HTMLInputElement | null;
    input?.focus();
  } else {
    const firstInput = grid.querySelector('input[type="text"]') as HTMLInputElement | null;
    firstInput?.focus();
  }

  /**
   * Briefly show a success status on the row, then collapse-and-remove it.
   * Two-phase: first we paint the success state (so the user sees what just
   * happened), then a short delay, then `--exiting` runs the CSS transition,
   * then the node leaves the DOM.
   */
  function removeRowWithFlash(row: HTMLElement, successMsg: string) {
    setRowStatus(row, successMsg, 'ok');
    row.classList.add('parts-grid__row--loaded');
    // Disable any remaining inputs so further events from this row are inert.
    row.querySelectorAll<HTMLInputElement>('input').forEach((el) => {
      el.disabled = true;
    });
    setTimeout(() => {
      row.classList.add('parts-grid__row--exiting');
      const onEnd = () => {
        row.remove();
        maybeRenderEmptyState();
      };
      row.addEventListener('transitionend', onEnd, { once: true });
      // Hard fallback if no transition fires (reduced-motion, missing CSS).
      setTimeout(() => {
        if (row.isConnected) onEnd();
      }, 420);
    }, 600);
  }

  function maybeRenderEmptyState() {
    if (grid.querySelector('.parts-grid__row')) return;
    if (grid.querySelector('.parts-grid__empty')) return;
    const empty = document.createElement('div');
    empty.className = 'parts-grid__empty';
    // innerHTML, not textContent — the translation contains <strong>{total}</strong>
    // and we want it parsed as markup. Both placeholders are constrained:
    // `total` is a number, `imagesWord` is a sibling translation we control.
    empty.innerHTML = t('media.desc.allLoaded', {
      total: opts.refs.length,
      imagesWord,
    });
    grid.appendChild(empty);
  }
}

function setStatus(input: HTMLInputElement, text: string, kind: 'ok' | 'pending' | 'error') {
  const row = input.closest('.parts-grid__row');
  if (!row) return;
  setRowStatus(row as HTMLElement, text, kind);
}

function setRowStatus(row: HTMLElement, text: string, kind: 'ok' | 'pending' | 'error') {
  const status = row.querySelector('[data-role="status"]') as HTMLElement | null;
  if (!status) return;
  status.textContent = text;
  status.dataset.state = kind;
}

function extractHash(input: string): string | null {
  const hashIdx = input.indexOf('#');
  if (hashIdx >= 0) return input.slice(hashIdx + 1).trim() || null;
  if (/^[A-Za-z0-9_-]+$/.test(input)) return input;
  return null;
}
