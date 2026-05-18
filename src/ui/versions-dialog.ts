/**
 * Versions panel — shows each saved version (created when the author shared
 * with "Save version" enabled) and the line-level diff against the previous
 * version (or against an empty document for the first version).
 */

import type { DocumentVersion } from '../types';
import { diffLines, diffStats } from '../share/diff';
import { t, lang } from '../i18n';

export interface VersionsDialogOptions {
  versions: DocumentVersion[];
  /** Markdown of the doc as it is right now — diffs the latest version against this. */
  currentMarkdown: string;
}

export function openVersionsDialog(opts: VersionsDialogOptions): void {
  const backdrop = document.createElement('div');
  backdrop.className = 'dialog-backdrop';

  const dialog = document.createElement('div');
  dialog.className = 'dialog dialog--versions';
  dialog.innerHTML = `
    <h2 class="dialog__title"></h2>
    <p class="dialog__desc"></p>
    <div class="versions" data-role="list"></div>
    <div class="dialog__actions">
      <button class="btn btn--ghost" data-action="close"></button>
    </div>
  `;
  (dialog.querySelector('.dialog__title') as HTMLElement).textContent = t('versions.title');
  (dialog.querySelector('.dialog__desc') as HTMLElement).textContent =
    opts.versions.length === 0
      ? t('versions.empty')
      : t('versions.summary', { count: opts.versions.length });
  (dialog.querySelector('[data-action="close"]') as HTMLElement).textContent =
    t('versions.btn.close');

  backdrop.appendChild(dialog);
  document.body.appendChild(backdrop);

  const list = dialog.querySelector('[data-role="list"]') as HTMLElement;
  const sorted = [...opts.versions].sort((a, b) => a.createdAt - b.createdAt);

  // Render diffs newest-first. Each version's diff is against its predecessor;
  // the very latest also gets a "since latest version" entry comparing to
  // current markdown, when the author edited after the last save.
  if (opts.currentMarkdown && sorted.length > 0) {
    const latest = sorted[sorted.length - 1];
    if (latest.markdown !== opts.currentMarkdown) {
      list.appendChild(
        renderEntry(t('versions.unsaved'), null, latest.markdown, opts.currentMarkdown, true),
      );
    }
  }

  for (let i = sorted.length - 1; i >= 0; i--) {
    const v = sorted[i];
    const prev = i > 0 ? sorted[i - 1].markdown : '';
    list.appendChild(renderEntry(formatTime(v.createdAt), v.label, prev, v.markdown, false));
  }

  const close = () => {
    backdrop.remove();
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
  };
  document.addEventListener('keydown', onKey);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });
  dialog.querySelector('[data-action="close"]')!.addEventListener('click', close);
}

function renderEntry(
  title: string,
  label: string | null | undefined,
  before: string,
  after: string,
  unsaved: boolean,
): HTMLElement {
  const hunks = diffLines(before, after);
  const stats = diffStats(hunks);

  const entry = document.createElement('details');
  entry.className = `versions__entry${unsaved ? ' versions__entry--unsaved' : ''}`;
  // Expand the newest entry by default.
  if (unsaved || (!unsaved && before === '')) entry.open = true;

  const summary = document.createElement('summary');
  summary.className = 'versions__summary';
  summary.innerHTML = `
    <span class="versions__title"></span>
    ${label ? '<span class="versions__label"></span>' : ''}
    <span class="versions__stats">
      <span class="versions__stat versions__stat--add">+${stats.added}</span>
      <span class="versions__stat versions__stat--del">−${stats.removed}</span>
    </span>
  `;
  (summary.querySelector('.versions__title') as HTMLElement).textContent = title;
  if (label) {
    (summary.querySelector('.versions__label') as HTMLElement).textContent = label;
  }
  entry.appendChild(summary);

  if (stats.added === 0 && stats.removed === 0) {
    const empty = document.createElement('div');
    empty.className = 'versions__empty';
    empty.textContent = t('versions.noChanges');
    entry.appendChild(empty);
    return entry;
  }

  const diffEl = document.createElement('pre');
  diffEl.className = 'versions__diff';
  for (const h of hunks) {
    const line = document.createElement('div');
    line.className = `versions__line versions__line--${h.op}`;
    line.textContent =
      (h.op === 'add' ? '+ ' : h.op === 'del' ? '− ' : '  ') + h.text;
    diffEl.appendChild(line);
  }
  entry.appendChild(diffEl);
  return entry;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString(lang === 'ru' ? 'ru-RU' : undefined);
}
