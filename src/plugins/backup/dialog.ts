import { showToast } from '../../ui/toast';
import { t } from './i18n';
import {
  applySnapshot,
  buildSnapshot,
  defaultBackupName,
  downloadBlob,
  pickFileText,
  type ReaderSnapshot,
} from './snapshot';

export function openBackupDialog(): void {
  const backdrop = document.createElement('div');
  backdrop.className = 'dialog-backdrop';

  const dialog = document.createElement('div');
  dialog.className = 'dialog dialog--narrow';
  dialog.innerHTML = `
    <h2 class="dialog__title">${t('dialog.title')}</h2>
    <p class="dialog__desc">${t('dialog.desc')}</p>

    <div class="dialog__field">
      <span class="dialog__label">${t('field.export')}</span>
      <button class="btn btn--primary" data-action="export">${t('btn.download')}</button>
    </div>

    <div class="dialog__field">
      <span class="dialog__label">${t('field.restore')}</span>
      <div style="display: flex; gap: 8px; flex-wrap: wrap">
        <button class="btn btn--ghost" data-action="import-merge">${t('btn.merge')}</button>
        <button class="btn btn--ghost" data-action="import-replace">${t('btn.replace')}</button>
      </div>
      <div class="dialog__hint">${t('restore.hint')}</div>
    </div>

    <div class="dialog__actions">
      <button class="btn btn--ghost" data-action="close">${t('btn.close')}</button>
    </div>
  `;

  backdrop.appendChild(dialog);
  document.body.appendChild(backdrop);

  const exportBtn = dialog.querySelector('[data-action="export"]') as HTMLButtonElement;
  const mergeBtn = dialog.querySelector('[data-action="import-merge"]') as HTMLButtonElement;
  const replaceBtn = dialog.querySelector('[data-action="import-replace"]') as HTMLButtonElement;
  const closeBtn = dialog.querySelector('[data-action="close"]') as HTMLButtonElement;

  exportBtn.addEventListener('click', async () => {
    exportBtn.disabled = true;
    try {
      const snapshot = await buildSnapshot();
      const json = JSON.stringify(snapshot, null, 2);
      const name = defaultBackupName();
      downloadBlob(name, json);
      const sizeKB = (json.length / 1024).toFixed(1);
      showToast(t('export.done', { name, kb: sizeKB }), { kind: 'success' });
    } catch (err) {
      showToast(t('export.failed', { message: (err as Error).message }), { kind: 'error' });
    } finally {
      exportBtn.disabled = false;
    }
  });

  const runImport = async (mode: 'merge' | 'replace') => {
    if (mode === 'replace' && !confirm(t('replace.confirm'))) {
      return;
    }
    try {
      const text = await pickFileText();
      let parsed: ReaderSnapshot;
      try {
        parsed = JSON.parse(text) as ReaderSnapshot;
      } catch {
        showToast(t('import.badJson'), { kind: 'error' });
        return;
      }
      await applySnapshot(parsed, { mode });
      showToast(
        mode === 'replace' ? t('import.replaced') : t('import.merged'),
        { kind: 'success' },
      );
    } catch (err) {
      const msg = (err as Error).message;
      if (msg === 'cancelled') return;
      showToast(t('import.failed', { message: msg }), { kind: 'error' });
    }
  };

  mergeBtn.addEventListener('click', () => void runImport('merge'));
  replaceBtn.addEventListener('click', () => void runImport('replace'));

  const close = () => backdrop.remove();
  closeBtn.addEventListener('click', close);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Escape') close();
    },
    { once: true },
  );
}
