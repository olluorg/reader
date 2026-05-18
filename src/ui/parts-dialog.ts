/**
 * Modal that asks the user to paste the remaining links of a split document.
 *
 * Shown on open when we land on a part-URL. The user can:
 *   - paste any sibling part URLs (or whole `#hash`es) into the per-slot inputs
 *   - skip — in which case missing parts render as "..." inline placeholders
 *     with an "Add link" affordance that re-opens this dialog focused on that slot.
 */

import type { PartHeader } from '../types';
import { t } from '../i18n';

export type LoadPartFn = (hash: string) => Promise<
  | { ok: true; index: number }
  | { ok: false; error: string }
>;

export interface PartsDialogOptions {
  header: PartHeader;
  /** indices of parts that are already loaded (always includes the current one) */
  loadedIndices: Set<number>;
  /** Called when the user pastes a hash for a missing slot. */
  loadPart: LoadPartFn;
  /** Optional: focus a specific slot when opening (used by inline placeholders). */
  focusIndex?: number;
}

export function openPartsDialog(opts: PartsDialogOptions): void {
  const backdrop = document.createElement('div');
  backdrop.className = 'dialog-backdrop';

  const dialog = document.createElement('div');
  dialog.className = 'dialog dialog--parts';

  const missingCount = opts.header.total - opts.loadedIndices.size;
  const descHtml =
    missingCount > 0
      ? t('partsDialog.desc.missing', { total: opts.header.total, missing: missingCount })
      : t('partsDialog.desc.allLoaded', { total: opts.header.total });
  dialog.innerHTML = `
    <h2 class="dialog__title"></h2>
    <p class="dialog__desc">${descHtml}</p>
    <div class="parts-grid" data-role="grid"></div>
    <div class="dialog__actions">
      <button class="btn btn--ghost" data-action="skip"></button>
      <button class="btn btn--primary" data-action="done"></button>
    </div>
  `;
  (dialog.querySelector('.dialog__title') as HTMLElement).textContent =
    t('partsDialog.title');
  (dialog.querySelector('[data-action="skip"]') as HTMLElement).textContent =
    t('partsDialog.btn.skip');
  (dialog.querySelector('[data-action="done"]') as HTMLElement).textContent =
    t('partsDialog.btn.done');

  backdrop.appendChild(dialog);
  document.body.appendChild(backdrop);

  const grid = dialog.querySelector('[data-role="grid"]') as HTMLElement;

  for (let i = 0; i < opts.header.total; i++) {
    const isLoaded = opts.loadedIndices.has(i);
    const row = document.createElement('div');
    row.className = `parts-grid__row${isLoaded ? ' parts-grid__row--loaded' : ''}`;
    row.dataset.index = String(i);
    row.innerHTML = `
      <div class="parts-grid__head">
        <span class="parts-grid__badge">${i + 1} / ${opts.header.total}</span>
        <span class="parts-grid__title"></span>
        <span class="parts-grid__status" data-role="status"></span>
      </div>
      ${isLoaded
        ? ''
        : `<input class="dialog__input parts-grid__input"
                 type="text"
                 autocomplete="off"
                 spellcheck="false">`}
    `;
    (row.querySelector('.parts-grid__title') as HTMLElement).textContent =
      opts.header.partTitles[i] ?? t('parts.missing.fallbackTitle', { n: i + 1 });
    (row.querySelector('[data-role="status"]') as HTMLElement).textContent = isLoaded
      ? t('partsDialog.status.loaded')
      : t('partsDialog.status.empty');
    const input = row.querySelector('input.parts-grid__input') as HTMLInputElement | null;
    if (input) input.placeholder = t('partsDialog.input.placeholder');
    grid.appendChild(row);
  }

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

  // Try to load on paste — best UX: paste a URL and it just works.
  grid.querySelectorAll<HTMLInputElement>('.parts-grid__input').forEach((input) => {
    const tryLoad = async () => {
      const raw = input.value.trim();
      if (!raw) return;
      const hash = extractHash(raw);
      if (!hash) {
        setStatus(input, t('partsDialog.status.notReader'), 'error');
        return;
      }
      setStatus(input, t('partsDialog.status.loading'), 'pending');
      const res = await opts.loadPart(hash);
      if (res.ok) {
        const row = input.closest('.parts-grid__row') as HTMLElement;
        row.classList.add('parts-grid__row--loaded');
        setStatus(input, t('partsDialog.status.loaded'), 'ok');
        input.disabled = true;
      } else {
        setStatus(input, res.error, 'error');
      }
    };
    input.addEventListener('paste', () => setTimeout(tryLoad, 0));
    input.addEventListener('change', tryLoad);
    input.addEventListener('blur', tryLoad);
  });

  if (opts.focusIndex !== undefined) {
    const row = grid.querySelector(
      `.parts-grid__row[data-index="${opts.focusIndex}"]`,
    ) as HTMLElement | null;
    const input = row?.querySelector('input') as HTMLInputElement | null;
    input?.focus();
  } else {
    const firstInput = grid.querySelector('input') as HTMLInputElement | null;
    firstInput?.focus();
  }
}

function setStatus(input: HTMLInputElement, text: string, kind: 'ok' | 'pending' | 'error') {
  const row = input.closest('.parts-grid__row');
  const status = row?.querySelector('[data-role="status"]') as HTMLElement | null;
  if (!status) return;
  status.textContent = text;
  status.dataset.state = kind;
}

function extractHash(input: string): string | null {
  const hashIdx = input.indexOf('#');
  if (hashIdx >= 0) return input.slice(hashIdx + 1).trim() || null;
  // Accept a bare hash too.
  if (/^[A-Za-z0-9_-]+$/.test(input)) return input;
  return null;
}
