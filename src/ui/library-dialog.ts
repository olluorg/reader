import { list, remove, record, type LibraryEntry, type LibraryKind } from '../storage/library';
import { t, formatRelative } from '../i18n';
import type { Mode } from '../types';

function specFor(kind: LibraryKind): { title: string; desc: string; empty: string } {
  switch (kind) {
    case 'history':
      return {
        title: t('library.history.title'),
        desc: t('library.history.desc'),
        empty: t('library.history.empty'),
      };
    case 'saved':
      return {
        title: t('library.saved.title'),
        desc: t('library.saved.desc'),
        empty: t('library.saved.empty'),
      };
    case 'mine':
      return {
        title: t('library.mine.title'),
        desc: t('library.mine.desc'),
        empty: t('library.mine.empty'),
      };
  }
}

export function openLibraryDialog(kind: LibraryKind): void {
  const backdrop = document.createElement('div');
  backdrop.className = 'dialog-backdrop';

  const dialog = document.createElement('div');
  dialog.className = 'dialog dialog--library';
  const spec = specFor(kind);
  dialog.innerHTML = `
    <h2 class="dialog__title"></h2>
    <p class="dialog__desc"></p>
    <div class="library" data-role="library" aria-live="polite"></div>
    <div class="dialog__actions">
      <button class="btn btn--ghost" data-action="close"></button>
    </div>
  `;
  (dialog.querySelector('.dialog__title') as HTMLElement).textContent = spec.title;
  (dialog.querySelector('.dialog__desc') as HTMLElement).textContent = spec.desc;
  (dialog.querySelector('[data-action="close"]') as HTMLElement).textContent =
    t('library.btn.close');

  backdrop.appendChild(dialog);
  document.body.appendChild(backdrop);

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

  const listEl = dialog.querySelector('[data-role="library"]') as HTMLElement;

  const refresh = async () => {
    const entries = await list(kind);
    if (!entries.length) {
      listEl.innerHTML = '';
      const empty = document.createElement('p');
      empty.className = 'library__empty';
      empty.textContent = spec.empty;
      listEl.appendChild(empty);
      return;
    }
    const savedSet = new Set<string>();
    if (kind !== 'saved') {
      const saved = await list('saved');
      for (const e of saved) savedSet.add(e.hash);
    }
    listEl.innerHTML = '';
    for (const entry of entries) {
      listEl.appendChild(renderRow(kind, entry, savedSet.has(entry.hash), refresh, close));
    }
  };

  refresh();
}

function renderRow(
  kind: LibraryKind,
  entry: LibraryEntry,
  alreadySaved: boolean,
  refresh: () => void,
  close: () => void,
): HTMLElement {
  const row = document.createElement('div');
  row.className = 'library__row';
  const isSaved = kind === 'saved' || alreadySaved;
  row.innerHTML = `
    <button class="library__open" data-action="open">
      <span class="library__title"></span>
      <span class="library__meta">
        <span class="library__badge library__badge--${entry.mode}"></span>
        ${entry.encrypted ? '<span class="library__badge library__badge--lock">🔒</span>' : ''}
        <span class="library__size"></span>
        <span class="library__when"></span>
      </span>
    </button>
    <div class="library__actions">
      <button class="library__icon" data-action="bookmark" aria-pressed="${isSaved}">${isSaved ? '★' : '☆'}</button>
      <button class="library__icon library__icon--danger" data-action="delete">×</button>
    </div>
  `;

  (row.querySelector('.library__open') as HTMLElement).title = t('library.row.open');
  (row.querySelector('.library__title') as HTMLElement).textContent = entry.title;
  (row.querySelector(`.library__badge--${entry.mode}`) as HTMLElement).textContent =
    modeLabel(entry.mode);
  (row.querySelector('.library__size') as HTMLElement).textContent = formatSize(entry.size);
  (row.querySelector('.library__when') as HTMLElement).textContent = formatRelative(
    entry.updatedAt,
  );
  const bookmarkBtn = row.querySelector('[data-action="bookmark"]') as HTMLElement;
  bookmarkBtn.title = isSaved ? t('library.row.unsave') : t('library.row.save');
  (row.querySelector('[data-action="delete"]') as HTMLElement).title =
    t('library.row.delete');

  row.querySelector('[data-action="open"]')!.addEventListener('click', () => {
    close();
    if (location.hash === '#' + entry.hash) {
      location.reload();
    } else {
      location.hash = entry.hash;
    }
  });

  row.querySelector('[data-action="bookmark"]')!.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (isSaved) {
      await remove('saved', entry.hash);
      notifyLibraryChanged();
    } else {
      await record('saved', {
        hash: entry.hash,
        url: entry.url,
        title: entry.title,
        mode: entry.mode,
        encrypted: entry.encrypted,
        size: entry.size,
        // Preserve the manifest so the media GC sweeper sees it covered.
        mediaIds: entry.mediaIds,
      });
    }
    refresh();
  });

  row.querySelector('[data-action="delete"]')!.addEventListener('click', async (e) => {
    e.stopPropagation();
    await remove(kind, entry.hash);
    notifyLibraryChanged();
    refresh();
  });

  return row;
}

function notifyLibraryChanged() {
  // Decoupled signal so main.ts can run media GC without library-dialog
  // having to know about the media store directly.
  window.dispatchEvent(new CustomEvent('reader-library-changed'));
}

function modeLabel(mode: Mode): string {
  if (mode === 'view') return t('library.mode.view');
  if (mode === 'comment') return t('library.mode.comment');
  return t('library.mode.edit');
}

function formatSize(chars: number): string {
  if (chars < 1024) return t('library.size.chars', { n: chars });
  return t('library.size.kb', { n: (chars / 1024).toFixed(1) });
}
